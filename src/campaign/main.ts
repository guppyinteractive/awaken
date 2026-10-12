import '../shared/wire.css';
import './campaign.css';
import { DISCLAIMER, KEYS, SLOT_COUNTS, esc, load, loadNames, save, slotName, topbar } from '../shared/util';

const CHAPTERS = 11;
const QUESTS = 49;
/** Chapters that start a new difficulty tier (which stance and peril cards to use). */
const TIER_STARTS = [1, 4, 8];

interface Campaign {
  chapters: boolean[];
  herbalist: number;
  forge: number;
  forgeElements: boolean[];
  trophies: { name: string; won: boolean }[];
  quests: boolean[];
  achievements: string[];
}

const fresh = (): Campaign => ({
  chapters: Array(CHAPTERS).fill(false),
  herbalist: 0,
  forge: 0,
  forgeElements: Array(SLOT_COUNTS.elements).fill(false),
  trophies: [],
  quests: Array(QUESTS).fill(false),
  achievements: [],
});

const BASE = import.meta.env.BASE_URL;
const root = document.getElementById('app')!;
const c = load<Campaign>(KEYS.campaign, fresh());
const persist = () => save(KEYS.campaign, c);

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

function render(): void {
  const names = loadNames();
  const chapter = currentChapter();
  const tier = tierFor(chapter);

  const chapters = c.chapters.map((done, i) => {
    const n = i + 1;
    const startsTier = TIER_STARTS.indexOf(n);
    return `
      <button class="toggle chapter ${n === chapter ? 'current' : ''}" aria-pressed="${done}" data-act="chapter" data-i="${i}">
        ${startsTier >= 0 ? `<span class="tier-mark">T${startsTier + 1}</span>` : ''}${n}
      </button>`;
  }).join('');

  const elements = c.forgeElements.map((on, i) =>
    `<button class="toggle" aria-pressed="${on}" data-act="element" data-i="${i}">${esc(slotName(names, 'elements', i))}</button>`).join('');

  const trophies = c.trophies.map((t, i) => `
    <div class="trophy">
      <button class="toggle" aria-pressed="${t.won}" data-act="trophy" data-i="${i}" aria-label="Defeated">${t.won ? '✓' : ''}</button>
      <span class="grow">${esc(t.name)}</span>
      <a class="btn small" href="${BASE}fight/?monster=${encodeURIComponent(t.name)}&tier=${tier}">Fight</a>
      <button class="btn small quiet" data-act="drop-trophy" data-i="${i}" aria-label="Remove ${esc(t.name)}">✕</button>
    </div>`).join('');

  const quests = c.quests.map((done, i) =>
    `<button class="toggle quest" aria-pressed="${done}" data-act="quest" data-i="${i}">${i + 1}</button>`).join('');

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
            <div class="label">Trophies</div>
            <p class="note">Add monsters as you meet them. Tick when defeated.</p>
            <div class="trophies">${trophies || '<p class="note">No monsters yet</p>'}</div>
            <form class="row" data-form="trophy">
              <input name="name" placeholder="Monster name" class="grow" aria-label="Monster name">
              <button class="btn" type="submit">Add</button>
            </form>
          </section>
          <section class="box">
            <div class="label">Quests</div>
            <div class="quests">${quests}</div>
          </section>
        </div>
      </div>
    </main>
    ${DISCLAIMER}`;
}

root.addEventListener('click', (ev) => {
  const t = (ev.target as Element).closest<HTMLElement>('[data-act]');
  if (!t) return;
  const i = Number(t.dataset.i);
  switch (t.dataset.act) {
    case 'chapter': c.chapters[i] = !c.chapters[i]; break;
    case 'quest': c.quests[i] = !c.quests[i]; break;
    case 'element': c.forgeElements[i] = !c.forgeElements[i]; break;
    case 'trophy': c.trophies[i].won = !c.trophies[i].won; break;
    case 'drop-trophy': c.trophies.splice(i, 1); break;
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
  if (form.dataset.form === 'trophy') {
    const name = String(data.get('name') ?? '').trim();
    if (name) c.trophies.push({ name, won: false });
  } else if (form.dataset.form === 'achievement') {
    const text = String(data.get('text') ?? '').trim();
    if (text) c.achievements.push(text);
  }
  persist();
  render();
});

render();
