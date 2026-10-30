import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  SNAPSHOT_GAP_MS, SNAPSHOT_LIMIT, UPGRADES, createStore, currentVersion, legacyKey, preUpgradeKey, snapshotKey,
  snapshotOps, unreadableKey, upgrade,
  type RecordName, type Snapshot, type Stored,
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
    const out = (upgrade('campaign', { version: 1, data: FIXTURES['campaign.v1'] }) as { campaigns: { trophies: string[] }[] }).campaigns[0];
    expect(out.trophies).toEqual(['Vyraxen', 'Korowon']);
  });

  it('fight v3 → v4 turns Acceleration states into a count of tokens, at most 4', () => {
    const f = (states: string[]) => ({ states, round: 1 });
    const out = upgrade('fight', { version: 3, data: { fight: f(['acceleration', 'stunned', 'acceleration']), undo: [f(Array(5).fill('acceleration'))] } });
    expect(out).toEqual({
      fight: { states: ['stunned'], round: 1, acceleration: 2, charge: null },
      undo: [{ states: [], round: 1, acceleration: 4, charge: null }],
      campaignId: 'c1',
    });
  });

  it('fight v4 → v5 gives fights no Charge track', () => {
    const out = upgrade('fight', { version: 4, data: { fight: { round: 2 }, undo: [{ round: 1 }] } });
    expect(out).toEqual({ fight: { round: 2, charge: null }, undo: [{ round: 1, charge: null }], campaignId: 'c1' });
  });

  it('campaign v2 → v3 turns done quests into completed and the rest into locked', () => {
    const out = upgrade('campaign', { version: 2, data: { quests: [true, false] } }) as { campaigns: { quests: string[] }[] };
    expect(out.campaigns[0].quests).toEqual(['completed', 'locked']);
  });

  it('campaign v3 → v4 makes the campaign the first of a list, and selects it', () => {
    expect(upgrade('campaign', { version: 3, data: { trophies: ['Vyraxen'] } }))
      .toEqual({ campaigns: [{ id: 'c1', name: 'Campaign 1', trophies: ['Vyraxen'] }], current: 'c1' });
  });

  it('fight v5 → v6 gives a fight in progress to the first campaign', () => {
    expect(upgrade('fight', { version: 5, data: { fight: { round: 2 }, undo: [] } })).toMatchObject({ campaignId: 'c1' });
    expect(upgrade('fight', { version: 5, data: { fight: null, undo: [] } })).toMatchObject({ campaignId: null });
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
    expect(await reload().load('campaign', null)).toEqual(FIXTURES[`campaign.v${currentVersion('campaign')}`]);
    expect((await raw('campaign'))?.data).toEqual(FIXTURES[`campaign.v${currentVersion('campaign')}`]);
    expect(local.getItem(legacyKey('campaign'))).not.toBeNull(); // kept until the next load

    expect(await reload().load('campaign', null)).toEqual(FIXTURES[`campaign.v${currentVersion('campaign')}`]);
    expect(local.getItem(legacyKey('campaign'))).toBeNull();
  });

  it('keeps a snapshot of the record from before an upgrade', async () => {
    const old: Stored = { version: 1, savedAt: '2026-10-01T00:00:00.000Z', data: FIXTURES['campaign.v1'] };
    await putRaw('campaign', old);
    expect(await reload().load('campaign', null)).toEqual(FIXTURES[`campaign.v${currentVersion('campaign')}`]);
    const [snap] = await reload().snapshots();
    expect(snap).toMatchObject({ name: 'campaign', snapshot: { ...old, reason: 'upgrade' } });
  });

  it('deletes the pre-upgrade copy left by older builds', async () => {
    await putRaw(preUpgradeKey('campaign'), { version: 1, savedAt: '', data: {} });
    await putRaw('campaign', { version: currentVersion('campaign'), savedAt: '', data: FIXTURES[`campaign.v${currentVersion('campaign')}`] });
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

describe('backup records', () => {
  it('exports every record with its version, including unopened wireframe data', async () => {
    const s = reload();
    await s.save('role', 'keeper');
    local.setItem(legacyKey('campaign'), JSON.stringify(FIXTURES['campaign.v1']));
    const out = await s.exportAll();
    expect(Object.keys(out).sort()).toEqual(['campaign', 'role']);
    expect(out.role).toMatchObject({ version: currentVersion('role'), data: 'keeper' });
    expect(out.campaign).toEqual({ version: 1, savedAt: '', data: FIXTURES['campaign.v1'] });
  });

  it('restores old versions, which upgrade on the next load, and keeps records not in the backup', async () => {
    const s = reload();
    await s.save('campaign', { other: true });
    await s.save('hunters', FIXTURES['hunters.v1']);
    await s.restore({ campaign: { version: 1, savedAt: '2026-10-01T00:00:00.000Z', data: FIXTURES['campaign.v1'] } }, '2026-10-02T00:00:00.000Z');
    expect(await reload().load('campaign', null)).toEqual(FIXTURES[`campaign.v${currentVersion('campaign')}`]);
    expect(await reload().load('hunters', null)).toEqual(FIXTURES['hunters.v1']);
    expect(await reload().backedUpAt()).toBe('2026-10-02T00:00:00.000Z');
  });

  it('changes nothing if any record in the backup is unreadable', async () => {
    const s = reload();
    await s.save('role', 'keeper');
    await expect(s.restore({
      role: { version: 1, savedAt: '', data: 'hunter' },
      fight: { version: 99, savedAt: '', data: {} },
    }, '2026-10-02T00:00:00.000Z')).rejects.toThrow();
    expect(await reload().load('role', null)).toBe('keeper');
    expect(await reload().backedUpAt()).toBeNull();
  });

  it('remembers the last backup time', async () => {
    expect(await reload().backedUpAt()).toBeNull();
    await reload().markBackedUp('2026-10-05T12:00:00.000Z');
    expect(await reload().backedUpAt()).toBe('2026-10-05T12:00:00.000Z');
  });

  it('backs up and restores in memory when IndexedDB is unavailable', async () => {
    const s = createStore({});
    await s.save('role', 'hunter');
    const out = await s.exportAll();
    const t = createStore({});
    await t.restore(out, '2026-10-02T00:00:00.000Z');
    expect(await t.load('role', null)).toBe('hunter');
  });
});

describe('snapshots', () => {
  const at = (iso: string) => new Date(iso);
  const rec = (savedAt: string): Stored => ({ version: 2, savedAt, data: { n: savedAt } });
  const snap = (takenAt: string, savedAt = takenAt): Snapshot => ({ ...rec(savedAt), takenAt, reason: 'session' });

  it('copies the record from before a session, once per session', async () => {
    await reload().save('campaign', { n: 1 });
    expect(await reload().snapshots()).toEqual([]); // nothing to copy yet

    const s = reload();
    await s.save('campaign', { n: 2 });
    await s.save('campaign', { n: 3 });
    const list = await reload().snapshots();
    expect(list.map((x) => x.snapshot.data)).toEqual([{ n: 1 }]);
    expect(list[0].snapshot.reason).toBe('session');
    expect(await reload().load('campaign', null)).toEqual({ n: 3 });
  });

  it('applies saves in order while taking a snapshot', async () => {
    await reload().save('hunters', { n: 1 });
    const s = reload();
    void s.save('hunters', { n: 2 });
    await s.save('hunters', { n: 3 });
    expect(await reload().load('hunters', null)).toEqual({ n: 3 });
  });

  it("doesn't copy today's choice", async () => {
    await reload().save('role', 'keeper');
    await reload().save('role', 'hunter');
    expect(await reload().snapshots()).toEqual([]);
  });

  it('skips a session snapshot when the newest is recent, unless forced', () => {
    const now = at('2026-10-12T12:00:00Z');
    const recent = [snap(new Date(now.getTime() - SNAPSHOT_GAP_MS + 1000).toISOString(), '2026-10-12T08:00:00Z')];
    expect(snapshotOps('campaign', rec('2026-10-12T11:00:00Z'), recent, 'session', false, now)).toEqual([]);
    expect(snapshotOps('campaign', rec('2026-10-12T11:00:00Z'), recent, 'restore', true, now)).toHaveLength(1);
  });

  it("doesn't copy the same save twice, and keeps only the newest few", () => {
    const now = at('2026-10-12T12:00:00Z');
    const list = Array.from({ length: SNAPSHOT_LIMIT }, (_, i) => snap(`2026-10-0${i + 1}T00:00:00Z`)).reverse();
    expect(snapshotOps('campaign', rec(list[0].savedAt), list, 'restore', true, now)).toEqual([]);
    const [[key, out]] = snapshotOps('campaign', rec('2026-10-11T00:00:00Z'), list, 'session', false, now);
    expect(key).toBe(snapshotKey('campaign'));
    expect((out as Snapshot[]).map((x) => x.savedAt)).toEqual(['2026-10-11T00:00:00Z', ...list.slice(0, -1).map((x) => x.savedAt)]);
  });

  it('copies what a restore replaces, so a rollback can be undone', async () => {
    await reload().save('fight', { n: 1 });
    const s = reload();
    await s.restore({ fight: { ...rec('2026-10-01T00:00:00.000Z'), version: currentVersion('fight') } });
    expect(await reload().load('fight', null)).toEqual({ n: '2026-10-01T00:00:00.000Z' });
    const [first] = await reload().snapshots();
    expect(first.snapshot).toMatchObject({ data: { n: 1 }, reason: 'restore' });
    expect(await reload().backedUpAt()).toBeNull(); // a rollback isn't a backup
  });
});
