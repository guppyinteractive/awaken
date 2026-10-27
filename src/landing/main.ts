import '../shared/wire.css';
import './landing.css';
import { DISCLAIMER, esc, topbar } from '../shared/util';
import {
  exportAll, load, restore, save, snapshots, UPGRADES, type RecordName, type Stored,
} from '../shared/store';
import { protect, protectIfInstalled, type Protection } from '../shared/persist';
import { oneTab } from '../shared/tabs';
import { installWay, onInstallChange, promptInstall, registerWorker } from '../shared/install';
import {
  backUpEverything, contents, currentStatus, describe, LABELS, mergeHunter, messageHtml, parseBackup, partName, statusHtml,
  type Backup, type Message, type Status,
} from '../shared/backup';

type Role = 'hunter' | 'keeper';

const BASE = import.meta.env.BASE_URL;
const root = document.getElementById('app')!;
await oneTab(); // before loading, so an inactive tab never saves
let role = await load<Role | null>('role', null);
let protection: Protection = await protectIfInstalled();
/** The player tapped Protect and the browser said no. */
let refused = false;
let status: Status = await currentStatus();
type Records = Partial<Record<RecordName, Stored>>;

/** A backup file or earlier copy the player picked, waiting for them to confirm. */
let pending: {
  question: string;
  records: Records;
  device: Records;
  /** Said instead of describing the record and what it replaces. */
  lines?: Partial<Record<RecordName, string>>;
  /** Set the last backup time to this (only for a backup file). */
  backedUpAt?: string;
  done: string;
} | null = null;
let versions = await snapshots();
/** The outcome of the last backup or restore, for the player. */
let message: Message | null = null;

const TOOLS = [
  { href: 'hunters/', name: 'Hunter tracker', who: 'Each player, on their own phone', what: 'Skill tree and your own materials, plants and elements.' },
  { href: 'campaign/', name: 'Campaign tracker', who: 'The keeper', what: 'Chapters, herbalist and forge, trophies, quests and achievements.' },
  { href: 'fight/', name: 'Fight tracker', who: 'The keeper, cast to the TV', what: "Monster health, stance, struggle and states during a fight." },
];

const INSTALL_HELP = {
  share: 'On iPhone or iPad: tap the Share button, then Add to Home Screen. Open the app from your home screen from then on.',
  menu: "Open your browser's menu and choose Install app or Add to Home screen. If neither is there, try Chrome, Edge, or Safari.",
};

function installButton(): string {
  return installWay() === 'installed'
    ? '<span class="note"><strong>Installed.</strong> Open Primal Tools from your home screen.</span>'
    : '<button class="btn primary" data-act="install">Install app</button>';
}

async function install(): Promise<void> {
  const way = installWay();
  if (way === 'prompt') {
    message = (await promptInstall()) ? { text: 'Installed. Open Primal Tools from your home screen from now on.' } : null;
  } else if (way !== 'installed') {
    message = { text: INSTALL_HELP[way] };
  }
  render();
}

function protectionStatus(): string {
  switch (protection) {
    case 'protected':
      return `<p class="note"><strong>Storage: protected.</strong> This browser won't clear your progress to free up space.</p>`;
    case 'unsupported':
      return `<p class="note"><strong>Storage: not protected.</strong> This browser can't keep data permanently, so back up often.</p>`;
    case 'unprotected':
      return `<div class="row">
          <button class="btn" data-act="protect">Protect my data</button>
          <span class="note"><strong>Storage: not protected.</strong> ${refused
            ? 'The browser said no. Installing the app usually fixes this.'
            : 'The browser may clear your progress when the device is low on space.'}</span>
        </div>`;
  }
}

const NAMES = Object.keys(UPGRADES) as RecordName[];

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'an unknown date' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

function restorePreview(): string {
  if (!pending) return '';
  const { question, records, device, lines } = pending;
  const rows = NAMES.flatMap((n) => {
    if (lines?.[n]) return [`<li><strong>${esc(LABELS[n])}:</strong> ${esc(lines[n]!)}</li>`];
    if (records[n]) {
      return [`<li><strong>${esc(LABELS[n])}:</strong> ${esc(describe(n, records[n]!))}${
        device[n] ? ` <span class="note">(replaces ${esc(describe(n, device[n]!))})</span>` : ''}</li>`];
    }
    return device[n] ? [`<li><strong>${esc(LABELS[n])}:</strong> kept as is</li>`] : [];
  });
  return `
    <div class="restore-preview" role="dialog" aria-label="Restore">
      <div class="mid">${esc(question)}</div>
      <ul>${rows.join('')}</ul>
      <p class="note">${lines
        ? 'The hunters as they are now are kept under Previous versions.'
        : 'This replaces the progress on this device. What it replaces is kept under Previous versions.'}</p>
      <div class="row">
        <button class="btn alert" data-act="restore-confirm">${lines ? 'Restore the hunter' : 'Replace my progress'}</button>
        <button class="btn" data-act="restore-cancel">Cancel</button>
      </div>
    </div>`;
}

const REASONS = { session: '', restore: ' · before a restore or rollback', upgrade: ' · before an app update' };

function previousVersions(): string {
  if (!versions.length) return '';
  return `
    <details class="versions">
      <summary>Previous versions on this device (${versions.length})</summary>
      <p class="note">Copies kept from earlier sessions. They are lost if the browser's data is cleared; only a backup file survives that.</p>
      <ul>${versions.map(({ name, snapshot }, i) => `
        <li class="row">
          <span class="grow"><strong>${esc(LABELS[name])}</strong> · ${esc(when(snapshot.savedAt || snapshot.takenAt))}${REASONS[snapshot.reason]}<br>
            <span class="note">${esc(describe(name, snapshot))}</span></span>
          <button class="btn small" data-act="rollback" data-i="${i}">Roll back</button>
        </li>`).join('')}
      </ul>
    </details>`;
}

function render(): void {
  root.innerHTML = `
    ${topbar('Primal companion tools')}
    <main class="page landing">
      <section class="box">
        <h1 class="mid">What are you doing today?</h1>
        <p class="note">This device remembers your choice. You can switch any time.</p>
        <div class="roles">
          <button class="role ${role === 'hunter' ? 'chosen' : ''}" data-role="hunter">
            <span class="mid">Track my hunter</span>
            <span class="note">Opens the hunter tracker</span></button>
          <button class="role ${role === 'keeper' ? 'chosen' : ''}" data-role="keeper">
            <span class="mid">Run the campaign and fights</span>
            <span class="note">Opens the campaign tracker, with fights from there</span></button>
        </div>
      </section>

      <section class="tools">
        ${TOOLS.map((t) => `
          <a class="box tool" href="${BASE}${t.href}">
            <span class="label">${esc(t.who)}</span>
            <span class="mid">${esc(t.name)}</span>
            <span class="note">${esc(t.what)}</span>
          </a>`).join('')}
      </section>

      <section class="box safety">
        <div class="label">Keep your progress safe</div>
        <ol>
          <li><strong>Install the app</strong> to your home screen and always open it from there.</li>
          <li><strong>Back up after each session</strong> and send the file somewhere safe.</li>
          <li>Clearing browser data or deleting the app <strong>erases your progress</strong> unless you have a backup.</li>
        </ol>
        ${protectionStatus()}
        <div class="row">
          ${installButton()}
          <button class="btn" data-act="backup">Back up</button>
          <button class="btn" data-act="restore">Restore</button>
          ${statusHtml(status)}
        </div>
        <input type="file" accept=".json,application/json" data-act="restore-file" hidden>
        ${messageHtml(message)}
        ${restorePreview()}
        ${previousVersions()}
      </section>
    </main>
    ${DISCLAIMER}`;
}

async function backUp(): Promise<void> {
  message = await backUpEverything();
  status = await currentStatus();
  render();
}

async function pickedFile(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  input.value = ''; // so picking the same file again still fires
  if (!file) return;
  try {
    const backup = parseBackup(await file.text());
    const device = await exportAll();
    const what = `${contents(backup)} from ${when(backup.exportedAt)}`;
    pending = {
      question: `Restore ${what}?`,
      records: backup.records,
      device,
      // Only a backup of everything counts as backed up.
      backedUpAt: backup.only ? undefined
        : Number.isNaN(Date.parse(backup.exportedAt)) ? new Date().toISOString() : backup.exportedAt,
      done: `Restored ${what}.`,
    };
    if (backup.only === 'hunter') Object.assign(pending, oneHunter(backup, device));
    message = null;
  } catch (e) {
    pending = null;
    message = { text: (e as Error).message, alert: true };
  }
  render();
  root.querySelector('.restore-preview, .backup-message')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/** Restoring one hunter merges it into this device's hunters. */
function oneHunter(backup: Backup, device: Records): Pick<NonNullable<typeof pending>, 'records' | 'lines'> {
  let merged: ReturnType<typeof mergeHunter>;
  try {
    merged = mergeHunter(backup.records.hunters!, device.hunters);
  } catch {
    throw new Error("The hunters saved on this device can't be read, so this hunter can't be added to them.");
  }
  const { record, replaces } = merged;
  const name = partName(backup) ?? 'an unnamed hunter';
  const others = (record.data as { hunters: unknown[] }).hunters.length - 1;
  const kept = others ? ` The other ${others === 1 ? 'hunter is' : `${others} hunters are`} kept.` : '';
  return {
    records: { hunters: record },
    lines: { hunters: (replaces === null ? `adds ${name}.` : `${name} replaces the hunter with that name on this device.`) + kept },
  };
}

async function confirmRestore(): Promise<void> {
  const { records, backedUpAt: at, done } = pending!;
  pending = null;
  try {
    await restore(records, at);
    role = await load<Role | null>('role', null);
    message = { text: done };
  } catch {
    message = { text: 'That could not be restored. Your progress has not changed.', alert: true };
  }
  status = await currentStatus();
  versions = await snapshots();
  render();
}

// Coming back from a tracker with the back button: its saves may have changed the status and copies.
addEventListener('pageshow', async (ev) => {
  if (!ev.persisted) return;
  status = await currentStatus();
  versions = await snapshots();
  render();
});

root.addEventListener('change', (ev) => {
  const input = (ev.target as Element).closest<HTMLInputElement>('[data-act="restore-file"]');
  if (input) void pickedFile(input);
});

root.addEventListener('click', async (ev) => {
  const act = (ev.target as Element).closest<HTMLElement>('[data-act]')?.dataset.act;
  if (act === 'protect') {
    protection = await protect();
    refused = protection === 'unprotected';
    render();
    return;
  }
  if (act === 'install') return install();
  if (act === 'backup') return backUp();
  if (act === 'restore') return root.querySelector<HTMLInputElement>('[data-act="restore-file"]')!.click();
  if (act === 'restore-confirm') return confirmRestore();
  if (act === 'rollback') {
    const { name, snapshot } = versions[Number((ev.target as Element).closest<HTMLElement>('[data-i]')!.dataset.i)];
    const at = when(snapshot.savedAt || snapshot.takenAt);
    pending = {
      question: `Roll the ${LABELS[name].toLowerCase()} back to ${at}?`,
      records: { [name]: snapshot },
      device: { [name]: (await exportAll())[name] },
      done: `Rolled the ${LABELS[name].toLowerCase()} back to ${at}.`,
    };
    message = null;
    render();
    root.querySelector('.restore-preview')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }
  if (act === 'restore-cancel') {
    pending = null;
    render();
    return;
  }
  const btn = (ev.target as Element).closest<HTMLElement>('[data-role]');
  if (!btn) return;
  role = btn.dataset.role as Role;
  await save('role', role); // finish saving before leaving the page
  location.href = BASE + (role === 'hunter' ? 'hunters/' : 'campaign/');
});

onInstallChange(render);
render();
registerWorker();
