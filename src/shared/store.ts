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
  fight: [
    // v1 → v2: stances gained Resistant, Shield and bonus damage tokens.
    (d: { fight: { stances: object[] } | null; undo?: { stances: object[] }[] }) => {
      const up = <F extends { stances: object[] } | null>(f: F): F =>
        f && { ...f, stances: f.stances.map((s) => ({ ...s, resistant: false, shield: 0, bonusDamage: 0 })) };
      return { ...d, fight: up(d.fight), undo: (d.undo ?? []).map(up) };
    },
    // v2 → v3: fights gained the Hardening track (null = the monster has none).
    (d: { fight: object | null; undo?: object[] }) => {
      const up = <F extends object | null>(f: F): F => f && { ...f, hardening: null };
      return { ...d, fight: up(d.fight), undo: (d.undo ?? []).map(up) };
    },
    // v3 → v4: Acceleration went from a stacking state to a 0–4 count of tokens.
    (d: { fight: { states: string[] } | null; undo?: { states: string[] }[] }) => {
      const up = <F extends { states: string[] } | null>(f: F): F => f && {
        ...f,
        states: f.states.filter((s) => s !== 'acceleration'),
        acceleration: Math.min(4, f.states.filter((s) => s === 'acceleration').length),
      };
      return { ...d, fight: up(d.fight), undo: (d.undo ?? []).map(up) };
    },
  ],
  hunters: [],
  campaign: [
    // v1 → v2: early wireframe builds stored trophies as {name, won} objects.
    (c: { trophies: unknown[] }) => ({
      ...c,
      trophies: c.trophies.flatMap((t) =>
        typeof t === 'string' ? [t] : (t as { won: boolean }).won ? [(t as { name: string }).name] : []),
    }),
    // v2 → v3: quests went from done or not to locked, unlocked or completed.
    (c: { quests: boolean[] }) => ({ ...c, quests: c.quests.map((done) => (done ? 'completed' : 'locked')) }),
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
/** Left by builds before snapshots, which kept one copy from before an upgrade. Deleted on load. */
export const preUpgradeKey = (name: RecordName) => `${name}:pre-upgrade`;
/** Earlier copies of a record, newest first, so a mistake or bug can be rolled back. */
export const snapshotKey = (name: RecordName) => `${name}:snapshots`;
/** A record this version of the app could not read, kept instead of overwritten. */
export const unreadableKey = (name: RecordName) => `${name}:unreadable`;
/** When the player last made (or restored) a backup: {at: ISO time}. */
export const BACKUP_KEY = 'backup';

/** A copy of a record as it was before a session, a restore, or an app upgrade changed it. */
export interface Snapshot extends Stored {
  /** ISO time the copy was taken. */
  takenAt: string;
  reason: 'session' | 'restore' | 'upgrade';
}

/** Copies kept per record. */
export const SNAPSHOT_LIMIT = 5;
/** A session's first save takes a copy only if the newest one is older than this. */
export const SNAPSHOT_GAP_MS = 3 * 60 * 60 * 1000;
/** Records with copies. Today's choice isn't worth rolling back. */
export const SNAPSHOT_NAMES: RecordName[] = ['campaign', 'hunters', 'fight'];

/**
 * The write that adds `current` to the front of `list`, or none if there's
 * nothing to copy, it's already the newest copy, or (unless forced) the newest
 * copy is recent.
 */
export function snapshotOps(
  name: RecordName, current: Stored | undefined, list: Snapshot[] | undefined,
  reason: Snapshot['reason'], force: boolean, now = new Date(),
): Op[] {
  if (!current || !SNAPSHOT_NAMES.includes(name)) return [];
  const newest = list?.[0];
  if (newest && current.savedAt && newest.savedAt === current.savedAt) return [];
  if (!force && newest && now.getTime() - Date.parse(newest.takenAt) < SNAPSHOT_GAP_MS) return [];
  const copy: Snapshot = { version: current.version, savedAt: current.savedAt, data: current.data, takenAt: now.toISOString(), reason };
  return [[snapshotKey(name), [copy, ...(list ?? [])].slice(0, SNAPSHOT_LIMIT)]];
}

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
   * Replace the given records (others are kept), copying each one it replaces
   * to its snapshots, and set the last backup time if given, all at once.
   * Throws, changing nothing, if a record can't be read.
   */
  restore(records: Partial<Record<RecordName, Stored>>, backedUpAt?: string): Promise<void>;
  /** Every record's earlier copies, newest first. */
  snapshots(): Promise<{ name: RecordName; snapshot: Snapshot }[]>;
  /** ISO time of the last backup, or null if never. */
  backedUpAt(): Promise<string | null>;
  /** Stop saving, because another tab is in use. Until the page reloads, saves and restores do nothing. */
  pause(): void;
  markBackedUp(at?: string): Promise<void>;
}

type Op = [key: string, value: Stored | Snapshot[] | { at: string } | undefined];
/** Works out the writes from the current values of the keys it read. */
type Plan = (current: Map<string, any>) => Op[];

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

  /**
   * Apply puts (and deletes, for undefined) in one transaction. With a plan,
   * read `keys` first in the same transaction, so nothing can change between
   * the read and the write, and later saves still apply after this one.
   */
  function write(db: IDBDatabase, ops: Op[] | Plan, keys: string[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const s = tx.objectStore(STORE);
      const put = (list: Op[]) => {
        for (const [key, value] of list) {
          if (value === undefined) s.delete(key);
          else s.put(value, key);
        }
      };
      if (typeof ops !== 'function') put(ops);
      else if (!keys.length) put(ops(new Map()));
      else {
        const current = new Map<string, any>();
        for (const key of keys) {
          const req = s.get(key);
          req.onsuccess = () => {
            current.set(key, req.result);
            if (current.size === keys.length) put(ops(current));
          };
        }
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
      // Keep the old copy: localStorage until a later load finds the new
      // record, or a snapshot of the record from before the upgrade.
      const old = stored;
      const record = wrap(name, data);
      await write(db, imported ? [[name, record]] : (cur) => [
        ...snapshotOps(name, old, cur.get(snapshotKey(name)), 'upgrade', true),
        [name, record],
      ], imported ? [] : [snapshotKey(name)]).catch(() => undefined);
    } else if (db) {
      await write(db, [[preUpgradeKey(name), undefined]]).catch(() => undefined);
    }
    return data as T;
  }

  /** Records saved since this page opened; the first save of each may take a snapshot. */
  const savedThisSession = new Set<RecordName>();

  let paused = false;

  async function save(name: RecordName, data: unknown): Promise<void> {
    if (paused) return;
    const record = wrap(name, structuredClone(data));
    const first = !savedThisSession.has(name);
    savedThisSession.add(name);
    const plan: Plan = (cur) => [
      ...(first ? snapshotOps(name, cur.get(name), cur.get(snapshotKey(name)), 'session', false) : []),
      [name, record],
    ];
    try {
      await apply(plan, first ? [name, snapshotKey(name)] : []);
    } catch {
      warning = 'Your latest change could not be saved on this device. The device may be out of storage.';
    }
  }

  /** Write to IndexedDB, or to memory when it's unavailable. */
  async function apply(ops: Op[] | Plan, keys: string[] = []): Promise<void> {
    const db = await open();
    if (db) return write(db, ops, keys);
    if (typeof ops === 'function') ops = ops(new Map(keys.map((k) => [k, memory.get(k)])));
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

  async function restore(records: Partial<Record<RecordName, Stored>>, at?: string): Promise<void> {
    if (paused) throw new Error('Another tab is in use.');
    const entries = Object.entries(records) as [RecordName, Stored][];
    for (const [name, stored] of entries) upgrade(name, stored); // throws before anything is written
    const plan: Plan = (cur) => {
      const ops: Op[] = entries.flatMap(([name, stored]): Op[] => [
        ...snapshotOps(name, cur.get(name), cur.get(snapshotKey(name)), 'restore', true),
        [name, { version: stored.version, savedAt: stored.savedAt, data: structuredClone(stored.data) }],
      ]);
      if (at) ops.push([BACKUP_KEY, { at }]);
      return ops;
    };
    await apply(plan, entries.flatMap(([name]) => [name, snapshotKey(name)]));
    for (const name of Object.keys(records) as RecordName[]) clearLegacy(name);
  }

  async function snapshots(): Promise<{ name: RecordName; snapshot: Snapshot }[]> {
    const out: { name: RecordName; snapshot: Snapshot }[] = [];
    for (const name of SNAPSHOT_NAMES) {
      const list = await read<Snapshot[]>(snapshotKey(name)).catch(() => undefined);
      for (const snapshot of list ?? []) out.push({ name, snapshot });
    }
    return out.sort((a, b) => b.snapshot.takenAt.localeCompare(a.snapshot.takenAt));
  }

  const backedUpAt = async () => (await read<{ at: string }>(BACKUP_KEY).catch(() => undefined))?.at ?? null;
  const markBackedUp = async (at = new Date().toISOString()) => {
    if (!paused) await apply([[BACKUP_KEY, { at }]]);
  };

  return {
    load, save, warning: () => warning, exportAll, restore, snapshots, backedUpAt, markBackedUp,
    pause: () => { paused = true; },
  };
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
export const snapshots = store.snapshots;
export const backedUpAt = store.backedUpAt;
export const markBackedUp = store.markBackedUp;
export const pauseSaving = store.pause;
