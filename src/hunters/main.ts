import '../shared/wire.css';
import './hunters.css';
import {
  DISCLAIMER, KEYS, SLOT_COUNTS, esc, load, loadNames, save, slotName, topbar,
  type SlotKind, type SlotNames,
} from '../shared/util';

const ROWS = ['A', 'B', 'C', 'D', 'E'] as const;
const KINDS: { kind: SlotKind; title: string }[] = [
  { kind: 'materials', title: 'Materials' },
  { kind: 'plants', title: 'Plants' },
  { kind: 'elements', title: 'Elements' },
];

interface Hunter {
  player: string;
  hunterClass: string;
  /** Skill tree: [tier 1 gained, tier 2 gained] for rows A–E. */
  skills: [boolean, boolean][];
  counts: Record<SlotKind, number[]>;
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
      materials: Array(SLOT_COUNTS.materials).fill(0),
      plants: Array(SLOT_COUNTS.plants).fill(0),
      elements: Array(SLOT_COUNTS.elements).fill(0),
    },
    notes: '',
  };
}

const root = document.getElementById('app')!;
const state = load<Saved>(KEYS.hunters, { hunters: [newHunter()], current: 0 });
let names: SlotNames = loadNames();

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

  const resources = KINDS.map(({ kind, title }) => `
    <section class="box">
      <div class="label">${title}</div>
      <div class="slots">
        ${h.counts[kind].map((n, i) => `
          <div class="counter">
            <input value="${esc(names[kind][i])}" placeholder="${esc(slotName({ ...names, [kind]: [] }, kind, i))}"
              data-name="${kind}" data-i="${i}" aria-label="Name for ${esc(slotName(names, kind, i))}">
            <button class="btn small" data-act="count" data-kind="${kind}" data-i="${i}" data-d="-1" aria-label="Fewer" ${n ? '' : 'disabled'}>−</button>
            <span class="n">${n}</span>
            <button class="btn small" data-act="count" data-kind="${kind}" data-i="${i}" data-d="1" aria-label="More">+</button>
          </div>`).join('')}
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
          <p class="note">Tap a name to rename a slot. Names are shared by every tool on this device.</p>
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
      const list = h.counts[t.dataset.kind as SlotKind];
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
  } else if (el.dataset.name) {
    names = loadNames();
    names[el.dataset.name as SlotKind][Number(el.dataset.i)] = el.value.trim();
    save(KEYS.names, names);
  }
});

render();
