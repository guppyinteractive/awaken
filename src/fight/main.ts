import '../shared/wire.css';
import './fight.css';
import * as E from '../engine/fight';
import { STATE_DEFS, STATE_IDS, type StateId } from '../engine/states';
import { DISCLAIMER, esc, keepAwake, topbar } from '../shared/util';
import { load, save } from '../shared/store';
import { protectIfInstalled } from '../shared/persist';
import { oneTab } from '../shared/tabs';
import { backUpEverything, backUpPart, currentStatus, messageHtml, statusHtml, type Message } from '../shared/backup';
import { sectorsSvg } from '../shared/sectors';
import { HARDENING_MONSTERS, MONSTERS, trophyFor } from '../shared/game';

type Fight = E.Fight;

type Panel =
  | null
  | { kind: 'hit' }
  | { kind: 'menu' }
  | { kind: 'hardened' }
  | { kind: 'log' }
  | { kind: 'state'; id: StateId }
  | { kind: 'add-state' }
  | { kind: 'stance'; mode: 'reveal' | 'edit'; draft: E.Stance };

interface Saved {
  fight: Fight | null;
  undo: Fight[];
  log: string[];
}

const UNDO_LIMIT = 30;
const LOG_LIMIT = 40;

const root = document.getElementById('app')!;
await oneTab(); // before loading, so an inactive tab never saves
const saved = await load<Saved>('fight', { fight: null, undo: [], log: [] });
let fight: Fight | null = saved.fight;
let undo: Fight[] = saved.undo ?? [];
let log: string[] = saved.log ?? [];
let panel: Panel = null;
/** Big pop-ups over the board. A held one stays until tapped, because the table has something to do. */
let announcements: { what: string; sub: string; alert: boolean; hold?: boolean }[] = [];
let announceTimer = 0;
/** The outcome of the last backup, shown where it was made (the menu or the end of the fight). */
let message: Message | null = null;
let status = await currentStatus();

/** Refresh "Last backed up" once the latest save is in. */
async function refreshStatus(): Promise<void> {
  status = await currentStatus();
  render();
}

/**
 * After a win, whether its trophy can go in the campaign tracker on this
 * device: offered, just recorded, already there, or null (no campaign, a lost
 * fight, or a monster that isn't a trophy).
 */
let trophy: 'offer' | 'recorded' | 'had' | null = null;

async function checkTrophy(): Promise<void> {
  const name = fight?.outcome === 'defeated' ? trophyFor(fight.monster) : null;
  const campaign = name ? await load<{ trophies: string[] } | null>('campaign', null) : null;
  trophy = !campaign ? null : !campaign.trophies.includes(name!) ? 'offer' : trophy === 'recorded' ? 'recorded' : 'had';
}

async function recordTrophy(): Promise<void> {
  const name = trophyFor(fight!.monster)!;
  const campaign = await load<{ trophies: string[] } | null>('campaign', null);
  if (!campaign) return;
  if (!campaign.trophies.includes(name)) await save('campaign', { ...campaign, trophies: [...campaign.trophies, name] });
  trophy = 'recorded';
  await refreshStatus();
}

// ---- State changes ---------------------------------------------------------

function apply(result: E.Result): void {
  if (!fight) return;
  undo = [...undo, fight].slice(-UNDO_LIMIT);
  const ended = !fight.outcome && result.fight.outcome;
  fight = result.fight;
  log = [...result.events.map(E.describe), ...log].slice(0, LOG_LIMIT);
  queueAnnouncements(result.events);
  persist();
  if (ended) {
    message = null;
    trophy = null;
    void checkTrophy().then(refreshStatus);
  }
  // A completed stance always opens the next-stance form.
  if (fight.stancePending && !fight.outcome && panel?.kind !== 'stance') {
    panel = { kind: 'stance', mode: 'reveal', draft: E.blankStance(fight) };
  }
  render();
}

function undoLast(): void {
  const prev = undo.pop();
  if (!prev) return;
  fight = prev;
  log = ['Undo', ...log].slice(0, LOG_LIMIT);
  panel = fight.stancePending ? { kind: 'stance', mode: 'reveal', draft: E.blankStance(fight) } : null;
  persist();
  render();
}

function persist(): void {
  void save('fight', { fight, undo, log } satisfies Saved);
}

function queueAnnouncements(events: E.FightEvent[]): void {
  for (const e of events) {
    if (e.kind === 'wound') announcements.push({ what: 'WOUND', sub: `Health ${e.health}`, alert: false });
    if (e.kind === 'stance-complete') {
      const damage = e.discarded ? `${e.by}: ${e.discarded} damage discarded` : `${e.carried} damage carried over`;
      announcements.push({ what: 'STANCE CHANGE', sub: `Stance ${e.label} complete · ${damage}`, alert: true });
    }
    if (e.kind === 'upkeep') {
      announcements.push({
        what: 'UPKEEP',
        sub: `${e.refresh
          ? 'Behavior refresh: discard the behavior card with the lowest refresh value (all of them if tied) and replace it from the behavior deck.'
          : 'Round 1: no behavior refresh.'} The monster gains ${e.gained} struggle.`,
        alert: false,
        hold: true,
      });
    }
    if (e.kind === 'unleash') announcements.push({ what: 'UNLEASH!', sub: `All hunters suffer ${e.damageValue}`, alert: true });
    if (e.kind === 'defeated') announcements.push({ what: 'MONSTER DEFEATED', sub: '', alert: false });
    if (e.kind === 'timeout') announcements.push({ what: "TIME'S UP", sub: 'Round 10 has ended', alert: true });
    if (e.kind === 'hardening' && e.hardened && !e.was) {
      announcements.push({ what: 'HARDENED', sub: "Damage left after each wound is lost. It can't be stunned, confused or made Vulnerable.", alert: true, hold: true });
    }
    if (e.kind === 'hardening' && e.was && !e.hardened) announcements.push({ what: 'NO LONGER HARDENED', sub: `Hardening ${e.level}`, alert: false });
    if (e.kind === 'state-added' && STATE_DEFS[e.id].onAdd) {
      announcements.push({ what: STATE_DEFS[e.id].name.toUpperCase(), sub: STATE_DEFS[e.id].onAdd!, alert: false, hold: true });
    }
  }
  // Several wounds from one hit read better as one announcement.
  const wounds = announcements.filter((a) => a.what === 'WOUND');
  if (wounds.length > 1) {
    const last = wounds[wounds.length - 1];
    announcements = announcements.filter((a) => a.what !== 'WOUND');
    announcements.unshift({ what: `${wounds.length} WOUNDS`, sub: last.sub, alert: false });
  }
  const lost = events.find((e) => e.kind === 'discarded');
  const wound = announcements.find((a) => a.what.endsWith('WOUND') || a.what.endsWith('WOUNDS'));
  if (lost && wound) wound.sub += ` · ${lost.by}: ${lost.amount} damage discarded`;
  if (!announceTimer) nextAnnouncement();
}

function nextAnnouncement(): void {
  window.clearTimeout(announceTimer);
  announceTimer = 0;
  render();
  if (announcements.length && !announcements[0].hold) {
    announceTimer = window.setTimeout(() => {
      announcements.shift();
      nextAnnouncement();
    }, 2200);
  }
}

// ---- Views -----------------------------------------------------------------

function render(): void {
  root.innerHTML = fight ? boardView(fight) + panelView(fight) : setupView();
  if (announcements.length) {
    const a = announcements[0];
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="announce${a.alert ? ' alert' : ''}" data-act="dismiss-announce">
        <div><div class="what">${esc(a.what)}</div><div class="sub">${esc(a.sub)}</div>${
          a.hold ? '<div class="note">Tap to close</div>' : ''}</div>
      </div>`,
    );
  }
}

function setupView(): string {
  const params = new URLSearchParams(location.search);
  const monster = params.get('monster') ?? '';
  const tier = params.get('tier') ?? '';
  return `
    ${topbar('Fight tracker')}
    <main class="page setup">
      <form class="box sheet-inline" data-form="setup">
        <h1 class="mid">New fight</h1>
        <label class="field"><span class="label">Monster</span>
          <input name="monster" value="${esc(monster)}" placeholder="Monster name" autocomplete="off" list="monsters"></label>
        <datalist id="monsters">${MONSTERS.map((m) => `<option value="${esc(m)}"></option>`).join('')}</datalist>
        <fieldset class="field plain"><legend class="label">Players</legend>
          <div class="row">${[1, 2, 3, 4].map((n) => `
            <label class="toggle radio"><input type="radio" name="players" value="${n}" ${n === 2 ? 'checked' : ''}> ${n}</label>`).join('')}
          </div></fieldset>
        <label class="field"><span class="label">Starting health</span>
          <input name="health" type="number" inputmode="numeric" min="1" value="${E.DEFAULT_HEALTH}"></label>
        <label class="field"><span class="label">Difficulty tier (reminder only)</span>
          <select name="tier">
            <option value="">Not set</option>
            ${[1, 2, 3].map((t) => `<option value="${t}" ${String(t) === tier ? 'selected' : ''}>Tier ${t}</option>`).join('')}
          </select></label>
        <div class="field"><span class="label">Hardening track</span>
          <label class="toggle radio"><input name="hardening" type="checkbox" ${hasHardening(monster) ? 'checked' : ''}> On the monster board</label>
          <span class="note">${HARDENING_MONSTERS.join(' and ')} (p. 95). You can also add it later from the menu.</span></div>
        <button class="btn primary" type="submit">Next: enter Stance I</button>
      </form>
    </main>
    ${DISCLAIMER}`;
}

const hasHardening = (monster: string) => HARDENING_MONSTERS.includes(trophyFor(monster) ?? '');

/** A 0–max counter on the monster board (Acceleration, Hardening). */
function trackView(f: Fight, name: string, act: string, level: number, max: number): string {
  const pips = Array.from({ length: max }, (_, i) => `<span class="pip ${i < level ? 'on' : ''}"></span>`).join('');
  return `
    <div class="row track">
      <span class="label">${name}</span><span class="mid">${level} / ${max}</span>
      <span class="pips">${pips}</span>
      <span class="spacer"></span>
      <button class="btn small" data-act="${act}-down" aria-label="${name} minus 1" ${f.outcome || !level ? 'disabled' : ''}>−</button>
      <button class="btn small" data-act="${act}-up" aria-label="${name} plus 1" ${f.outcome || level >= max ? 'disabled' : ''}>+</button>
    </div>`;
}

function boardView(f: Fight): string {
  const stance = E.currentStance(f);
  const t = E.toughness(f);
  const dmgPct = Number.isFinite(t) ? Math.min(100, (f.damage / t) * 100) : 0;
  const unleash = E.unleashAt(f);
  const strPct = Math.min(100, (f.struggle / unleash) * 100);
  const nextStance = stance?.progression ?? null;

  const healthPips = Array.from({ length: f.startingHealth }, (_, i) => {
    const level = i + 1; // pip i shows health level i+1
    const cls = ['pip', level <= f.health ? 'on' : '', nextStance !== null && level === nextStance ? 'mark' : '']
      .filter(Boolean).join(' ');
    return `<span class="${cls}" title="Health ${level}"></span>`;
  }).join('');

  const roundPips = Array.from({ length: E.MAX_ROUNDS }, (_, i) =>
    `<span class="pip ${i + 1 < f.round ? 'on' : ''} ${i + 1 === f.round ? 'now' : ''}"></span>`).join('');

  const step = f.outcome
    ? f.outcome === 'defeated' ? 'Monster defeated' : "Time's up"
    : f.stancePending ? 'Stance change' : f.upkeepDone ? "Hunters' turns" : 'Consume, then upkeep';

  const keywords = [
    stance?.shield ? `<span class="keyword">Shield ${stance.shield}</span>` : '',
    stance?.resistant ? '<span class="keyword">Resistant</span>' : '',
    E.isHardened(f) ? '<button class="keyword" data-act="hardened-info" aria-label="Hardened: what it does">Hardened</button>' : '',
  ].join('');
  const bonus = stance?.bonusDamage ?? 0;

  const chips = [...new Set(f.states)].map((id) => {
    const n = E.stateCount(f, id);
    return `<button class="chip" data-act="state" data-id="${id}">${esc(STATE_DEFS[id].name)}${n > 1 ? ` ×${n}` : ''} <span class="i" aria-hidden="true">i</span></button>`;
  }).join('');

  return `
    <div class="board">
      <header class="b-head box">
        <div>
          <div class="mid">${esc(f.monster)}</div>
          <div class="note">Stance ${esc(stance?.label ?? '—')}${f.tier ? ` · Tier ${f.tier}` : ''} · ${f.players} player${f.players > 1 ? 's' : ''}</div>
        </div>
        <div class="b-round">
          <div class="label">Round ${f.round} / ${E.MAX_ROUNDS}</div>
          <div class="pips">${roundPips}</div>
          <div class="note">Step: ${esc(step)}</div>
        </div>
      </header>

      <section class="b-health box" data-act="hit" role="button" aria-label="Enter a hit">
        <div class="label">Health</div>
        <div class="row"><span class="big">${f.health}</span><button class="btn quiet small" data-act="edit-stance" aria-label="Edit next stance health">${nextStance !== null ? `Next stance at ${nextStance}` : 'Until defeated'} ✎</button></div>
        <div class="pips">${healthPips}</div>
        <div class="label spaced">Damage</div>
        <div class="row"><span class="mid">${f.damage} / ${Number.isFinite(t) ? t : '—'}</span>
          <span class="note">${stance ? `toughness ${t} (${stance.toughness} × ${f.players})` : ''}</span>${keywords}</div>
        <div class="bar"><span style="width:${dmgPct}%"></span></div>
        ${f.stancePending && f.damage ? `<p class="note alert-text">${f.damage} damage carried over</p>` : ''}
        <p class="note tap-hint">Tap to enter a hit</p>
      </section>

      <section class="b-stance box">
        <div class="label">Exposed sides</div>
        ${stance ? sectorsSvg(stance.exposed, !f.outcome) : '<p class="note">No stance yet</p>'}
        <div class="label spaced">${esc(f.monster)} attack damage</div>
        <div class="row">
          <span class="big">${stance ? E.attackDamage(f) : '—'}</span>
          ${bonus ? `<span class="note">${stance!.damageValue} + ${bonus} bonus</span>` : ''}
          ${stance && !f.outcome ? `<span class="spacer"></span>
            <button class="btn small quiet" data-act="bonus-down" aria-label="Remove a bonus damage token" ${bonus ? '' : 'disabled'}>−</button>
            <button class="btn small quiet" data-act="bonus-up" aria-label="Add a bonus damage token">+ Bonus</button>` : ''}
        </div>
      </section>

      <section class="b-struggle box">
        <div class="label">Struggle</div>
        <div class="row"><span class="big">${f.struggle}</span><span class="note">/ ${unleash} · Unleash at ${unleash}</span>
          <span class="spacer"></span>
          <button class="btn" data-act="struggle-down" aria-label="Struggle minus 1" ${f.outcome ? 'disabled' : ''}>−</button>
          <button class="btn" data-act="struggle-up" aria-label="Struggle plus 1" ${f.outcome ? 'disabled' : ''}>+</button>
        </div>
        <div class="bar ${f.struggle >= unleash - f.players ? 'alert' : ''}"><span style="width:${strPct}%"></span></div>
      </section>

      <section class="b-states box">
        <div class="label">Monster states</div>
        <div class="row">${chips}<button class="btn quiet small" data-act="pick-state" ${f.outcome ? 'disabled' : ''}>+ Add state</button></div>
        ${trackView(f, 'Acceleration', 'acceleration', f.acceleration, E.ACCELERATION_MAX)}
        ${f.hardening === null ? '' : trackView(f, 'Hardening', 'hardening', f.hardening, E.HARDENING_MAX)}
      </section>

      <nav class="b-actions">
        <button class="btn ${f.upkeepDone ? '' : 'primary'}" data-act="upkeep" ${f.outcome || f.stancePending ? 'disabled' : ''}>
          ${f.upkeepDone ? 'Upkeep done' : `Upkeep (+${f.players + f.acceleration})`}</button>
        <button class="btn" data-act="end-round" ${f.outcome || f.stancePending ? 'disabled' : ''}>End round</button>
        <button class="btn" data-act="undo" ${undo.length ? '' : 'disabled'}>Undo</button>
        <button class="btn" data-act="menu">Menu</button>
      </nav>
    </div>
    ${f.outcome ? outcomeView(f) : ''}`;
}

function outcomeView(f: Fight): string {
  if (panel) return '';
  const won = f.outcome === 'defeated';
  return `
    <div class="scrim"><div class="sheet">
      <h2>${won ? 'Monster defeated' : "Time's up"}</h2>
      <p class="note">${won ? `Defeated in round ${f.round}.` : `${f.monster} survived with ${f.health} health.`}</p>
      ${trophyView(f)}
      <div class="nudge">
        <p class="note">Back up now, so the campaign and this fight survive if the browser clears its data.</p>
        <div class="row">
          <button class="btn" data-act="backup-all">Back up everything</button>
          ${statusHtml(status)}
        </div>
        ${messageHtml(message)}
      </div>
      <div class="row">
        <button class="btn ${trophy === 'offer' ? '' : 'primary'}" data-act="new-fight">New fight</button>
        ${trophy ? `<a class="btn" href="${import.meta.env.BASE_URL}campaign/">Back to the campaign</a>` : ''}
        <button class="btn" data-act="undo" ${undo.length ? '' : 'disabled'}>Undo last action</button>
      </div>
    </div></div>`;
}

function trophyView(f: Fight): string {
  const name = esc(trophyFor(f.monster) ?? '');
  switch (trophy) {
    case 'offer': return `
      <div class="row">
        <button class="btn primary" data-act="record-trophy">Record the ${name} trophy</button>
        <span class="note">Ticks it in the campaign tracker.</span>
      </div>`;
    case 'recorded': return `<p class="note" role="status"><strong>${name} trophy recorded</strong> in the campaign tracker.</p>`;
    case 'had': return `<p class="note">The campaign tracker already has the ${name} trophy.</p>`;
    default: return '';
  }
}

function panelView(f: Fight): string {
  if (!panel) return '';
  switch (panel.kind) {
    case 'hit': return hitView(f);
    case 'menu': return menuView(f);
    case 'hardened': return sheet('Hardened', `
      <p>While the hardening level is at 3:</p>
      <ul>
        <li>Each time damage turns into wounds, the damage left over is discarded too, so none carries to the next stance.</li>
        <li>It can't be stunned or confused, and Vulnerable can't be inflicted.</li>
      </ul>
      <p class="note">Rulebook pp. 95 and 109.</p>`);
    case 'log': return sheet('Log', `<ol class="log">${log.map((l) => `<li>${esc(l)}</li>`).join('') || '<li class="note">Nothing yet</li>'}</ol>`);
    case 'state': return stateView(f, panel.id);
    case 'add-state': return addStateView(f);
    case 'stance': return stanceView(f, panel.mode, panel.draft);
  }
}

function sheet(title: string, body: string, closable = true): string {
  return `
    <div class="scrim" ${closable ? 'data-act="close" data-self' : ''}>
      <div class="sheet" role="dialog" aria-label="${esc(title)}">
        <div class="row"><h2>${esc(title)}</h2><span class="spacer"></span>
          ${closable ? '<button class="btn small" data-act="close">Close</button>' : ''}</div>
        ${body}
      </div>
    </div>`;
}

function hitView(f: Fight): string {
  const vuln = E.hasState(f, 'vulnerable');
  const shield = E.currentStance(f)?.shield ?? 0;
  return sheet('Hit', `
    <div class="hit-grid">
      ${[1, 2, 3, 4, 5, 6].map((n) => `<button class="btn mid" data-act="deal" data-n="${n}">+${n}</button>`).join('')}
    </div>
    <form class="row" data-form="custom-hit">
      <input name="amount" type="number" inputmode="numeric" min="1" placeholder="Amount" class="grow" aria-label="Custom amount">
      <button class="btn primary" type="submit">Deal</button>
    </form>
    ${vuln ? `<label class="row"><input type="checkbox" name="vuln" id="use-vuln"> Use Vulnerable (×2 this hit)</label>` : ''}
    ${shield ? `<p class="note">Enter the hit before the Shield: <strong>Shield ${shield}</strong> takes ${shield} off each hit${vuln ? ', after Vulnerable doubles it' : ''}.</p>` : ''}
    <div class="row">
      <button class="btn quiet small" data-act="damage-down">Damage −1 (correction)</button>
    </div>`);
}

function menuView(f: Fight): string {
  return sheet('Menu', `
    <div class="menu-list">
      <button class="btn" data-act="edit-stance">Edit current stance</button>
      ${f.hardening === null && !f.outcome ? '<button class="btn" data-act="add-hardening">Add the Hardening track</button>' : ''}
      <button class="btn" data-act="wound-effect">+1 wound (card effect)</button>
      <div class="row"><span class="note grow">Health correction</span>
        <button class="btn small" data-act="health-down">−1</button>
        <button class="btn small" data-act="health-up">+1</button></div>
      <button class="btn" data-act="log">Log</button>
      <button class="btn" data-act="backup-all">Back up everything</button>
      <button class="btn" data-act="backup">Back up this fight</button>
      ${statusHtml(status)}
      ${messageHtml(message)}
      <a class="btn" href="${import.meta.env.BASE_URL}">Home</a>
      <button class="btn alert" data-act="new-fight">New fight</button>
    </div>`);
}

function addStateView(f: Fight): string {
  const ends = (id: StateId) => ({ 'end-of-round': 'ends this round', 'start-of-next-round': 'ends next round', manual: 'until removed' })[STATE_DEFS[id].ends];
  return sheet('Add a state', `
    <div class="menu-list">${STATE_IDS.map((id) => {
      const n = E.stateCount(f, id);
      const has = STATE_DEFS[id].single && n > 0;
      const blocked = E.blockedByHardened(f, id);
      return `<button class="btn state-pick" data-act="add-state" data-id="${id}" ${E.canAddState(f, id) ? '' : 'disabled'}>
        <strong>${esc(STATE_DEFS[id].name)}</strong>
        <span class="note">${blocked ? "can't while Hardened" : has ? 'already on' : n ? `${n} of ${STATE_DEFS[id].max ?? '∞'} on` : ends(id)}</span></button>`;
    }).join('')}</div>`);
}

function stateView(f: Fight, id: StateId): string {
  const def = STATE_DEFS[id];
  const ends = def.ends === 'end-of-round' ? 'End of this round' : def.ends === 'start-of-next-round' ? 'Start of next round' : 'Only when removed';
  const n = E.stateCount(f, id);
  const controls = def.single
    ? `<button class="btn alert" data-act="remove-state" data-id="${id}">Remove ${esc(def.name)}</button>`
    : `<span class="note grow">Tokens: <strong>${n}</strong></span>
       <button class="btn small" data-act="remove-state" data-id="${id}" aria-label="Remove one ${esc(def.name)} token">−1</button>
       <button class="btn small" data-act="add-state" data-id="${id}" aria-label="Add one ${esc(def.name)} token" ${E.canAddState(f, id) ? '' : 'disabled'}>+1</button>`;
  return sheet(def.name, `
    ${def.onAdd ? `<p><strong>When added:</strong> ${esc(def.onAdd)}</p>` : ''}
    <p>${esc(def.hint)}</p>
    <p class="note">Ends: ${ends} · Rulebook p. ${def.page}</p>
    <div class="row">${controls}</div>`);
}

function stanceView(f: Fight, mode: 'reveal' | 'edit', d: E.Stance): string {
  const title = mode === 'reveal' ? `Enter Stance ${d.label}` : `Edit Stance ${d.label}`;
  const badProgression = d.progression !== null && d.progression >= f.health;
  return sheet(title, `
    <form class="stance-form" data-form="stance">
      ${mode === 'reveal' && f.damage ? `<p class="alert-text"><strong>${f.damage} damage carried over</strong> will be applied when you save.</p>` : ''}
      <div class="two">
        <label class="field"><span class="label">Label</span><input name="label" value="${esc(d.label)}"></label>
        <label class="field"><span class="label">Toughness (per player)</span>
          <input name="toughness" type="number" inputmode="numeric" min="1" value="${d.toughness}">
          <span class="note">× ${f.players} players = ${d.toughness * f.players}</span></label>
        <label class="field"><span class="label">Next stance at health</span>
          <input name="progression" type="number" inputmode="numeric" min="0" value="${d.progression ?? ''}" placeholder="Blank = until defeated">
          <span class="note ${badProgression ? 'alert-text' : ''}">Health now ${f.health}. ${badProgression ? 'Should be lower than current health.' : 'The stance card\'s progression value.'}</span></label>
        <label class="field"><span class="label">${esc(f.monster)} attack damage</span>
          <input name="damageValue" type="number" inputmode="numeric" min="0" value="${d.damageValue}"></label>
        <label class="field"><span class="label">Shield</span>
          <input name="shield" type="number" inputmode="numeric" min="0" value="${d.shield || ''}" placeholder="None">
          <span class="note">Shield X on the card: each hit is reduced by X (p. 112).</span></label>
        <div class="field"><span class="label">Resistant</span>
          <label class="toggle radio"><input name="resistant" type="checkbox" ${d.resistant ? 'checked' : ''}> On the card</label>
          <span class="note">No damage carries over when this stance completes (p. 111).</span></div>
      </div>
      <div class="field"><span class="label">Exposed sides (tap to toggle, front is at the bottom)</span>
        ${sectorsSvg(d.exposed, true, 'draft-sector')}</div>
      <div class="row">
        <button class="btn primary" type="submit">${mode === 'reveal' ? 'Reveal stance' : 'Save changes'}</button>
        ${mode === 'reveal' ? `<button class="btn" type="button" data-act="undo" ${undo.length ? '' : 'disabled'}>Undo last action</button>` : ''}
      </div>
    </form>`, mode === 'edit');
}

// ---- Events ----------------------------------------------------------------

/** Copy the stance form's inputs into the draft before re-rendering. */
function syncDraft(): void {
  if (panel?.kind !== 'stance') return;
  const form = root.querySelector<HTMLFormElement>('form[data-form="stance"]');
  if (!form) return;
  const data = new FormData(form);
  const num = (k: string, fallback: number) => {
    const v = Number(data.get(k));
    return Number.isFinite(v) && String(data.get(k)).trim() !== '' ? v : fallback;
  };
  const prog = String(data.get('progression') ?? '').trim();
  panel.draft = {
    ...panel.draft,
    label: String(data.get('label') ?? '').trim() || panel.draft.label,
    toughness: Math.max(1, num('toughness', panel.draft.toughness)),
    progression: prog === '' ? null : Math.max(0, Number(prog)),
    damageValue: Math.max(0, num('damageValue', panel.draft.damageValue)),
    shield: Math.max(0, Math.round(num('shield', 0))),
    resistant: data.get('resistant') === 'on',
  };
}

root.addEventListener('click', async (ev) => {
  const target = (ev.target as Element).closest<HTMLElement>('[data-act]');
  if (!target) return;
  const act = target.dataset.act!;
  // Clicking the scrim itself closes a panel; clicks inside the sheet don't.
  if (target.hasAttribute('data-self') && ev.target !== target) return;

  if (act === 'dismiss-announce') {
    announcements.shift();
    nextAnnouncement();
    return;
  }
  if (act === 'new-fight') {
    fight = null;
    undo = [];
    log = [];
    panel = null;
    persist();
    render();
    return;
  }
  if (!fight) return;
  const f = fight;
  const id = target.dataset.id as StateId | undefined;

  switch (act) {
    case 'close': panel = null; render(); break;
    case 'hit': if (!f.outcome) { panel = { kind: 'hit' }; render(); } break;
    case 'menu': panel = { kind: 'menu' }; message = null; void refreshStatus(); break;
    case 'backup':
    case 'backup-all':
      message = act === 'backup' ? await backUpPart('fight', { fight, undo, log } satisfies Saved) : await backUpEverything();
      await refreshStatus();
      break;
    case 'log': panel = { kind: 'log' }; render(); break;
    case 'state': panel = { kind: 'state', id: id! }; render(); break;
    case 'deal': {
      const useVuln = root.querySelector<HTMLInputElement>('#use-vuln')?.checked ?? false;
      panel = null;
      apply(E.dealDamage(f, Number(target.dataset.n), useVuln));
      break;
    }
    case 'damage-down': panel = null; apply(E.correct(f, 'damage', -1)); break;
    case 'health-down': apply(E.correct(f, 'health', -1)); break;
    case 'health-up': apply(E.correct(f, 'health', 1)); break;
    case 'wound-effect': panel = null; apply(E.inflictWound(f)); break;
    case 'edit-stance': {
      const s = E.currentStance(f);
      if (s) { panel = { kind: 'stance', mode: 'edit', draft: structuredClone(s) }; render(); }
      break;
    }
    case 'sector': apply(E.toggleExposed(f, target.dataset.sector as E.Sector)); break;
    case 'draft-sector':
      if (panel?.kind === 'stance') {
        syncDraft();
        const s = target.dataset.sector as E.Sector;
        panel.draft.exposed[s] = !panel.draft.exposed[s];
        render();
      }
      break;
    case 'upkeep': apply(E.monsterUpkeep(f)); break;
    case 'end-round': apply(E.endRound(f)); break;
    case 'struggle-up': apply(E.gainStruggle(f, 1)); break;
    case 'bonus-up': apply(E.changeBonus(f, 1)); break;
    case 'acceleration-up': apply(E.changeAcceleration(f, 1)); break;
    case 'acceleration-down': apply(E.changeAcceleration(f, -1)); break;
    case 'hardening-up': apply(E.changeHardening(f, 1)); break;
    case 'hardening-down': apply(E.changeHardening(f, -1)); break;
    case 'add-hardening': panel = null; apply(E.changeHardening(f, 0)); break;
    case 'hardened-info': panel = { kind: 'hardened' }; render(); break;
    case 'bonus-down': apply(E.changeBonus(f, -1)); break;
    case 'struggle-down': apply(E.loseStruggle(f, 1)); break;
    case 'pick-state': panel = { kind: 'add-state' }; render(); break;
    case 'add-state':
      if (panel?.kind === 'add-state') panel = null;
      apply(E.addState(f, id!));
      break;
    case 'remove-state':
      if (STATE_DEFS[id!].single || E.stateCount(f, id!) <= 1) panel = null;
      apply(E.removeState(f, id!));
      break;
    case 'undo': undoLast(); break;
    case 'record-trophy': await recordTrophy(); break;
  }
});

root.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const form = ev.target as HTMLFormElement;
  const data = new FormData(form);
  switch (form.dataset.form) {
    case 'setup': {
      const tier = String(data.get('tier') ?? '');
      fight = E.createFight({
        monster: trophyFor(String(data.get('monster') ?? '')) ?? String(data.get('monster') ?? ''),
        players: Number(data.get('players') ?? 2),
        startingHealth: Math.max(1, Number(data.get('health')) || E.DEFAULT_HEALTH),
        tier: tier ? Number(tier) : null,
        hardening: data.get('hardening') === 'on',
      });
      undo = [];
      log = [`New fight: ${fight.monster}, ${fight.players} players, health ${fight.health}`];
      panel = { kind: 'stance', mode: 'reveal', draft: E.blankStance(fight) };
      persist();
      render();
      break;
    }
    case 'custom-hit': {
      const amount = Math.round(Number(data.get('amount')));
      if (!fight || !(amount > 0)) return;
      const useVuln = root.querySelector<HTMLInputElement>('#use-vuln')?.checked ?? false;
      panel = null;
      apply(E.dealDamage(fight, amount, useVuln));
      break;
    }
    case 'stance': {
      if (!fight || panel?.kind !== 'stance') return;
      syncDraft();
      const { mode, draft } = panel;
      panel = null;
      apply(mode === 'reveal' ? E.revealStance(fight, draft) : E.editStance(fight, draft));
      break;
    }
  }
});

// Tick the Hardening track when a monster that has one is picked.
root.addEventListener('input', (ev) => {
  const input = ev.target as HTMLInputElement;
  if (input.name !== 'monster' || !hasHardening(input.value)) return;
  const box = input.form?.querySelector<HTMLInputElement>('input[name="hardening"]');
  if (box) box.checked = true;
});

// Reopen the stance form after a reload mid-change.
if (fight?.stancePending && !fight.outcome) {
  panel = { kind: 'stance', mode: 'reveal', draft: E.blankStance(fight) };
}
if (fight?.outcome) await checkTrophy(); // reopened on the end-of-fight screen
keepAwake();
void protectIfInstalled();
render();
