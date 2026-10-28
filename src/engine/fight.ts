// Fight rules engine. Pure functions: each action takes a Fight and returns a
// new Fight plus the events it caused (for announcements and the log).
// Rulebook references: damage and wounds p. 23, struggle p. 18, glossary pp. 104-116.

import { STATE_DEFS, type StateId } from './states';

export const MAX_ROUNDS = 10;
export const DEFAULT_HEALTH = 10;
export const UNLEASH_PER_PLAYER = 3;
/** The Hardening track runs 0–3; at 3 the monster is Hardened (pp. 95, 109). */
export const HARDENING_MAX = 3;

/** Jekoros' Charge track runs 0–3 (p. 95); its cards read the level. */
export const CHARGE_MAX = 3;
/** Acceleration tokens (p. 106): the game has 4. Each adds 1 Struggle at monster upkeep. */
export const ACCELERATION_MAX = 4;
/** States that can't be added while the monster is Hardened (p. 109). */
export const HARDENED_BLOCKS: readonly StateId[] = ['stunned', 'confused', 'vulnerable'];

/** Sectors in exposure-diagram order. The front is drawn at the bottom. */
export const SECTORS = ['front', 'right', 'rear', 'left'] as const;
export type Sector = (typeof SECTORS)[number];

export interface Stance {
  /** "I", "II", "III"... editable. */
  label: string;
  /** Printed toughness number; multiplied by the player count. */
  toughness: number;
  /** Health at which this stance completes. null = lasts until the monster is defeated. */
  progression: number | null;
  /** The stance's damage value (what hunters suffer on an Unleash). */
  damageValue: number;
  exposed: Record<Sector, boolean>;
  /** Keyword Resistant (p. 111): no damage carries over when this stance completes. */
  resistant: boolean;
  /** Keyword Shield X (p. 112): each source of damage is reduced by X. 0 = no Shield. */
  shield: number;
  /** Bonus damage tokens on this stance card (p. 104), added to its damage value. */
  bonusDamage: number;
}

export type Outcome = 'defeated' | 'timeout';

export interface Fight {
  version: 1;
  monster: string;
  players: number;
  startingHealth: number;
  /** Campaign difficulty tier, shown only as a reminder. */
  tier: number | null;
  health: number;
  /** Damage sitting on the current stance card (or carried over while a stance is pending). */
  damage: number;
  /** Stances revealed so far; the last one is current. */
  stances: Stance[];
  /** True when the next stance must be entered before play continues. */
  stancePending: boolean;
  struggle: number;
  round: number;
  upkeepDone: boolean;
  states: StateId[];
  /** Acceleration tokens on the monster board, 0–4 (p. 106). */
  acceleration: number;
  /** Hardening track level, 0–3 (p. 95), or null when the monster has no track. */
  hardening: number | null;
  /** Charge track level, 0–3 (p. 95), or null when the monster has no track. */
  charge: number | null;
  outcome: Outcome | null;
}

export type FightEvent =
  /** `base` as entered, ×2 if `doubled`, less `shield`, deals `amount`. */
  | { kind: 'hit'; base: number; doubled: boolean; shield: number; amount: number }
  | { kind: 'wound'; health: number; source: 'damage' | 'effect' }
  /** A Resistant stance (or a Hardened monster) discards its excess damage instead of carrying it. */
  | { kind: 'stance-complete'; label: string; carried: number; discarded: number; by: Discarder | null }
  /** A Hardened monster loses the damage left after wounds. */
  | { kind: 'discarded'; amount: number; by: Discarder }
  | { kind: 'hardening'; level: number; hardened: boolean; was: boolean }
  | { kind: 'acceleration'; level: number }
  | { kind: 'charge'; level: number }
  | { kind: 'stance-revealed'; label: string }
  | { kind: 'defeated' }
  | { kind: 'struggle'; amount: number; total: number }
  | { kind: 'unleash'; damageValue: number; resetTo: number }
  /** `refresh`: the behavior cards are refreshed first (every round but the first, p. 17). */
  | { kind: 'upkeep'; gained: number; refresh: boolean }
  | { kind: 'state-added'; id: StateId }
  | { kind: 'bonus'; total: number }
  | { kind: 'state-removed'; id: StateId; reason: 'used' | 'removed' | 'expired' }
  | { kind: 'round'; round: number }
  | { kind: 'timeout' }
  | { kind: 'correction'; text: string };

export type Discarder = 'Resistant' | 'Hardened';

export interface Result {
  fight: Fight;
  events: FightEvent[];
}

export interface NewFight {
  monster: string;
  players: number;
  startingHealth?: number;
  tier?: number | null;
  /** Start with the Hardening track at 0. */
  hardening?: boolean;
  /** Start with the Charge track at 0. */
  charge?: boolean;
}

export function createFight(opts: NewFight): Fight {
  const health = opts.startingHealth ?? DEFAULT_HEALTH;
  return {
    version: 1,
    monster: opts.monster.trim() || 'Monster',
    players: clamp(Math.round(opts.players), 1, 4),
    startingHealth: health,
    tier: opts.tier ?? null,
    health,
    damage: 0,
    stances: [],
    stancePending: true,
    struggle: 0,
    round: 1,
    upkeepDone: false,
    states: [],
    acceleration: 0,
    hardening: opts.hardening ? 0 : null,
    charge: opts.charge ? 0 : null,
    outcome: null,
  };
}

/** Stance cards are numbered I, II and III (p. 6). */
export const STANCE_LABELS = ['I', 'II', 'III'] as const;

/** The stance after the current one: I, then II, then III, which stays III. Counts stances if the current number isn't one of these. */
export function nextStanceLabel(fight: Fight): string {
  const prev = currentStance(fight)?.label;
  const i = prev === undefined ? -1 : (STANCE_LABELS as readonly string[]).indexOf(prev);
  const next = i >= 0 ? i + 1 : fight.stances.length;
  return STANCE_LABELS[Math.min(next, STANCE_LABELS.length - 1)];
}

export function blankStance(fight: Fight): Stance {
  const prev = currentStance(fight);
  return {
    label: nextStanceLabel(fight),
    toughness: prev?.toughness ?? 2,
    progression: null,
    damageValue: prev?.damageValue ?? 0,
    exposed: { front: false, right: false, rear: false, left: false },
    // Keywords and bonus tokens belong to one stance card, so a new one starts without them.
    resistant: false,
    shield: 0,
    bonusDamage: 0,
  };
}

export function currentStance(fight: Fight): Stance | undefined {
  return fight.stances[fight.stances.length - 1];
}

/** Damage needed for one wound in the current stance. */
export function toughness(fight: Fight): number {
  const stance = currentStance(fight);
  return stance ? stance.toughness * fight.players : Infinity;
}

/** The monster's attack damage: the stance's damage value plus bonus damage tokens. */
export function attackDamage(fight: Fight): number {
  const stance = currentStance(fight);
  return stance ? stance.damageValue + stance.bonusDamage : 0;
}

export function unleashAt(fight: Fight): number {
  return UNLEASH_PER_PLAYER * fight.players;
}

export function hasState(fight: Fight, id: StateId): boolean {
  return fight.states.includes(id);
}

/** How many of a state the monster has (stacking states like Acceleration). */
export function stateCount(fight: Fight, id: StateId): number {
  return fight.states.filter((s) => s === id).length;
}

export function isHardened(fight: Fight): boolean {
  return fight.hardening === HARDENING_MAX;
}

/** Hardened blocks this state (p. 109). */
export function blockedByHardened(fight: Fight, id: StateId): boolean {
  return isHardened(fight) && HARDENED_BLOCKS.includes(id);
}

export function canAddState(fight: Fight, id: StateId): boolean {
  const def = STATE_DEFS[id];
  const full = def.single ? hasState(fight, id) : stateCount(fight, id) >= (def.max ?? Infinity);
  return !full && !blockedByHardened(fight, id);
}

// ---- Actions -------------------------------------------------------------

/**
 * A hit for `amount` damage, optionally spending Vulnerable to double it, then
 * reduced by the stance's Shield. The rules don't order the two; Shield comes
 * last because it reduces the damage the monster is actually dealt.
 */
export function dealDamage(fight: Fight, amount: number, useVulnerable = false): Result {
  const f = clone(fight);
  const events: FightEvent[] = [];
  if (f.outcome || amount <= 0) return { fight: f, events };
  const doubled = useVulnerable && hasState(f, 'vulnerable');
  if (doubled) {
    f.states = f.states.filter((s) => s !== 'vulnerable');
    events.push({ kind: 'state-removed', id: 'vulnerable', reason: 'used' });
  }
  const raw = doubled ? amount * 2 : amount;
  const shield = Math.min(raw, currentStance(f)?.shield ?? 0);
  f.damage += raw - shield;
  events.push({ kind: 'hit', base: amount, doubled, shield, amount: raw - shield });
  resolveWounds(f, events);
  return { fight: f, events };
}

/** A card effect that inflicts a wound directly, without damage. */
export function inflictWound(fight: Fight): Result {
  const f = clone(fight);
  const events: FightEvent[] = [];
  if (f.outcome) return { fight: f, events };
  woundOnce(f, events, 'effect');
  if (!f.outcome && !f.stancePending) resolveWounds(f, events);
  return { fight: f, events };
}

/** Reveal the next stance (or the first one). Carried-over damage is then applied. */
export function revealStance(fight: Fight, stance: Stance): Result {
  const f = clone(fight);
  const events: FightEvent[] = [];
  f.stances.push(clone(stance));
  f.stancePending = false;
  events.push({ kind: 'stance-revealed', label: stance.label });
  resolveWounds(f, events);
  return { fight: f, events };
}

/** Fix the current stance (typos). Re-checks wounds against the new toughness. */
export function editStance(fight: Fight, stance: Stance): Result {
  const f = clone(fight);
  const events: FightEvent[] = [];
  if (!f.stances.length) return { fight: f, events };
  f.stances[f.stances.length - 1] = clone(stance);
  events.push({ kind: 'correction', text: `Edited stance ${stance.label}` });
  resolveWounds(f, events);
  return { fight: f, events };
}

export function toggleExposed(fight: Fight, sector: Sector): Result {
  const f = clone(fight);
  const stance = currentStance(f);
  if (stance) stance.exposed[sector] = !stance.exposed[sector];
  return { fight: f, events: [] };
}

/**
 * Monster upkeep (p. 17): the table refreshes the behavior cards (not in round 1),
 * then +1 struggle per player and per Acceleration token, then the Unleash check.
 */
export function monsterUpkeep(fight: Fight): Result {
  const f = clone(fight);
  const events: FightEvent[] = [];
  if (f.outcome) return { fight: f, events };
  f.upkeepDone = true;
  const gained = f.players + f.acceleration;
  events.push({ kind: 'upkeep', gained, refresh: f.round > 1 });
  gainStruggleInto(f, gained, events);
  return { fight: f, events };
}

/** The monster gains struggle (Unleash is checked only on a gain). */
export function gainStruggle(fight: Fight, amount = 1): Result {
  const f = clone(fight);
  const events: FightEvent[] = [];
  if (f.outcome) return { fight: f, events };
  gainStruggleInto(f, amount, events);
  return { fight: f, events };
}

/** Struggle spent on a boost or removed by a card. Never triggers an Unleash. */
export function loseStruggle(fight: Fight, amount = 1): Result {
  const f = clone(fight);
  f.struggle = Math.max(0, f.struggle - amount);
  return { fight: f, events: [{ kind: 'struggle', amount: -amount, total: f.struggle }] };
}

export function addState(fight: Fight, id: StateId): Result {
  const f = clone(fight);
  if (!canAddState(f, id) || f.outcome) return { fight: f, events: [] };
  f.states.push(id);
  return { fight: f, events: [{ kind: 'state-added', id }] };
}

/** Remove one of a state (one token, for stacking states). */
export function removeState(fight: Fight, id: StateId): Result {
  const f = clone(fight);
  if (!hasState(f, id)) return { fight: f, events: [] };
  f.states.splice(f.states.lastIndexOf(id), 1);
  return { fight: f, events: [{ kind: 'state-removed', id, reason: 'removed' }] };
}

/**
 * End the round: clear end-of-round states, advance the round (or time out
 * after round 10), then clear start-of-next-round states.
 */
export function endRound(fight: Fight): Result {
  const f = clone(fight);
  const events: FightEvent[] = [];
  if (f.outcome) return { fight: f, events };
  expireStates(f, 'end-of-round', events);
  if (f.round >= MAX_ROUNDS) {
    f.outcome = 'timeout';
    events.push({ kind: 'timeout' });
    return { fight: f, events };
  }
  f.round += 1;
  f.upkeepDone = false;
  events.push({ kind: 'round', round: f.round });
  expireStates(f, 'start-of-next-round', events);
  return { fight: f, events };
}

/** Add or remove bonus damage tokens on the current stance. */
export function changeBonus(fight: Fight, delta: number): Result {
  const f = clone(fight);
  const stance = currentStance(f);
  if (!stance || f.outcome) return { fight: f, events: [] };
  stance.bonusDamage = Math.max(0, stance.bonusDamage + delta);
  return { fight: f, events: [{ kind: 'bonus', total: stance.bonusDamage }] };
}

/** Move the hardening marker. Starts the track if the fight didn't have one. */
export function changeHardening(fight: Fight, delta: number): Result {
  const f = clone(fight);
  if (f.outcome) return { fight: f, events: [] };
  const was = isHardened(f);
  f.hardening = clamp((f.hardening ?? 0) + delta, 0, HARDENING_MAX);
  return { fight: f, events: [{ kind: 'hardening', level: f.hardening, hardened: isHardened(f), was }] };
}

/** Move the charge marker. Starts the track if the fight didn't have one. */
export function changeCharge(fight: Fight, delta: number): Result {
  const f = clone(fight);
  if (f.outcome) return { fight: f, events: [] };
  f.charge = clamp((f.charge ?? 0) + delta, 0, CHARGE_MAX);
  return { fight: f, events: [{ kind: 'charge', level: f.charge }] };
}

/** Add or remove Acceleration tokens, 0–4. */
export function changeAcceleration(fight: Fight, delta: number): Result {
  const f = clone(fight);
  if (f.outcome) return { fight: f, events: [] };
  f.acceleration = clamp(f.acceleration + delta, 0, ACCELERATION_MAX);
  return { fight: f, events: [{ kind: 'acceleration', level: f.acceleration }] };
}

/** Manual fixes that skip the rules (wrong tap, missed token). */
export function correct(fight: Fight, field: 'health' | 'damage', delta: number): Result {
  const f = clone(fight);
  if (field === 'health') f.health = clamp(f.health + delta, 0, f.startingHealth);
  else f.damage = Math.max(0, f.damage + delta);
  const sign = delta > 0 ? '+' : '';
  return { fight: f, events: [{ kind: 'correction', text: `${field} ${sign}${delta}` }] };
}

// ---- Internals -----------------------------------------------------------

/** Inflict wounds one at a time while damage covers the current toughness. */
function resolveWounds(f: Fight, events: FightEvent[]): void {
  let wounded = false;
  while (!f.outcome && !f.stancePending && f.damage >= toughness(f)) {
    f.damage -= toughness(f);
    woundOnce(f, events, 'damage');
    wounded = true;
  }
  // Hardened: converting damage into wounds removes all of it (p. 109).
  if (wounded && !f.outcome && !f.stancePending && isHardened(f) && f.damage > 0) {
    events.push({ kind: 'discarded', amount: f.damage, by: 'Hardened' });
    f.damage = 0;
  }
}

function woundOnce(f: Fight, events: FightEvent[], source: 'damage' | 'effect'): void {
  f.health = Math.max(0, f.health - 1);
  events.push({ kind: 'wound', health: f.health, source });
  if (f.health === 0) {
    f.outcome = 'defeated';
    events.push({ kind: 'defeated' });
    return;
  }
  const stance = currentStance(f);
  if (stance && stance.progression !== null && f.health <= stance.progression) {
    f.stancePending = true;
    const by: Discarder | null = stance.resistant ? 'Resistant' : isHardened(f) ? 'Hardened' : null;
    const discarded = by ? f.damage : 0;
    f.damage -= discarded;
    events.push({ kind: 'stance-complete', label: stance.label, carried: f.damage, discarded, by: discarded ? by : null });
  }
}

function gainStruggleInto(f: Fight, amount: number, events: FightEvent[]): void {
  f.struggle += amount;
  events.push({ kind: 'struggle', amount, total: f.struggle });
  if (f.struggle >= unleashAt(f)) {
    f.struggle = f.players;
    events.push({
      kind: 'unleash',
      damageValue: attackDamage(f),
      resetTo: f.struggle,
    });
  }
}

function expireStates(f: Fight, when: 'end-of-round' | 'start-of-next-round', events: FightEvent[]): void {
  for (const id of f.states.filter((s) => STATE_DEFS[s].ends === when)) {
    events.push({ kind: 'state-removed', id, reason: 'expired' });
  }
  f.states = f.states.filter((s) => STATE_DEFS[s].ends !== when);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** One-line log text for an event. */
export function describe(e: FightEvent): string {
  switch (e.kind) {
    case 'hit': {
      const steps = `${e.doubled ? ' ×2 (Vulnerable)' : ''}${e.shield ? ` −${e.shield} (Shield)` : ''}`;
      return `Hit ${e.base}${steps ? `${steps} = ${e.amount}` : ''}`;
    }
    case 'wound': return `Wound${e.source === 'effect' ? ' (card effect)' : ''} → health ${e.health}`;
    case 'stance-complete': return e.discarded
      ? `Stance ${e.label} complete, ${e.by}: ${e.discarded} damage discarded`
      : `Stance ${e.label} complete, ${e.carried} damage carried over`;
    case 'stance-revealed': return `Stance ${e.label} revealed`;
    case 'defeated': return 'Monster defeated';
    case 'struggle': return `Struggle ${e.amount > 0 ? '+' : ''}${e.amount} → ${e.total}`;
    case 'unleash': return `Unleash! Hunters suffer ${e.damageValue}. Struggle reset to ${e.resetTo}`;
    case 'upkeep': return `Upkeep${e.refresh ? ': behavior refresh,' : ''} +${e.gained} struggle`;
    case 'state-added': return `${STATE_DEFS[e.id].name} added`;
    case 'discarded': return `${e.by}: ${e.amount} damage discarded`;
    case 'hardening': return `Hardening → ${e.level}${e.hardened && !e.was ? ' (Hardened)' : e.was && !e.hardened ? ' (no longer Hardened)' : ''}`;
    case 'acceleration': return `Acceleration → ${e.level}`;
    case 'charge': return `Charge → ${e.level}`;
    case 'bonus': return `Bonus damage → +${e.total}`;
    case 'state-removed': return `${STATE_DEFS[e.id].name} ${e.reason}`;
    case 'round': return `Round ${e.round}`;
    case 'timeout': return "Time's up";
    case 'correction': return `Correction: ${e.text}`;
  }
}
