import '../shared/wire.css';
import './landing.css';
import { DISCLAIMER, esc, topbar } from '../shared/util';
import { backedUpAt, exportAll, load, markBackedUp, restore, save, UPGRADES, type RecordName } from '../shared/store';
import { protect, protectIfInstalled, type Protection } from '../shared/persist';
import { backupStatus, describe, LABELS, makeBackup, parseBackup, shareOrDownload, type Backup, type Status } from '../shared/backup';

type Role = 'hunter' | 'keeper';

const BASE = import.meta.env.BASE_URL;
const root = document.getElementById('app')!;
let role = await load<Role | null>('role', null);
let protection: Protection = await protectIfInstalled();
/** The player tapped Protect and the browser said no. */
let refused = false;
let status: Status = await currentStatus();
/** A backup file the player picked, waiting for them to confirm the restore. */
let pending: { backup: Backup; device: Awaited<ReturnType<typeof exportAll>> } | null = null;
/** The outcome of the last backup or restore, for the player. */
let message: { text: string; alert?: boolean } | null = null;

async function currentStatus(): Promise<Status> {
  return backupStatus(await exportAll(), await backedUpAt());
}

const TOOLS = [
  { href: 'hunters/', name: 'Hunter tracker', who: 'Each player, on their own phone', what: 'Skill tree and your own materials, plants and elements.' },
  { href: 'campaign/', name: 'Campaign tracker', who: 'The keeper', what: 'Chapters, herbalist and forge, trophies, quests and achievements.' },
  { href: 'fight/', name: 'Fight tracker', who: 'The keeper, cast to the TV', what: "Monster health, stance, struggle and states during a fight." },
];

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
  const { backup, device } = pending;
  const rows = NAMES.flatMap((n) => {
    if (backup.records[n]) {
      return [`<li><strong>${esc(LABELS[n])}:</strong> ${esc(describe(n, backup.records[n]!))}${
        device[n] ? ` <span class="note">(replaces ${esc(describe(n, device[n]!))})</span>` : ''}</li>`];
    }
    return device[n] ? [`<li><strong>${esc(LABELS[n])}:</strong> not in this backup, kept as is</li>`] : [];
  });
  return `
    <div class="restore-preview" role="dialog" aria-label="Restore backup">
      <div class="mid">Restore the backup from ${esc(when(backup.exportedAt))}?</div>
      <ul>${rows.join('')}</ul>
      <p class="note">This replaces the progress on this device. It can't be undone, so back up first if you're not sure.</p>
      <div class="row">
        <button class="btn alert" data-act="restore-confirm">Replace my progress</button>
        <button class="btn" data-act="restore-cancel">Cancel</button>
      </div>
    </div>`;
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
          <button class="btn" disabled>Install app</button>
          <button class="btn" data-act="backup">Back up</button>
          <button class="btn" data-act="restore">Restore</button>
          <span class="note backup-status ${status.stale ? 'stale' : ''}">${status.stale ? '<strong>Back up soon.</strong> ' : ''}${esc(status.text)}</span>
        </div>
        <input type="file" accept=".json,application/json" data-act="restore-file" hidden>
        ${message ? `<p class="note backup-message ${message.alert ? 'stale' : ''}" role="status">${esc(message.text)}</p>` : ''}
        ${restorePreview()}
      </section>
    </main>
    ${DISCLAIMER}`;
}

async function backUp(): Promise<void> {
  const backup = makeBackup(await exportAll());
  if (!Object.keys(backup.records).length) {
    message = { text: 'There is no progress on this device to back up yet.' };
  } else if (await shareOrDownload(backup)) {
    await markBackedUp(backup.exportedAt);
    message = { text: 'Backup made. Keep the file somewhere safe, like Drive or your group chat.' };
  } else {
    message = { text: 'Backup not sent.', alert: true };
  }
  status = await currentStatus();
  render();
}

async function pickedFile(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  input.value = ''; // so picking the same file again still fires
  if (!file) return;
  try {
    pending = { backup: parseBackup(await file.text()), device: await exportAll() };
    message = null;
  } catch (e) {
    pending = null;
    message = { text: (e as Error).message, alert: true };
  }
  render();
  root.querySelector('.restore-preview, .backup-message')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

async function confirmRestore(): Promise<void> {
  const { backup } = pending!;
  pending = null;
  try {
    const at = Number.isNaN(Date.parse(backup.exportedAt)) ? new Date().toISOString() : backup.exportedAt;
    await restore(backup.records, at);
    role = await load<Role | null>('role', null);
    message = { text: `Restored the backup from ${when(backup.exportedAt)}.` };
  } catch {
    message = { text: 'The backup could not be restored. Your progress has not changed.', alert: true };
  }
  status = await currentStatus();
  render();
}

// Coming back from a tracker with the back button: its saves may have changed the status.
addEventListener('pageshow', async (ev) => {
  if (!ev.persisted) return;
  status = await currentStatus();
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
  if (act === 'backup') return backUp();
  if (act === 'restore') return root.querySelector<HTMLInputElement>('[data-act="restore-file"]')!.click();
  if (act === 'restore-confirm') return confirmRestore();
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

render();
