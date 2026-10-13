// Backup files (design/ux-plan.md, Data safety, Backup). A backup holds every
// record as stored, with its version, so a file from any past version of the
// app imports through the same upgrades as saved data.

import { UPGRADES, upgrade, type RecordName, type Stored } from './store';

export const FORMAT = 1;

export interface Backup {
  app: 'awaken';
  format: number;
  /** ISO time the file was made. */
  exportedAt: string;
  records: Partial<Record<RecordName, Stored>>;
}

const NAMES = Object.keys(UPGRADES) as RecordName[];

export function makeBackup(records: Partial<Record<RecordName, Stored>>, now = new Date()): Backup {
  return { app: 'awaken', format: FORMAT, exportedAt: now.toISOString(), records };
}

export function fileName(b: Backup): string {
  const d = new Date(b.exportedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `awaken-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`; // local date
}

/** Read a backup file. Throws an Error with a message for the player. */
export function parseBackup(text: string): Backup {
  let b: Partial<Backup>;
  try {
    b = JSON.parse(text);
  } catch {
    throw new Error("This file isn't an Awaken backup.");
  }
  if (!b || typeof b !== 'object' || b.app !== 'awaken' || typeof b.records !== 'object' || !b.records) {
    throw new Error("This file isn't an Awaken backup.");
  }
  if (typeof b.format !== 'number' || b.format > FORMAT) {
    throw new Error('This backup was made by a newer version of the app. Reload the page to update, then try again.');
  }
  const records: Partial<Record<RecordName, Stored>> = {};
  for (const name of NAMES) {
    const stored = b.records[name];
    if (stored === undefined) continue;
    try {
      upgrade(name, stored);
    } catch {
      throw new Error(stored && stored.version > UPGRADES[name].length + 1
        ? 'This backup was made by a newer version of the app. Reload the page to update, then try again.'
        : 'This backup is damaged and can\'t be restored.');
    }
    records[name] = { version: stored.version, savedAt: String(stored.savedAt ?? ''), data: stored.data };
  }
  if (!Object.keys(records).length) throw new Error('This backup has no saved progress in it.');
  return { app: 'awaken', format: b.format, exportedAt: String(b.exportedAt ?? ''), records };
}

export const LABELS: Record<RecordName, string> = {
  hunters: 'Hunter tracker',
  campaign: 'Campaign tracker',
  fight: 'Fight tracker',
  role: 'Today’s choice',
};

/** One line describing a record, for the restore preview. Never throws. */
export function describe(name: RecordName, stored: Stored): string {
  try {
    const d = upgrade(name, stored) as any;
    switch (name) {
      case 'hunters': {
        const names = (d.hunters as { player: string }[]).map((h) => h.player.trim() || 'unnamed');
        return `${names.length} hunter${names.length === 1 ? '' : 's'}: ${names.join(', ')}`;
      }
      case 'campaign': {
        const done = (d.chapters as boolean[]).filter(Boolean).length;
        return `${done} chapter${done === 1 ? '' : 's'} done, ${d.trophies.length} troph${d.trophies.length === 1 ? 'y' : 'ies'}`;
      }
      case 'fight':
        if (!d.fight) return 'No fight in progress';
        return d.fight.outcome ? `Finished fight against ${d.fight.monster}` : `Fight against ${d.fight.monster}, round ${d.fight.round}`;
      case 'role':
        return d === 'keeper' ? 'Run the campaign and fights' : d === 'hunter' ? 'Track my hunter' : 'Not chosen';
    }
  } catch {
    return 'Saved progress';
  }
}

export const STALE_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

export interface Status {
  text: string;
  /** Show it as a warning: changes not backed up for a week or more. */
  stale: boolean;
}

/**
 * "Last backed up" for the landing page. It turns to a warning once progress
 * has gone unbacked-up for STALE_DAYS. Today's choice alone doesn't count as
 * progress.
 */
export function backupStatus(records: Partial<Record<RecordName, Stored>>, backedUpAt: string | null, now = new Date()): Status {
  const saves = NAMES.filter((n) => n !== 'role' && records[n])
    .map((n) => Date.parse(records[n]!.savedAt || '') || 0);
  const last = backedUpAt ? Date.parse(backedUpAt) : NaN;
  const changed = saves.some((t) => !(t <= last));
  // Measure from the last backup, or if there's never been one, from the
  // oldest change it would have caught.
  const since = Number.isNaN(last) ? Math.min(...saves.filter((t) => t > 0), now.getTime()) : last;
  const stale = changed && now.getTime() - since >= STALE_DAYS * DAY;
  const text = Number.isNaN(last) ? 'Last backed up: never' : `Last backed up: ${ago(now.getTime() - last)}`;
  return { text: changed ? `${text} · changes since then` : text, stale };
}

function ago(ms: number): string {
  const days = Math.floor(ms / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/**
 * Hand the file to the share sheet, so it can go to Files, Drive, email or a
 * chat; download it where sharing files isn't supported. Resolves false if
 * the player closed the share sheet without sending it.
 */
export async function shareOrDownload(b: Backup, nav: Navigator = navigator, doc: Document = document): Promise<boolean> {
  const name = fileName(b);
  const file = new File([JSON.stringify(b, null, 1)], name, { type: 'application/json' });
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Awaken backup' });
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
      // Sharing failed for another reason; fall back to a download.
    }
  }
  const url = URL.createObjectURL(file);
  const a = doc.createElement('a');
  a.href = url;
  a.download = name;
  doc.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
