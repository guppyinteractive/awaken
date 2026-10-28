import '../shared/wire.css';
import './campaign.css';
import { DISCLAIMER, esc, topbar } from '../shared/util';
import { load, save } from '../shared/store';
import { protectIfInstalled } from '../shared/persist';
import { oneTab } from '../shared/tabs';
import { registerWorker } from '../shared/install';
import { backUpEverything, backUpPart, backupRowHtml, currentStatus, messageHtml, type Message } from '../shared/backup';
import { ELEMENTS, MONSTERS } from '../shared/game';
import { skullIcon } from '../shared/icons';

const CHAPTERS = 11;
const QUESTS = 49;
/** Chapters that start a new difficulty tier (which stance and peril cards to use). */
const TIER_STARTS = [1, 4, 8];

/** Like the campaign sheet: circled when unlocked, crossed when completed or expired. */
type Quest = 'locked' | 'unlocked' | 'completed';
const NEXT_QUEST: Record<Quest, Quest> = { locked: 'unlocked', unlocked: 'completed', completed: 'locked' };
const QUEST_MARK: Record<Quest, string> = { locked: '', unlocked: '', completed: '✕' };

interface Campaign {
  chapters: boolean[];
  herbalist: number;
  forge: number;
  forgeElements: boolean[];
  /** Names of monsters defeated (trophies earned). */
  trophies: string[];
  quests: Quest[];
  achievements: string[];
}

const fresh = (): Campaign => ({
  chapters: Array(CHAPTERS).fill(false),
  herbalist: 0,
  forge: 0,
  forgeElements: ELEMENTS.map(() => false),
  trophies: [],
  quests: Array(QUESTS).fill('locked'),
  achievements: [],
});

const BASE = import.meta.env.BASE_URL;
const root = document.getElementById('app')!;
await oneTab(); // before loading, so an inactive tab never saves
const c = await load<Campaign>('campaign', fresh());
const persist = () => void save('campaign', c);
/** The outcome of the last backup from the foot of the page. */
let message: Message | null = null;
let status = await currentStatus();
/** A chapter just completed: suggest a backup, then show how it went. */
let nudge: { chapter: number; result?: Message } | null = null;

/** The chapter being played: the first one not yet completed. */
function currentChapter(): number {
  const i = c.chapters.indexOf(false);
  return i === -1 ? CHAPTERS : i + 1;
}

function tierFor(chapter: number): number {
  return TIER_STARTS.filter((start) => chapter >= start).length;
}

function levelPicker(name: 'herbalist' | 'forge', title: string): string {
  return `
    <div class="field"><span class="label">${title} level</span>
      <div class="row">${[1, 2, 3].map((n) =>
        `<button class="toggle" aria-pressed="${c[name] >= n}" data-act="level" data-name="${name}" data-n="${n}">Lvl ${n}</button>`).join('')}
      </div></div>`;
}

function nudgeView(): string {
  if (!nudge) return '';
  return `
    <section class="box nudge" role="status">
      <div class="mid">Chapter ${nudge.chapter} complete</div>
      ${nudge.result ? messageHtml(nudge.result) : `
        <p class="note">Back up now, so this progress survives if the browser clears its data.</p>`}
      <div class="row">
        ${nudge.result ? '' : '<button class="btn primary" data-act="backup-all" data-from="nudge">Back up</button>'}
        <button class="btn" data-act="dismiss-nudge">${nudge.result ? 'Close' : 'Not now'}</button>
      </div>
    </section>`;
}

function render(): void {
  const chapter = currentChapter();
  const tier = tierFor(chapter);

  const chapters = c.chapters.map((done, i) => {
    const n = i + 1;
    const startsTier = TIER_STARTS.indexOf(n);
    return `
      <button class="toggle chapter ${n === chapter ? 'current' : ''}" aria-pressed="${done}" data-act="chapter" data-i="${i}" aria-label="Chapter ${n}">
        ${startsTier >= 0 ? `<span class="tier-mark">T${startsTier + 1}</span>` : ''}${done ? skullIcon() : n}
      </button>`;
  }).join('');

  const elements = c.forgeElements.map((on, i) =>
    `<button class="toggle" aria-pressed="${on}" data-act="element" data-i="${i}">${esc(ELEMENTS[i])}</button>`).join('');

  const trophies = MONSTERS.map((name, i) => {
    const won = c.trophies.includes(name);
    return `
    <div class="trophy">
      <button class="toggle" aria-pressed="${won}" data-act="trophy" data-i="${i}" aria-label="${esc(name)} defeated">${won ? skullIcon() : ''}</button>
      <span class="grow">${esc(name)}</span>
      <a class="btn small" href="${BASE}fight/?monster=${encodeURIComponent(name)}&tier=${tier}">Fight</a>
    </div>`;
  }).join('');

  const quests = c.quests.map((q, i) =>
    `<button class="toggle quest ${q}" data-act="quest" data-i="${i}" aria-label="Quest ${i + 1}, ${q}">${i + 1}<span class="mark" aria-hidden="true">${QUEST_MARK[q]}</span></button>`).join('');
  const count = (q: Quest) => c.quests.filter((x) => x === q).length;

  const achievements = c.achievements.map((a, i) => `
    <li class="row"><span class="grow">${esc(a)}</span>
      <button class="btn small quiet" data-act="drop-achievement" data-i="${i}" aria-label="Remove">✕</button></li>`).join('');

  root.innerHTML = `
    ${topbar('Campaign tracker')}
    <main class="page campaign">
      <section class="box status">
        <div><div class="label">Now playing</div><div class="mid">Chapter ${chapter} · Tier ${tier}</div></div>
        <a class="btn primary" href="${BASE}fight/?tier=${tier}">Start a fight</a>
      </section>
      ${nudgeView()}

      <div class="cols">
        <div class="col">
          <section class="box">
            <div class="label">Chapters</div>
            <p class="note">Mark chapters as you complete them. T1–T3 mark where each difficulty tier starts.</p>
            <div class="chapters">${chapters}</div>
          </section>
          <section class="box upgrades">
            ${levelPicker('herbalist', 'Herbalist')}
            ${levelPicker('forge', 'Forge')}
            <div class="field"><span class="label">Forge elements unlocked</span>
              <div class="row">${elements}</div></div>
          </section>
          <section class="box">
            <div class="label">Achievements</div>
            <ul class="plain">${achievements || '<li class="note">None yet</li>'}</ul>
            <form class="row" data-form="achievement">
              <input name="text" placeholder="Add an achievement" class="grow" aria-label="Achievement">
              <button class="btn" type="submit">Add</button>
            </form>
          </section>
        </div>
        <div class="col">
          <section class="box">
            <div class="label">Trophies · ${c.trophies.length} / ${MONSTERS.length}</div>
            <p class="note">Mark each monster you defeat.</p>
            <div class="trophies">${trophies}</div>
          </section>
          <section class="box">
            <div class="label">Quests · ${count('unlocked')} unlocked · ${count('completed')} completed</div>
            <p class="note">Tap to cycle: locked, unlocked (circled), completed (✕). Mark expired quests completed.</p>
            <div class="quests">${quests}</div>
          </section>
        </div>
      </div>
      ${backupRowHtml('<button class="btn small" data-act="backup">Back up the campaign</button>', status, message)}
    </main>
    ${DISCLAIMER}`;
}

root.addEventListener('click', async (ev) => {
  const t = (ev.target as Element).closest<HTMLElement>('[data-act]');
  if (!t) return;
  const i = Number(t.dataset.i);
  message = null;
  switch (t.dataset.act) {
    case 'backup':
    case 'backup-all': {
      const result = t.dataset.act === 'backup' ? await backUpPart('campaign', c) : await backUpEverything();
      if (t.dataset.from === 'nudge') nudge = { ...nudge!, result };
      else message = result;
      status = await currentStatus();
      render();
      return;
    }
    case 'dismiss-nudge': nudge = null; render(); return;
    case 'chapter':
      c.chapters[i] = !c.chapters[i];
      nudge = c.chapters[i] ? { chapter: i + 1 } : nudge?.chapter === i + 1 ? null : nudge;
      break;
    case 'quest': c.quests[i] = NEXT_QUEST[c.quests[i]]; break;
    case 'element': c.forgeElements[i] = !c.forgeElements[i]; break;
    case 'trophy': {
      const name = MONSTERS[i];
      c.trophies = c.trophies.includes(name) ? c.trophies.filter((t) => t !== name) : [...c.trophies, name];
      break;
    }
    case 'drop-achievement': c.achievements.splice(i, 1); break;
    case 'level': {
      const name = t.dataset.name as 'herbalist' | 'forge';
      const n = Number(t.dataset.n);
      c[name] = c[name] === n ? n - 1 : n; // tapping the top level again lowers it
      break;
    }
    default: return;
  }
  persist();
  render();
});

root.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const form = ev.target as HTMLFormElement;
  const data = new FormData(form);
  if (form.dataset.form === 'achievement') {
    const text = String(data.get('text') ?? '').trim();
    if (text) c.achievements.push(text);
  }
  persist();
  render();
});

void protectIfInstalled();
registerWorker();
render();
