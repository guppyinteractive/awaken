import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  UPGRADES, createStore, currentVersion, legacyKey, preUpgradeKey, unreadableKey, upgrade,
  type RecordName, type Stored,
} from './store';

const NAMES = Object.keys(UPGRADES) as RecordName[];

/** Saved examples of every version of every record, keyed like "campaign.v1". */
const FIXTURES = Object.fromEntries(
  Object.entries(import.meta.glob('./fixtures/*.json', { eager: true, import: 'default' }))
    .map(([path, data]) => [path.replace(/^.*\/|\.json$/g, ''), data]),
);

class MemoryStorage implements Storage {
  private items = new Map<string, string>();
  get length() { return this.items.size; }
  clear() { this.items.clear(); }
  getItem(key: string) { return this.items.get(key) ?? null; }
  key(i: number) { return [...this.items.keys()][i] ?? null; }
  removeItem(key: string) { this.items.delete(key); }
  setItem(key: string, value: string) { this.items.set(key, value); }
}

let idb: IDBFactory;
let local: MemoryStorage;
/** A fresh store on the same device, like reloading the page. */
const reload = () => createStore({ idb, local });

function raw(key: string): Promise<Stored | undefined> {
  return new Promise((resolve, reject) => {
    const req = idb.open('awaken', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('records');
    req.onsuccess = () => {
      const get = req.result.transaction('records').objectStore('records').get(key);
      get.onsuccess = () => { req.result.close(); resolve(get.result); };
      get.onerror = () => reject(get.error);
    };
  });
}

async function putRaw(key: string, value: Stored): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve) => {
    const req = idb.open('awaken', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('records');
    req.onsuccess = () => resolve(req.result);
  });
  await new Promise((resolve) => {
    const tx = db.transaction('records', 'readwrite');
    tx.objectStore('records').put(value, key);
    tx.oncomplete = resolve;
  });
  db.close();
}

beforeEach(() => {
  idb = new IDBFactory();
  local = new MemoryStorage();
});

describe('upgrades', () => {
  it('has a saved example of every version of every record', () => {
    for (const name of NAMES) {
      for (let v = 1; v <= currentVersion(name); v++) expect(FIXTURES, `${name}.v${v}`).toHaveProperty(`${name}.v${v}`);
    }
  });

  it('upgrades every past version to match the current example', () => {
    for (const name of NAMES) {
      const current = FIXTURES[`${name}.v${currentVersion(name)}`];
      for (let v = 1; v < currentVersion(name); v++) {
        expect(upgrade(name, { version: v, data: FIXTURES[`${name}.v${v}`] }), `${name} v${v}`).toEqual(current);
      }
    }
  });

  it('campaign v1 → v2 keeps only trophies that were won, as names', () => {
    const out = upgrade('campaign', { version: 1, data: FIXTURES['campaign.v1'] }) as { trophies: string[] };
    expect(out.trophies).toEqual(['Vyraxen', 'Korowon']);
  });

  it('refuses versions it does not know', () => {
    expect(() => upgrade('fight', { version: currentVersion('fight') + 1, data: {} })).toThrow();
    expect(() => upgrade('fight', { version: 0, data: {} })).toThrow();
  });
});

describe('store', () => {
  it('saves and loads across reloads', async () => {
    await reload().save('hunters', FIXTURES['hunters.v1']);
    expect(await reload().load('hunters', null)).toEqual(FIXTURES['hunters.v1']);
    expect((await raw('hunters'))?.version).toBe(currentVersion('hunters'));
  });

  it('returns the fallback when nothing is saved', async () => {
    expect(await reload().load('role', 'hunter')).toBe('hunter');
  });

  it('applies saves in the order they were made', async () => {
    const s = reload();
    void s.save('role', 'hunter');
    void s.save('role', 'keeper');
    await s.save('role', 'hunter');
    expect(await reload().load('role', null)).toBe('hunter');
  });

  it('saves a copy, not a live reference', async () => {
    const s = reload();
    const data = { n: 1 };
    const saving = s.save('hunters', data);
    data.n = 2;
    await saving;
    expect(await reload().load('hunters', null)).toEqual({ n: 1 });
  });

  it('imports wireframe localStorage data once, then clears it after a later load', async () => {
    local.setItem(legacyKey('campaign'), JSON.stringify(FIXTURES['campaign.v1']));
    expect(await reload().load('campaign', null)).toEqual(FIXTURES['campaign.v2']);
    expect((await raw('campaign'))?.data).toEqual(FIXTURES['campaign.v2']);
    expect(local.getItem(legacyKey('campaign'))).not.toBeNull(); // kept until the next load

    expect(await reload().load('campaign', null)).toEqual(FIXTURES['campaign.v2']);
    expect(local.getItem(legacyKey('campaign'))).toBeNull();
  });

  it('keeps a pre-upgrade copy until a load needs no upgrade', async () => {
    const old: Stored = { version: 1, savedAt: '2026-10-01T00:00:00.000Z', data: FIXTURES['campaign.v1'] };
    await putRaw('campaign', old);
    expect(await reload().load('campaign', null)).toEqual(FIXTURES['campaign.v2']);
    expect(await raw(preUpgradeKey('campaign'))).toEqual(old);

    await reload().load('campaign', null);
    expect(await raw(preUpgradeKey('campaign'))).toBeUndefined();
  });

  it('keeps unreadable data aside and warns, instead of losing it', async () => {
    const future: Stored = { version: 99, savedAt: '2027-01-01T00:00:00.000Z', data: { new: 'shape' } };
    await putRaw('fight', future);
    const s = reload();
    expect(await s.load('fight', 'fresh')).toBe('fresh');
    expect(s.warning()).toMatch(/could not be read/);
    expect(await raw(unreadableKey('fight'))).toEqual(future);
  });

  it('works in memory with a warning when IndexedDB is unavailable', async () => {
    const s = createStore({ local });
    await s.save('role', 'keeper');
    expect(await s.load('role', null)).toBe('keeper');
    expect(s.warning()).toMatch(/not saving/);
  });
});
