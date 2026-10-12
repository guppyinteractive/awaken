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
}

type Op = [key: string, value: Stored | undefined];

export function createStore(deps: Deps): Store {
  let warning: string | null = null;
  let opened: Promise<IDBDatabase | null> | null = null;
  const memory = new Map<string, Stored>();

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

  function get(db: IDBDatabase, key: string): Promise<Stored | undefined> {
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as Stored | undefined);
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

  return { load, save, warning: () => warning };
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
