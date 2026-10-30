// Backup files (design/ux-plan.md, Data safety, Backup). A backup holds every
// record as stored, with its version, so a file from any past version of the
// app imports through the same upgrades as saved data.

import {
  UPGRADES, backedUpAt, currentVersion, exportAll, markBackedUp, upgrade, type RecordName, type Stored,
} from './store';
import { esc } from './util';

/** Format 2 added `only`. */
export const FORMAT = 2;

/**
 * A file that backs up one thing rather than everything. 'hunter' holds a
 * hunters record with a single hunter; restoring it adds that hunter (or
 * replaces the one with the same player name) and keeps the others.
 * 'campaign' does the same with one campaign, matched by id.
 */
export type Part = 'hunter' | 'campaign' | 'fight';
const PARTS: Part[] = ['hunter', 'campaign', 'fight'];
const PART_RECORD: Record<Part, RecordName> = { hunter: 'hunters', campaign: 'campaign', fight: 'fight' };

export interface Backup {
  app: 'awaken';
  format: number;
  /** ISO time the file was made. */
  exportedAt: string;
  /** Set when the file backs up one thing; missing for a backup of everything. */
  only?: Part;
  records: Partial<Record<RecordName, Stored>>;
}

const NAMES = Object.keys(UPGRADES) as RecordName[];

export function makeBackup(records: Partial<Record<RecordName, Stored>>, now = new Date()): Backup {
  return { app: 'awaken', format: FORMAT, exportedAt: now.toISOString(), records };
}

/**
 * A backup of one thing from a page's current data: one hunter, one campaign,
 * or the fight (as the fight page saves it).
 */
export function makePart(only: Part, data: unknown, now = new Date()): Backup {
  const name = PART_RECORD[only];
  const stored: Stored = {
    version: currentVersion(name),
    savedAt: now.toISOString(),
    data: structuredClone(
      only === 'hunter' ? { hunters: [data], current: 0 }
      : only === 'campaign' ? { campaigns: [data], current: (data as { id: string }).id }
      : data),
  };
  return { ...makeBackup({ [name]: stored }, now), only };
}

const slug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function fileName(b: Backup): string {
  const d = new Date(b.exportedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // local date
  if (!b.only) return `primal-backup-${date}.json`;
  return ['primal', b.only, slug(partName(b) ?? ''), date].filter(Boolean).join('-') + '.json';
}

/** The hunter's player name, the campaign's name or the fight's monster, if the file has one. */
export function partName(b: Backup): string | null {
  try {
    const name = PART_RECORD[b.only!];
    const d = upgrade(name, b.records[name]!) as any;
    if (b.only === 'hunter') return d.hunters[0].player.trim() || null;
    if (b.only === 'campaign') return d.campaigns[0].name.trim() || null;
    if (b.only === 'fight') return d.fight?.monster || null;
  } catch {
    // Described generically.
  }
  return null;
}

/** What a file holds, for the restore question: "the hunter Sam", "everything". */
export function contents(b: Backup): string {
  const name = partName(b);
  switch (b.only) {
    case 'hunter': return name ? `the hunter ${name}` : 'a hunter';
    case 'campaign': return name ? `the campaign ${name}` : 'a campaign';
    case 'fight': return name ? `the fight against ${name}` : 'a fight';
    default: return 'the backup';
  }
}

/** Read a backup file. Throws an Error with a message for the player. */
export function parseBackup(text: string): Backup {
  let b: Partial<Backup>;
  try {
    b = JSON.parse(text);
  } catch {
    throw new Error("This file isn't a Primal Tools backup.");
  }
  if (!b || typeof b !== 'object' || b.app !== 'awaken' || typeof b.records !== 'object' || !b.records) {
    throw new Error("This file isn't a Primal Tools backup.");
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
  const out: Backup = { app: 'awaken', format: b.format, exportedAt: String(b.exportedAt ?? ''), records };
  if (b.only !== undefined) {
    if (!PARTS.includes(b.only)) {
      throw new Error('This backup was made by a newer version of the app. Reload the page to update, then try again.');
    }
    const name = PART_RECORD[b.only];
    const one = (n: RecordName, list: string) => {
      const items = records[n] && (upgrade(n, records[n]!) as Record<string, unknown>)[list];
      return Array.isArray(items) && items.length === 1;
    };
    if (Object.keys(records).join() !== name
      || (b.only === 'hunter' && !one('hunters', 'hunters'))
      || (b.only === 'campaign' && !one('campaign', 'campaigns'))) {
      throw new Error('This backup is damaged and can\'t be restored.');
    }
    out.only = b.only;
  }
  return out;
}

interface Hunter { player: string; hunterClass: string; notes: string; skills: unknown; counts: unknown }

/** A hunter nobody has filled in: no text, no skills, no resources. */
const blank = (h: Hunter): boolean =>
  !h.player.trim() && !h.hunterClass.trim() && !h.notes.trim() && !/true|[1-9]/.test(JSON.stringify([h.skills, h.counts]));

/**
 * Restoring a one-hunter file: the hunters record with that hunter added (in
 * place of a blank one, if there is one), or in place of the device's hunter
 * with the same player name, and shown first. `replaces` is the index of the
 * hunter it replaces by name, or null.
 */
export function mergeHunter(file: Stored, device: Stored | undefined, now = new Date()): { record: Stored; replaces: number | null } {
  const hunter = (upgrade('hunters', file) as { hunters: Hunter[] }).hunters[0];
  const list = device ? [...(upgrade('hunters', device) as { hunters: Hunter[] }).hunters] : [];
  const key = (h: Hunter) => h.player.trim().toLowerCase();
  const found = key(hunter) ? list.findIndex((h) => key(h) === key(hunter)) : -1;
  const empty = list.findIndex(blank);
  const current = found >= 0 ? found : empty >= 0 ? empty : list.length;
  list[current] = hunter;
  return {
    record: { version: currentVersion('hunters'), savedAt: now.toISOString(), data: { hunters: list, current } },
    replaces: found >= 0 ? found : null,
  };
}

interface Campaign { id: string; name: string }

/**
 * Restoring a one-campaign file: the campaign record with that campaign in
 * place of the device's one with the same id, or added, and selected.
 * `replaces` is the name of the campaign it replaces, or null.
 */
export function mergeCampaign(file: Stored, device: Stored | undefined, now = new Date()): { record: Stored; replaces: string | null } {
  const campaign = (upgrade('campaign', file) as { campaigns: Campaign[] }).campaigns[0];
  const list = device ? [...(upgrade('campaign', device) as { campaigns: Campaign[] }).campaigns] : [];
  const found = list.findIndex((c) => c.id === campaign.id);
  const replaces = found >= 0 ? list[found].name : null;
  list[found >= 0 ? found : list.length] = campaign;
  return {
    record: { version: currentVersion('campaign'), savedAt: now.toISOString(), data: { campaigns: list, current: campaign.id } },
    replaces,
  };
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
        const list = d.campaigns as { name: string; chapters: boolean[]; trophies: string[] }[];
        const one = (c: typeof list[number]) => {
          const done = c.chapters.filter(Boolean).length;
          return `${done} chapter${done === 1 ? '' : 's'} done, ${c.trophies.length} troph${c.trophies.length === 1 ? 'y' : 'ies'}`;
        };
        const name = (c: typeof list[number]) => c.name.trim() || 'unnamed';
        if (list.length === 1) return `${name(list[0])}: ${one(list[0])}`;
        return `${list.length} campaigns: ${list.map((c) => `${name(c)} (${one(c)})`).join('; ')}`;
      }
      case 'fight':
        if (!d.fight) return 'No fight in progress';
        return d.fight.outcome ? `Finished fight against ${d.fight.monster}` : `Fight against ${d.fight.monster}, round ${d.fight.round}`;
      case 'role':
        return d === 'keeper' ? 'Managing the Campaign' : d === 'hunter' ? 'Playing a Hunter' : 'Not chosen';
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
      await nav.share({ files: [file], title: 'Primal Tools backup' });
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

/** The outcome of a backup or restore, for the player. */
export interface Message {
  text: string;
  alert?: boolean;
}

export const messageHtml = (m: Message | null, tag = 'p'): string =>
  m ? `<${tag} class="note backup-message ${m.alert ? 'stale' : ''}" role="status">${esc(m.text)}</${tag}>` : '';

/** "Last backed up" for this device's saved progress. */
export async function currentStatus(): Promise<Status> {
  return backupStatus(await exportAll(), await backedUpAt());
}

export const statusHtml = (s: Status): string =>
  `<span class="note backup-status ${s.stale ? 'stale' : ''}">${s.stale ? '<strong>Back up soon.</strong> ' : ''}${esc(s.text)}</span>`;

/** Back up everything on this device: share the file and say what happened. */
export async function backUpEverything(): Promise<Message> {
  const backup = makeBackup(await exportAll());
  if (!Object.keys(backup.records).length) return { text: 'There is no progress on this device to back up yet.' };
  if (!await shareOrDownload(backup)) return { text: 'Backup not sent.', alert: true };
  await markBackedUp(backup.exportedAt);
  return { text: 'Backup made. Keep the file somewhere safe, like Drive or your group chat.' };
}

/** A page's "Back up this …" button: share the file and say what happened. */
export async function backUpPart(only: Part, data: unknown): Promise<Message> {
  const b = makePart(only, data);
  return await shareOrDownload(b)
    ? { text: `Backup of ${contents(b)} made. Restore it from the home page on any device.` }
    : { text: 'Backup not sent.', alert: true };
}

/**
 * The backup row at the foot of a tracker: back up everything, the page's own
 * buttons, and "Last backed up".
 */
export const backupRowHtml = (buttons: string, status: Status, message: Message | null): string => `
  <div class="row backup-row">
    <button class="btn small" data-act="backup-all">Back up everything</button>
    ${buttons}
    ${statusHtml(status)}
  </div>
  ${messageHtml(message)}`;
