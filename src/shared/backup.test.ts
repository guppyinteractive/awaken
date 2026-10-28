import { describe as group, expect, it } from 'vitest';
import { backupStatus, contents, describe, fileName, makeBackup, makePart, mergeHunter, parseBackup } from './backup';
import { currentVersion, type Stored } from './store';
import campaignV1 from './fixtures/campaign.v1.json';
import hunters from './fixtures/hunters.v1.json';
import fight from './fixtures/fight.v1.json';

const rec = (data: unknown, version = 1, savedAt = '2026-10-01T00:00:00.000Z'): Stored => ({ version, savedAt, data });

group('backup files', () => {
  it('round-trips through JSON', () => {
    const b = makeBackup({ campaign: rec(campaignV1), role: rec('keeper') }, new Date('2026-10-12T09:00:00Z'));
    expect(parseBackup(JSON.stringify(b))).toEqual(b);
  });

  it('refuses files that are not backups, with a reason', () => {
    expect(() => parseBackup('not json')).toThrow(/isn't a Primal Tools backup/);
    expect(() => parseBackup('{"hunters": []}')).toThrow(/isn't a Primal Tools backup/);
    expect(() => parseBackup(JSON.stringify(makeBackup({})))).toThrow(/no saved progress/);
  });

  it('refuses backups from a newer app instead of guessing', () => {
    const b = makeBackup({ fight: rec({}, currentVersion('fight') + 1) });
    expect(() => parseBackup(JSON.stringify(b))).toThrow(/newer version/);
    expect(() => parseBackup(JSON.stringify({ ...makeBackup({ role: rec('keeper') }), format: 99 }))).toThrow(/newer version/);
  });

  it('ignores record names it does not know', () => {
    const b = { ...makeBackup({ role: rec('keeper') }), records: { role: rec('keeper'), future: rec(1) } };
    expect(Object.keys(parseBackup(JSON.stringify(b)).records)).toEqual(['role']);
  });
});

group('backing up one thing', () => {
  const now = new Date('2026-10-12T09:00:00');
  const sam = (hunters as { hunters: { player: string }[] }).hunters[0];
  const blank = { player: '', hunterClass: '', notes: '', skills: [[false, false]], counts: { materials: [0] } };

  it('round-trips a hunter, the campaign and a fight, and names the file after it', () => {
    for (const [only, data, name, what] of [
      ['hunter', sam, 'primal-hunter-sam-2026-10-12.json', 'the hunter Sam'],
      ['campaign', campaignV1, 'primal-campaign-2026-10-12.json', 'the campaign'],
      ['fight', fight, 'primal-fight-vyraxen-2026-10-12.json', 'the fight against Vyraxen'],
    ] as const) {
      const b = makePart(only, data, now);
      expect(parseBackup(JSON.stringify(b))).toEqual(b);
      expect(fileName(b)).toBe(name);
      expect(contents(b)).toBe(what);
    }
    expect(fileName(makeBackup({ role: rec('keeper') }, now))).toBe('primal-backup-2026-10-12.json');
  });

  it('still reads format 1 backups of everything', () => {
    const b = { ...makeBackup({ campaign: rec(campaignV1) }), format: 1 };
    expect(parseBackup(JSON.stringify(b)).only).toBeUndefined();
  });

  it('refuses part files that hold something else, and parts it does not know', () => {
    const b = makePart('hunter', sam, now);
    const two = { ...b, records: { hunters: rec({ hunters: [sam, sam], current: 0 }) } };
    expect(() => parseBackup(JSON.stringify(two))).toThrow(/damaged/);
    expect(() => parseBackup(JSON.stringify({ ...b, records: { ...b.records, role: rec('keeper') } }))).toThrow(/damaged/);
    expect(() => parseBackup(JSON.stringify({ ...b, only: 'monster' }))).toThrow(/newer version/);
  });

  const file = (h: unknown) => makePart('hunter', h, now).records.hunters!;
  const device = (...list: unknown[]) => rec({ hunters: list, current: 0 }, currentVersion('hunters'));
  const players = (r: Stored) => (r.data as { hunters: { player: string }[] }).hunters.map((h) => h.player);

  it('adds a hunter, keeping the others, and shows it', () => {
    const { record, replaces } = mergeHunter(file(sam), device({ ...blank, player: 'Ann' }), now);
    expect(players(record)).toEqual(['Ann', 'Sam']);
    expect(record.data).toMatchObject({ current: 1 });
    expect(replaces).toBeNull();
    expect(players(mergeHunter(file(sam), undefined, now).record)).toEqual(['Sam']);
  });

  it('replaces the hunter with the same player name, or a blank one', () => {
    const ann = { ...blank, player: 'Ann' };
    const r = mergeHunter(file({ ...sam, player: ' sam ' }), device(ann, { ...blank, player: 'Sam' }), now);
    expect(players(r.record)).toEqual(['Ann', ' sam ']);
    expect(r.replaces).toBe(1);
    expect(players(mergeHunter(file(sam), device(blank, ann), now).record)).toEqual(['Sam', 'Ann']);
    // An unnamed hunter in the file never replaces by name.
    expect(players(mergeHunter(file({ ...sam, player: '' }), device({ ...ann, player: '', notes: 'x' }), now).record))
      .toEqual(['', '']);
  });
});

group('restore preview', () => {
  it('describes each record in plain words, upgrading old ones', () => {
    expect(describe('campaign', rec(campaignV1))).toBe('2 chapters done, 2 trophies');
    expect(describe('hunters', rec(hunters))).toMatch(/^\d+ hunters?: Sam/);
    expect(describe('fight', rec(fight))).toBe('Fight against Vyraxen, round 1');
    expect(describe('role', rec('keeper'))).toBe('Managing the Campaign');
    expect(describe('hunters', rec({ broken: true }))).toBe('Saved progress');
  });
});

group('last backed up', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const at = (iso: string) => ({ campaign: rec({}, 2, iso) });

  it('says never, and warns once progress is a week old', () => {
    expect(backupStatus({}, null, now)).toEqual({ text: 'Last backed up: never', stale: false });
    expect(backupStatus(at('2026-10-19T00:00:00Z'), null, now).stale).toBe(false);
    expect(backupStatus(at('2026-10-10T00:00:00Z'), null, now).stale).toBe(true);
  });

  it('warns only when a week-old backup has changes since', () => {
    expect(backupStatus(at('2026-10-01T00:00:00Z'), '2026-10-02T00:00:00Z', now))
      .toEqual({ text: 'Last backed up: 18 days ago', stale: false });
    expect(backupStatus(at('2026-10-19T00:00:00Z'), '2026-10-02T00:00:00Z', now))
      .toEqual({ text: 'Last backed up: 18 days ago · changes since then', stale: true });
    expect(backupStatus(at('2026-10-19T00:00:00Z'), '2026-10-18T00:00:00Z', now).stale).toBe(false);
  });

  it("doesn't count today's choice as progress", () => {
    expect(backupStatus({ role: rec('keeper', 1, '2026-10-01T00:00:00Z') }, null, now).stale).toBe(false);
  });
});
