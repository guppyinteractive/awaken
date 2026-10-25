// Monster states (tokens on the monster board). Hints are our own words plus a
// rulebook page reference; never paste rulebook text here.

// Acceleration is a 0–4 track on the fight (fight.ts), not a state.
export type StateId = 'confused' | 'vulnerable' | 'stunned' | 'unstoppable';

/** When a state is cleared automatically. */
export type StateEnds = 'end-of-round' | 'start-of-next-round' | 'manual';

export interface StateDef {
  id: StateId;
  name: string;
  ends: StateEnds;
  /** Only one at a time; it can't be added while the monster already has it. Otherwise it stacks. */
  single: boolean;
  hint: string;
  /** What to do at the table the moment it's added, if anything. Shown as a pop-up. */
  onAdd?: string;
  page: number;
}

export const STATE_DEFS: Record<StateId, StateDef> = {
  confused: {
    id: 'confused',
    name: 'Confused',
    ends: 'start-of-next-round',
    single: true,
    hint: 'Cancels the next boost effect (the boost cost is still paid), then is removed. Otherwise removed at the start of the next round.',
    onAdd: 'Turn the monster to face a sector of your choice.',
    page: 107,
  },
  vulnerable: {
    id: 'vulnerable',
    name: 'Vulnerable',
    ends: 'end-of-round',
    single: true,
    hint: 'Use it to double one source of damage, then remove it. Not on the hit that applied it. Removed at the end of the round.',
    page: 114,
  },
  stunned: {
    id: 'stunned',
    name: 'Stunned',
    ends: 'end-of-round',
    single: true,
    hint: 'The behavior card with the stun token can\'t trigger this round. Removed at the end of the round.',
    onAdd: 'Put the stun token on a behavior card in play: it can\'t trigger this round. Then a player reveals up to two attack cards and deals their weapon damage.',
    page: 113,
  },
  unstoppable: {
    id: 'unstoppable',
    name: 'Unstoppable',
    ends: 'manual',
    single: true,
    hint: 'After each behavior card triggers, the monster gains 1 Struggle. Lasts as long as the card that caused it says; remove it by hand.',
    page: 114,
  },
};

export const STATE_IDS = Object.keys(STATE_DEFS) as StateId[];
