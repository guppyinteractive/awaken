// Saved data. Each tool keeps one IndexedDB record, stored as
// {version, savedAt, data}. The version lets an app update upgrade old data
// step by step (design/ux-plan.md, Data safety).

export type RecordName = 'fight' | 'hunters' | 'campaign' | 'role';

export interface Stored {
  version: number;
  /** ISO time of the save; empty for data imported from the wireframe. */
  savedAt: string;
  data: unknown;
}

type Upgrade = (data: any) => unknown;

/**
 * UPGRADES[name][i] turns version i+1 into version i+2. Once shipped, never
 * edit or remove one; add the next step instead, with a fixture of the old
 * version in src/shared/fixtures/.
 */
export const UPGRADES: Record<RecordName, Upgrade[]> = {
  fight: [],
  hunters: [],
  campaign: [
    // v1 → v2: early wireframe builds stored trophies as {name, won} objects.
    (c: { trophies: unknown[] }) => ({
      ...c,
      trophies: c.trophies.flatMap((t) =>
        typeof t === 'string' ? [t] : (t as { won: boolean }).won ? [(t as { name: string }).name] : []),
    }),
  ],
  role: [],
};

export const currentVersion = (name: RecordName): number => UPGRADES[name].length + 1;

/** Bring stored data up to the current version. Throws if it can't. */
export function upgrade(name: RecordName, stored: Pick<Stored, 'version' | 'data'>): unknown {
  const current = currentVersion(name);
  const from = stored.version;
  if (!Number.isInteger(from) || from < 1 || from > current) {
    throw new Error(`${name}: this app reads versions 1–${current}, not ${from}`);
  }
  let data = stored.data;
  for (let v = from; v < current; v++) data = UPGRADES[name][v - 1](data);
  return data;
}

const DB_NAME = 'awaken';
const STORE = 'records';
/** Where the wireframe kept each record in localStorage. */
export const legacyKey = (name: RecordName) => `awaken.wire.${name}.v1`;
/** The record as it was before its last upgrade, kept until a load needs no upgrade. */
export const preUpgradeKey = (name: RecordName) => `${name}:pre-upgrade`;
/** A record this version of the app could not read, kept instead of overwritten. */
export const unreadableKey = (name: RecordName) => `${name}:unreadable`;
/** When the player last made (or restored) a backup: {at: ISO time}. */
export const BACKUP_KEY = 'backup';

export interface Deps {
  idb?: IDBFactory;
  local?: Storage;
}

export interface Store {
  load<T>(name: RecordName, fallback: T): Promise<T>;
  /** Save a copy of `data`. Saves apply in the order they are called. */
  save(name: RecordName, data: unknown): Promise<void>;
  /** A problem the player should know about, or null. */
  warning(): string | null;
  /** Every record as stored, with its version, for a backup file. */
  exportAll(): Promise<Partial<Record<RecordName, Stored>>>;
  /**
   * Replace the given records (others are kept) and set the last backup time,
   * all at once. Throws, changing nothing, if a record can't be read.
   */
  restore(records: Partial<Record<RecordName, Stored>>, backedUpAt: string): Promise<void>;
  /** ISO time of the last backup, or null if never. */
  backedUpAt(): Promise<string | null>;
  markBackedUp(at?: string): Promise<void>;
}

type Op = [key: string, value: Stored | { at: string } | undefined];

export function createStore(deps: Deps): Store {
  let warning: string | null = null;
  let opened: Promise<IDBDatabase | null> | null = null;
  const memory = new Map<string, any>();

  const NOT_SAVED = 'This browser is not saving your progress. It will be lost when you close this page. Open the app in your normal browser, or install it.';

  function open(): Promise<IDBDatabase | null> {
    opened ??= new Promise<IDBDatabase | null>((resolve) => {
      try {
        const req = deps.idb!.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null); // No IndexedDB at all.
      }
    }).then((db) => {
      if (!db) warning = NOT_SAVED;
      return db;
    });
    return opened;
  }

  function get<T = Stored>(db: IDBDatabase, key: string): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  }

  /** Apply puts (and deletes, for undefined) in one transaction. */
  function write(db: IDBDatabase, ops: Op[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const s = tx.objectStore(STORE);
      for (const [key, value] of ops) {
        if (value === undefined) s.delete(key);
        else s.put(value, key);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  function readLegacy(name: RecordName): unknown {
    try {
      const raw = deps.local?.getItem(legacyKey(name));
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return undefined;
    }
  }

  function clearLegacy(name: RecordName): void {
    try {
      deps.local?.removeItem(legacyKey(name));
    } catch {
      // Nothing to clear.
    }
  }

  const wrap = (name: RecordName, data: unknown): Stored =>
    ({ version: currentVersion(name), savedAt: new Date().toISOString(), data });

  async function load<T>(name: RecordName, fallback: T): Promise<T> {
    const db = await open();
    let stored = db ? await get(db, name).catch(() => undefined) : memory.get(name);
    let imported = false;
    if (stored) {
      // IndexedDB holds the record, so the wireframe copy is no longer needed.
      if (db) clearLegacy(name);
    } else {
      const legacy = readLegacy(name);
      if (legacy === undefined) return fallback;
      stored = { version: 1, savedAt: '', data: legacy };
      imported = true;
    }

    let data: unknown;
    try {
      data = upgrade(name, stored);
    } catch {
      // Too new (an older copy of the app) or broken: keep it aside, start fresh.
      warning = 'Some saved progress could not be read by this version of the app. It has been kept on this device, and this page is starting fresh.';
      if (db) await write(db, [[unreadableKey(name), stored]]).catch(() => undefined);
      return fallback;
    }

    const upgraded = stored.version < currentVersion(name);
    if (db && (imported || upgraded)) {
      // Keep the old copy (localStorage, or the pre-upgrade record) until a
      // later load reads the new record without needing an upgrade.
      const ops: Op[] = [[name, wrap(name, data)]];
      if (upgraded && !imported) ops.unshift([preUpgradeKey(name), stored]);
      await write(db, ops).catch(() => undefined);
    } else if (db) {
      await write(db, [[preUpgradeKey(name), undefined]]).catch(() => undefined);
    }
    return data as T;
  }

  async function save(name: RecordName, data: unknown): Promise<void> {
    const record = wrap(name, structuredClone(data));
    const db = await open();
    if (!db) {
      memory.set(name, record);
      return;
    }
    try {
      await write(db, [[name, record]]);
    } catch {
      warning = 'Your latest change could not be saved on this device. The device may be out of storage.';
    }
  }

  /** Write to IndexedDB, or to memory when it's unavailable. */
  async function apply(ops: Op[]): Promise<void> {
    const db = await open();
    if (db) return write(db, ops);
    for (const [key, value] of ops) {
      if (value === undefined) memory.delete(key);
      else memory.set(key, value);
    }
  }

  async function read<T = Stored>(key: string): Promise<T | undefined> {
    const db = await open();
    return db ? get<T>(db, key) : memory.get(key);
  }

  async function exportAll(): Promise<Partial<Record<RecordName, Stored>>> {
    const out: Partial<Record<RecordName, Stored>> = {};
    for (const name of Object.keys(UPGRADES) as RecordName[]) {
      let stored = await read(name);
      if (!stored) {
        // Wireframe data whose page hasn't been opened since the move to IndexedDB.
        const legacy = readLegacy(name);
        if (legacy !== undefined) stored = { version: 1, savedAt: '', data: legacy };
      }
      if (stored) out[name] = stored;
    }
    return out;
  }

  async function restore(records: Partial<Record<RecordName, Stored>>, at: string): Promise<void> {
    const ops: Op[] = [];
    for (const [name, stored] of Object.entries(records) as [RecordName, Stored][]) {
      upgrade(name, stored); // throws before anything is written
      ops.push([name, structuredClone(stored)], [preUpgradeKey(name), undefined]);
    }
    ops.push([BACKUP_KEY, { at }]);
    await apply(ops);
    for (const name of Object.keys(records) as RecordName[]) clearLegacy(name);
  }

  const backedUpAt = async () => (await read<{ at: string }>(BACKUP_KEY).catch(() => undefined))?.at ?? null;
  const markBackedUp = (at = new Date().toISOString()) => apply([[BACKUP_KEY, { at }]]);

  return { load, save, warning: () => warning, exportAll, restore, backedUpAt, markBackedUp };
}

function localStorageOrNone(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined; // Access can throw when site data is blocked.
  }
}

const store = createStore({ idb: globalThis.indexedDB, local: localStorageOrNone() });

export const load = store.load;
export const save = store.save;
export const storageWarning = store.warning;
export const exportAll = store.exportAll;
export const restore = store.restore;
export const backedUpAt = store.backedUpAt;
export const markBackedUp = store.markBackedUp;
