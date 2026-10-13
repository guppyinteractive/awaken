import { describe as group, expect, it } from 'vitest';
import { backupStatus, describe, makeBackup, parseBackup } from './backup';
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
    expect(() => parseBackup('not json')).toThrow(/isn't an Awaken backup/);
    expect(() => parseBackup('{"hunters": []}')).toThrow(/isn't an Awaken backup/);
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

group('restore preview', () => {
  it('describes each record in plain words, upgrading old ones', () => {
    expect(describe('campaign', rec(campaignV1))).toBe('2 chapters done, 2 trophies');
    expect(describe('hunters', rec(hunters))).toMatch(/^\d+ hunters?: Sam/);
    expect(describe('fight', rec(fight))).toBe('Fight against Vyraxen, round 1');
    expect(describe('role', rec('keeper'))).toBe('Run the campaign and fights');
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
