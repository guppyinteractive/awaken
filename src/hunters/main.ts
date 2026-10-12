import '../shared/wire.css';
import './hunters.css';
import { DISCLAIMER, KEYS, esc, load, save, topbar } from '../shared/util';
import { RESOURCES, RESOURCE_KINDS, type ResourceKind } from '../shared/game';

const ROWS = ['A', 'B', 'C', 'D', 'E'] as const;

interface Hunter {
  player: string;
  hunterClass: string;
  /** Skill tree: [tier 1 gained, tier 2 gained] for rows A–E. */
  skills: [boolean, boolean][];
  counts: Record<ResourceKind, number[]>;
  notes: string;
}

interface Saved {
  hunters: Hunter[];
  current: number;
}

function newHunter(): Hunter {
  return {
    player: '',
    hunterClass: '',
    skills: ROWS.map(() => [false, false] as [boolean, boolean]),
    counts: {
      materials: RESOURCES.materials.names.map(() => 0),
      plants: RESOURCES.plants.names.map(() => 0),
      elements: RESOURCES.elements.names.map(() => 0),
    },
    notes: '',
  };
}

const root = document.getElementById('app')!;
const state = load<Saved>(KEYS.hunters, { hunters: [newHunter()], current: 0 });

const hunter = () => state.hunters[state.current];
const persist = () => save(KEYS.hunters, state);

function render(): void {
  const h = hunter();
  const tabs = state.hunters.map((x, i) =>
    `<button class="toggle" aria-pressed="${i === state.current}" data-act="pick" data-i="${i}">${esc(x.player || x.hunterClass || `Hunter ${i + 1}`)}</button>`).join('');

  const skills = ROWS.map((r, i) => `
    <div class="skill-row">
      <span class="mid">${r}</span>
      <button class="toggle" aria-pressed="${h.skills[i][0]}" data-act="skill" data-row="${i}" data-tier="0">${r}1</button>
      <span class="note" aria-hidden="true">→</span>
      <button class="toggle" aria-pressed="${h.skills[i][1]}" data-act="skill" data-row="${i}" data-tier="1">${r}2</button>
    </div>`).join('');

  const resources = RESOURCE_KINDS.map((kind) => `
    <section class="box">
      <div class="label">${RESOURCES[kind].title}</div>
      <div class="slots">
        ${RESOURCES[kind].names.map((name, i) => {
          const n = h.counts[kind][i] ?? 0;
          return `
          <div class="counter">
            <span class="name">${esc(name)}</span>
            <button class="btn small" data-act="count" data-kind="${kind}" data-i="${i}" data-d="-1" aria-label="One less ${esc(name)}" ${n ? '' : 'disabled'}>−</button>
            <span class="n">${n}</span>
            <button class="btn small" data-act="count" data-kind="${kind}" data-i="${i}" data-d="1" aria-label="One more ${esc(name)}">+</button>
          </div>`;
        }).join('')}
      </div>
    </section>`).join('');

  root.innerHTML = `
    ${topbar('Hunter tracker')}
    <main class="page hunters">
      <nav class="row tabs">${tabs}<button class="btn quiet small" data-act="add">+ Hunter</button></nav>
      <div class="cols">
        <div class="col">
          <section class="box who">
            <label class="field"><span class="label">Player name</span>
              <input data-field="player" value="${esc(h.player)}" autocomplete="off"></label>
            <label class="field"><span class="label">Class</span>
              <input data-field="hunterClass" value="${esc(h.hunterClass)}" autocomplete="off"></label>
          </section>
          <section class="box">
            <div class="label">Skill tree</div>
            <p class="note">Mark each step when you've gained those cards.</p>
            <div class="skills">${skills}</div>
          </section>
          <section class="box">
            <label class="field"><span class="label">Notes</span>
              <textarea data-field="notes" rows="4">${esc(h.notes)}</textarea></label>
          </section>
        </div>
        <div class="col">
          ${resources}
        </div>
      </div>
      ${state.hunters.length > 1 ? `<div class="row"><button class="btn alert small" data-act="remove">Remove this hunter</button></div>` : ''}
    </main>
    ${DISCLAIMER}`;
}

root.addEventListener('click', (ev) => {
  const t = (ev.target as Element).closest<HTMLElement>('[data-act]');
  if (!t) return;
  const h = hunter();
  switch (t.dataset.act) {
    case 'pick': state.current = Number(t.dataset.i); break;
    case 'add': state.hunters.push(newHunter()); state.current = state.hunters.length - 1; break;
    case 'remove':
      state.hunters.splice(state.current, 1);
      state.current = Math.max(0, state.current - 1);
      break;
    case 'skill': {
      const row = h.skills[Number(t.dataset.row)];
      const tier = Number(t.dataset.tier);
      row[tier] = !row[tier];
      break;
    }
    case 'count': {
      const list = h.counts[t.dataset.kind as ResourceKind];
      const i = Number(t.dataset.i);
      list[i] = Math.max(0, list[i] + Number(t.dataset.d));
      break;
    }
    default: return;
  }
  persist();
  render();
});

// Text fields save as you type without re-rendering (keeps focus and the keyboard open).
root.addEventListener('input', (ev) => {
  const el = ev.target as HTMLInputElement | HTMLTextAreaElement;
  if (el.dataset.field) {
    (hunter() as unknown as Record<string, string>)[el.dataset.field] = el.value;
    persist();
  }
});

render();
