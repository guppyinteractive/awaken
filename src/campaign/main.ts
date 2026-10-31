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
import { DEFEAT_SPACES, freshTrial, lost, over, score, won, type Trial } from '../shared/trial';

const CHAPTERS = 11;
const QUESTS = 49;
/** Chapters that start a new difficulty tier (which stance and peril cards to use). */
const TIER_STARTS = [1, 4, 8];

/** Circled when unlocked, ticked when completed or expired. */
type Quest = 'locked' | 'unlocked' | 'completed';
const NEXT_QUEST: Record<Quest, Quest> = { locked: 'unlocked', unlocked: 'completed', completed: 'locked' };
const QUEST_MARK: Record<Quest, string> = { locked: '', unlocked: '', completed: '✓' };

interface Campaign {
  id: string;
  name: string;
  chapters: boolean[];
  herbalist: number;
  forge: number;
  forgeElements: boolean[];
  /** Names of monsters defeated (trophies earned). */
  trophies: string[];
  quests: Quest[];
  achievements: string[];
  trial: Trial;
}

interface Saved {
  campaigns: Campaign[];
  /** The id of the campaign shown. */
  current: string;
}

/** Not crypto.randomUUID(), which needs https and the dev server is plain http. */
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const fresh = (name: string): Campaign => ({
  id: newId(),
  name,
  chapters: Array(CHAPTERS).fill(false),
  herbalist: 0,
  forge: 0,
  forgeElements: ELEMENTS.map(() => false),
  trophies: [],
  quests: Array(QUESTS).fill('locked'),
  achievements: [],
  trial: freshTrial(),
});

const BASE = import.meta.env.BASE_URL;
const root = document.getElementById('app')!;
await oneTab(); // before loading, so an inactive tab never saves
const first = fresh('Campaign 1');
const state = await load<Saved>('campaign', { campaigns: [first], current: first.id });
/** A link from the fight tracker opens the fight's campaign. */
const linked = new URLSearchParams(location.search).get('campaign');
if (linked && state.campaigns.some((x) => x.id === linked)) state.current = linked;
if (linked) history.replaceState(null, '', location.pathname);
/** The campaign shown. */
let c = state.campaigns.find((x) => x.id === state.current) ?? state.campaigns[0];
const persist = () => void save('campaign', state);

function select(campaign: Campaign): void {
  c = campaign;
  state.current = c.id;
  nudge = null;
}

/** "Campaign 2", or the next number not taken. */
function nextName(): string {
  let n = state.campaigns.length + 1;
  while (state.campaigns.some((x) => x.name === `Campaign ${n}`)) n++;
  return `Campaign ${n}`;
}

const label = (x: Campaign, i: number) => x.name.trim() || `Campaign ${i + 1}`;
/** The outcome of the last backup from the foot of the page. */
let message: Message | null = null;
let status = await currentStatus();
/** A chapter just completed: suggest a backup, then show how it went. */
let nudge: { chapter: number; result?: Message } | null = null;
/** What the last Hunter's Trial button did. */
let trialNote = '';

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

function counter(field: 'totalDefeats' | 'valor', title: string): string {
  const n = c.trial[field];
  return `
    <div class="counter">
      <span class="name">${title}</span>
      <button class="btn small" data-act="trial-count" data-field="${field}" data-d="-1" aria-label="${title} minus 1" ${n ? '' : 'disabled'}>−</button>
      <span class="n">${n}</span>
      <button class="btn small" data-act="trial-count" data-field="${field}" data-d="1" aria-label="${title} plus 1">+</button>
    </div>`;
}

function trialView(): string {
  const t = c.trial;
  if (!t.on) return '';
  const spaces = Array.from({ length: DEFEAT_SPACES }, (_, i) =>
    `<button class="toggle defeat" aria-pressed="${t.defeats > i}" data-act="defeat" data-n="${i + 1}" aria-label="Defeat ${i + 1}">${t.defeats > i ? '✕' : ''}</button>`).join('');
  return `
    <section class="box trial">
      <div class="row"><span class="label grow">Hunter's Trial</span>
        <span class="note">Hunter score</span><span class="mid">${score(t)}</span></div>
      <div class="field"><span class="label">Defeats</span><div class="row">${spaces}</div></div>
      ${over(t) ? '<p class="note stale" role="status"><strong>Campaign over:</strong> start again from Chapter 1.</p>' : ''}
      <div class="slots">${counter('totalDefeats', 'Total defeats')}${counter('valor', 'Valor')}</div>
      <div class="row">
        <button class="btn" data-act="trial-lost" ${over(t) ? 'disabled' : ''}>Scenario lost</button>
        <button class="btn" data-act="trial-won" ${over(t) ? 'disabled' : ''}>Scenario won</button>
        <button class="btn" data-act="trial-won" data-noko ${over(t) ? 'disabled' : ''}>Won, no one KO'd</button>
      </div>
      ${trialNote ? `<p class="note" role="status">${esc(trialNote)}</p>` : ''}
      <p class="note">Score: 90 − 2 × total defeats + valor (p. 63).</p>
    </section>`;
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
      <a class="btn small" href="${BASE}fight/?monster=${encodeURIComponent(name)}&tier=${tier}&campaign=${encodeURIComponent(c.id)}">Fight</a>
    </div>`;
  }).join('');

  const quests = c.quests.map((q, i) =>
    `<button class="toggle quest ${q}" data-act="quest" data-i="${i}" aria-label="Quest ${i + 1}, ${q}"><span class="n">${i + 1}</span><span class="mark" aria-hidden="true">${QUEST_MARK[q]}</span></button>`).join('');
  const count = (q: Quest) => c.quests.filter((x) => x === q).length;

  const achievements = c.achievements.map((a, i) => `
    <li class="row"><span class="grow">${esc(a)}</span>
      <button class="btn small quiet" data-act="drop-achievement" data-i="${i}" aria-label="Remove">✕</button></li>`).join('');

  const tabs = state.campaigns.map((x, i) =>
    `<button class="toggle" aria-pressed="${x === c}" data-act="pick" data-i="${i}">${esc(label(x, i))}</button>`).join('');

  root.innerHTML = `
    ${topbar('Campaign tracker', 'campaign')}
    <main class="page campaign">
      <nav class="row tabs">${tabs}<button class="btn quiet small" data-act="add">+ Campaign</button></nav>
      <section class="box status">
        <label class="field name"><span class="label">Campaign name</span>
          <input data-field="name" value="${esc(c.name)}" autocomplete="off"></label>
        <div class="field trial-on"><label class="toggle radio"><input type="checkbox" data-act="trial-on" ${c.trial.on ? 'checked' : ''}> Playing the Hunter's Trial</label></div>
        <div><div class="label">Now playing</div><div class="mid">Chapter ${chapter} · Tier ${tier}</div></div>
        <a class="btn primary" href="${BASE}fight/?tier=${tier}&campaign=${encodeURIComponent(c.id)}">Start a fight</a>
      </section>
      ${nudgeView()}

      <div class="cols">
        <div class="col">
          <section class="box">
            <div class="label">Chapters</div>
            <p class="note">Mark chapters as you complete them. T1–T3 mark where each difficulty tier starts.</p>
            <div class="chapters">${chapters}</div>
          </section>
          ${trialView()}
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
            <p class="note">Tap to cycle: locked, unlocked (circled), completed (✓). Mark expired quests completed.</p>
            <div class="quests">${quests}</div>
          </section>
        </div>
      </div>
      ${backupRowHtml('<button class="btn small" data-act="backup">Back up this campaign</button>', status, message)}
      ${state.campaigns.length > 1 ? '<div class="row"><button class="btn alert small" data-act="remove">Delete this campaign</button></div>' : ''}
    </main>
    ${DISCLAIMER}`;
}

root.addEventListener('click', async (ev) => {
  const t = (ev.target as Element).closest<HTMLElement>('[data-act]');
  if (!t) return;
  const i = Number(t.dataset.i);
  message = null;
  trialNote = '';
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
    case 'pick': select(state.campaigns[i]); break;
    case 'add': {
      const added = fresh(nextName());
      state.campaigns.push(added);
      select(added);
      break;
    }
    case 'remove': {
      if (!confirm(`Delete ${c.name.trim() || 'this campaign'}?`)) return;
      const at = state.campaigns.indexOf(c);
      state.campaigns.splice(at, 1);
      select(state.campaigns[Math.max(0, at - 1)]);
      break;
    }
    case 'chapter':
      c.chapters[i] = !c.chapters[i];
      nudge = c.chapters[i] ? { chapter: i + 1 } : nudge?.chapter === i + 1 ? null : nudge;
      break;
    case 'quest': c.quests[i] = NEXT_QUEST[c.quests[i]]; break;
    case 'trial-on': c.trial.on = (t as HTMLInputElement).checked; break;
    case 'defeat': {
      const n = Number(t.dataset.n);
      c.trial.defeats = c.trial.defeats === n ? n - 1 : n; // tapping the last marked space again clears it
      break;
    }
    case 'trial-count': {
      const field = t.dataset.field as 'totalDefeats' | 'valor';
      c.trial[field] = Math.max(0, c.trial[field] + Number(t.dataset.d));
      break;
    }
    case 'trial-lost':
      c.trial = lost(c.trial);
      trialNote = over(c.trial) ? '' : `Defeat ${c.trial.defeats} marked.`;
      break;
    case 'trial-won': {
      const defeats = c.trial.defeats;
      const result = won(c.trial, 'noko' in t.dataset);
      c.trial = result.trial;
      trialNote = [
        defeats ? `${defeats} defeat${defeats === 1 ? '' : 's'} moved to the total.` : '',
        result.valor ? `+${result.valor} valor.` : 'No valor.',
      ].filter(Boolean).join(' ');
      break;
    }
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

// The name saves as you type without re-rendering (keeps focus and the keyboard open).
root.addEventListener('input', (ev) => {
  const el = ev.target as HTMLInputElement;
  if (el.dataset.field !== 'name') return;
  c.name = el.value;
  const at = state.campaigns.indexOf(c);
  const tab = root.querySelector(`[data-act="pick"][data-i="${at}"]`);
  if (tab) tab.textContent = label(c, at);
  persist();
});

void protectIfInstalled();
registerWorker();
render();
