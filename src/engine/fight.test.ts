import { describe, expect, it } from 'vitest';
import {
  addState, attackDamage, blankStance, canAddState, changeAcceleration, changeBonus, changeCharge, changeHardening, isHardened, createFight, dealDamage, describe as text, endRound, gainStruggle,
  inflictWound, loseStruggle, monsterUpkeep, removeState, revealStance, stateCount, toughness,
  type Fight, type Stance,
} from './fight';

function stance(toughness: number, progression: number | null, damageValue = 3): Stance {
  return {
    label: 'S',
    toughness,
    progression,
    damageValue,
    exposed: { front: true, right: false, rear: true, left: false },
    resistant: false,
    shield: 0,
    bonusDamage: 0,
  };
}

function fightWith(players: number, health: number, s: Stance): Fight {
  return revealStance(createFight({ monster: 'Test', players, startingHealth: health }), s).fight;
}

describe('damage and wounds (rulebook p. 23)', () => {
  it('matches the rulebook example: 13 damage, 2 players, 9 health', () => {
    let f = fightWith(2, 9, { ...stance(2, 7), label: 'I' });
    expect(toughness(f)).toBe(4);

    const hit = dealDamage(f, 13);
    f = hit.fight;
    expect(f.health).toBe(7);
    expect(f.damage).toBe(5);
    expect(f.stancePending).toBe(true);
    expect(hit.events.filter((e) => e.kind === 'wound')).toHaveLength(2);

    // Stance II toughness is 3 per player = 6, so the 5 carried over is not enough.
    f = revealStance(f, { ...stance(3, 4), label: 'II' }).fight;
    expect(f.health).toBe(7);
    expect(f.damage).toBe(5);
    expect(f.stancePending).toBe(false);
  });

  it('holds damage dealt while a stance is pending, then applies it', () => {
    let f = fightWith(2, 9, stance(2, 7));
    f = dealDamage(f, 13).fight; // pending, 5 carried
    f = dealDamage(f, 3).fight; // still pending, 8 carried
    expect(f.health).toBe(7);
    expect(f.damage).toBe(8);
    f = revealStance(f, stance(3, 4)).fight; // toughness 6 → 1 wound, 2 left
    expect(f.health).toBe(6);
    expect(f.damage).toBe(2);
  });

  it('chains into another stance change from carried-over damage', () => {
    let f = fightWith(1, 10, stance(2, 9));
    f = dealDamage(f, 10).fight; // 1 wound → health 9 → stance complete, 8 carried
    expect(f.stancePending).toBe(true);
    const r = revealStance(f, stance(2, 8)); // 1 wound → health 8 → complete again, 6 carried
    expect(r.fight.health).toBe(8);
    expect(r.fight.stancePending).toBe(true);
    expect(r.fight.damage).toBe(6);
  });

  it('defeats the monster at 0 health', () => {
    let f = fightWith(1, 2, stance(1, null));
    const r = dealDamage(f, 5);
    f = r.fight;
    expect(f.health).toBe(0);
    expect(f.outcome).toBe('defeated');
    expect(r.events.some((e) => e.kind === 'defeated')).toBe(true);
    expect(dealDamage(f, 3).fight.health).toBe(0);
  });

  it('a card-effect wound lowers health without touching damage', () => {
    let f = fightWith(2, 8, stance(2, 7));
    f = dealDamage(f, 3).fight;
    f = inflictWound(f).fight;
    expect(f.health).toBe(7);
    expect(f.damage).toBe(3);
    expect(f.stancePending).toBe(true);
  });

  it('the next stance form defaults to the previous toughness', () => {
    const f = fightWith(2, 9, stance(3, 7));
    expect(blankStance(f).toughness).toBe(3);
    expect(blankStance(f).label).toBe('II');
  });

  it('the next stance number follows the one picked, and stops at III', () => {
    let f = createFight({ monster: 'M', players: 2, startingHealth: 10 });
    expect(blankStance(f).label).toBe('I');
    f = revealStance(f, { ...stance(2, 8), label: 'II' }).fight; // the table picked II for the first card
    expect(blankStance(f).label).toBe('III');
    f = revealStance(f, { ...stance(2, 6), label: 'III' }).fight;
    expect(blankStance(f).label).toBe('III');
  });
});

describe('struggle and unleash (rulebook p. 18)', () => {
  it('upkeep adds 1 per player and unleash resets to 1 per player', () => {
    let f = fightWith(3, 10, stance(2, 7, 4));
    f = monsterUpkeep(f).fight;
    expect(f.struggle).toBe(3);
    f = gainStruggle(f, 5).fight; // 8
    const r = monsterUpkeep(f); // 11 ≥ 9 → unleash
    expect(r.events).toContainEqual({ kind: 'unleash', damageValue: 4, resetTo: 3 });
    expect(r.fight.struggle).toBe(3);
  });

  it('only a gain triggers unleash', () => {
    let f = fightWith(2, 10, stance(2, 7));
    f = gainStruggle(f, 5).fight; // 5 < 6
    f = loseStruggle(f, 2).fight;
    expect(f.struggle).toBe(3);
  });
});

describe('monster states', () => {
  it('vulnerable doubles one hit and is used up', () => {
    let f = fightWith(2, 10, stance(5, 5)); // toughness 10
    f = addState(f, 'vulnerable').fight;
    expect(canAddState(f, 'vulnerable')).toBe(false);
    f = dealDamage(f, 6, true).fight;
    expect(f.health).toBe(9);
    expect(f.damage).toBe(2);
    expect(f.states).not.toContain('vulnerable');
  });

  it('end of round clears vulnerable; the next round clears confused', () => {
    let f = fightWith(2, 10, stance(2, 7));
    f = addState(f, 'vulnerable').fight;
    f = addState(f, 'confused').fight;
    f = monsterUpkeep(f).fight;
    const r = endRound(f);
    expect(r.fight.round).toBe(2);
    expect(r.fight.states).toEqual([]);
    expect(r.fight.upkeepDone).toBe(false);
  });

  it('stunned ends at the end of the round; unstoppable stays until removed', () => {
    let f = fightWith(2, 10, stance(2, 7));
    f = addState(f, 'stunned').fight;
    expect(canAddState(f, 'stunned')).toBe(false);
    f = addState(f, 'unstoppable').fight;
    f = endRound(f).fight;
    expect(f.states).toEqual(['unstoppable']);
    f = removeState(f, 'unstoppable').fight;
    expect(f.states).toEqual([]);
  });

  it('blind stacks up to the 2 tokens in the box, survives the round, and comes off by hand', () => {
    let f = fightWith(2, 10, stance(2, 7));
    f = addState(addState(f, 'blind').fight, 'blind').fight;
    expect(stateCount(f, 'blind')).toBe(2);
    expect(canAddState(f, 'blind')).toBe(false);
    expect(addState(f, 'blind').events).toEqual([]);
    f = endRound(endRound(f).fight).fight;
    expect(stateCount(f, 'blind')).toBe(2);
    f = removeState(f, 'blind').fight;
    expect(stateCount(f, 'blind')).toBe(1);
    expect(canAddState(changeHardening(f, 3).fight, 'blind')).toBe(true); // Hardened doesn't stop it
  });

  it('acceleration counts 0–4 tokens, each adding struggle at upkeep', () => {
    let f = fightWith(2, 10, stance(2, 7));
    f = changeAcceleration(f, 2).fight;
    const r = monsterUpkeep(f); // 2 players + 2 tokens
    expect(r.events).toContainEqual({ kind: 'upkeep', gained: 4, refresh: false });
    expect(text(r.events[0])).toBe('Upkeep +4 struggle');
    const later = monsterUpkeep(endRound(f).fight);
    expect(later.events[0]).toEqual({ kind: 'upkeep', gained: 4, refresh: true });
    expect(text(later.events[0])).toBe('Upkeep: behavior refresh, +4 struggle');
    expect(r.fight.struggle).toBe(4);
    expect(text(changeAcceleration(f, 1).events[0])).toBe('Acceleration → 3');
    expect(changeAcceleration(f, 9).fight.acceleration).toBe(4);
    expect(changeAcceleration(f, -9).fight.acceleration).toBe(0);
  });

  it('times out after round 10', () => {
    let f = fightWith(2, 10, stance(2, 7));
    for (let i = 0; i < 9; i++) f = endRound(f).fight;
    expect(f.round).toBe(10);
    f = endRound(f).fight;
    expect(f.outcome).toBe('timeout');
  });
});

describe('stance keywords: Shield and Resistant (pp. 111-112)', () => {
  it('Shield X reduces each hit by X, never below 0', () => {
    let f = fightWith(1, 10, { ...stance(5, null), shield: 2 });
    const r = dealDamage(f, 3);
    expect(r.fight.damage).toBe(1);
    expect(r.events).toContainEqual({ kind: 'hit', base: 3, doubled: false, shield: 2, amount: 1 });
    expect(text(r.events[0])).toBe('Hit 3 −2 (Shield) = 1');
    f = dealDamage(r.fight, 1).fight;
    expect(f.damage).toBe(1);
  });

  it('applies Shield after Vulnerable doubles the hit', () => {
    let f = fightWith(1, 10, { ...stance(20, null), shield: 2 });
    f = addState(f, 'vulnerable').fight;
    const r = dealDamage(f, 3, true);
    expect(r.fight.damage).toBe(4);
    expect(text(r.events.find((e) => e.kind === 'hit')!)).toBe('Hit 3 ×2 (Vulnerable) −2 (Shield) = 4');
  });

  it('a plain hit logs as before', () => {
    expect(text(dealDamage(fightWith(1, 10, stance(5, null)), 3).events[0])).toBe('Hit 3');
  });

  it('Resistant discards the excess damage when the stance completes', () => {
    let f = fightWith(2, 9, { ...stance(2, 7), resistant: true });
    const r = dealDamage(f, 13); // 2 wounds → health 7, 5 left over
    f = r.fight;
    expect(f.health).toBe(7);
    expect(f.damage).toBe(0);
    expect(r.events).toContainEqual({ kind: 'stance-complete', label: 'S', carried: 0, discarded: 5, by: 'Resistant' });
    expect(text(r.events.find((e) => e.kind === 'stance-complete')!)).toBe('Stance S complete, Resistant: 5 damage discarded');
    // The next stance starts from nothing.
    f = revealStance(f, stance(1, null)).fight;
    expect(f.health).toBe(7);
  });

  it('a new stance starts without keywords or bonus tokens', () => {
    const f = fightWith(1, 10, { ...stance(2, 9), resistant: true, shield: 1, bonusDamage: 2 });
    expect(blankStance(f)).toMatchObject({ resistant: false, shield: 0, bonusDamage: 0 });
  });
});

describe('bonus damage tokens (p. 104)', () => {
  it('adds to the attack damage and to what hunters suffer on an Unleash', () => {
    let f = fightWith(1, 10, stance(2, null, 3));
    f = changeBonus(f, 1).fight;
    f = changeBonus(f, 1).fight;
    expect(attackDamage(f)).toBe(5);
    const r = gainStruggle(f, 3);
    expect(r.events).toContainEqual({ kind: 'unleash', damageValue: 5, resetTo: 1 });
  });

  it('never goes below 0, and goes with the stance card', () => {
    let f = fightWith(1, 10, stance(2, 9, 3));
    f = changeBonus(f, -1).fight;
    expect(attackDamage(f)).toBe(3);
    f = changeBonus(f, 2).fight;
    f = dealDamage(f, 2).fight; // wound → health 9 → stance complete
    f = revealStance(f, blankStance(f)).fight;
    expect(attackDamage(f)).toBe(3);
  });
});

describe('Charge track (p. 95)', () => {
  it('has no track unless asked for, runs 0–3, and changes nothing else', () => {
    expect(createFight({ monster: 'Test', players: 1 }).charge).toBeNull();
    const start = createFight({ monster: 'Jekoros', players: 2, charge: true });
    expect(start.charge).toBe(0);
    let r = changeCharge(start, 5);
    expect(r.fight.charge).toBe(3);
    expect(text(r.events[0])).toBe('Charge → 3');
    expect({ ...r.fight, charge: 0 }).toEqual(start);
    r = changeCharge(r.fight, -4);
    expect(r.fight.charge).toBe(0);
  });

  it('starts the track from the menu for any monster', () => {
    expect(changeCharge(createFight({ monster: 'Test', players: 1 }), 0).fight.charge).toBe(0);
  });
});

describe('Hardening track and Hardened (pp. 95, 109)', () => {
  const hardened = (f: Fight) => changeHardening(f, 3).fight;

  it('has no track unless asked for, runs 0–3, and is Hardened only at 3', () => {
    expect(createFight({ monster: 'Test', players: 1 }).hardening).toBeNull();
    let f = revealStance(createFight({ monster: 'Test', players: 1, hardening: true }), stance(2, null)).fight;
    expect(f.hardening).toBe(0);
    f = changeHardening(f, -1).fight;
    expect(f.hardening).toBe(0);
    let r = changeHardening(f, 5);
    expect(r.fight.hardening).toBe(3);
    expect(isHardened(r.fight)).toBe(true);
    expect(text(r.events[0])).toBe('Hardening → 3 (Hardened)');
    r = changeHardening(r.fight, -1);
    expect(isHardened(r.fight)).toBe(false);
    expect(text(r.events[0])).toBe('Hardening → 2 (no longer Hardened)');
  });

  it('removes the damage left over once it converts damage into wounds', () => {
    let f = hardened(fightWith(1, 10, stance(3, null)));
    let r = dealDamage(f, 2); // no wound: the damage stays
    expect(r.fight.damage).toBe(2);
    r = dealDamage(r.fight, 5); // 7 → 2 wounds, 1 left over, discarded
    expect(r.fight.health).toBe(8);
    expect(r.fight.damage).toBe(0);
    expect(r.events).toContainEqual({ kind: 'discarded', amount: 1, by: 'Hardened' });
    expect(text(r.events[r.events.length - 1])).toBe('Hardened: 1 damage discarded');
  });

  it('a wound from a card leaves the damage alone, even when Hardened (p. 115)', () => {
    const f = dealDamage(hardened(fightWith(1, 10, stance(3, null))), 2).fight;
    const r = inflictWound(f);
    expect(r.fight.health).toBe(9);
    expect(r.fight.damage).toBe(2);
  });

  it('carries no damage into the next stance', () => {
    const r = dealDamage(hardened(fightWith(1, 10, stance(2, 9))), 5);
    expect(r.events).toContainEqual({ kind: 'stance-complete', label: 'S', carried: 0, discarded: 3, by: 'Hardened' });
  });

  it("can't be stunned, confused or made Vulnerable, but other states still work", () => {
    const f = hardened(fightWith(1, 10, stance(2, null)));
    for (const id of ['stunned', 'confused', 'vulnerable'] as const) {
      expect(canAddState(f, id)).toBe(false);
      expect(addState(f, id).events).toEqual([]);
    }
    expect(canAddState(f, 'unstoppable')).toBe(true);
    expect(canAddState(changeHardening(f, -1).fight, 'stunned')).toBe(true);
  });
});
