// Monster states (tokens on the monster board). Hints are our own words plus a
// rulebook page reference; never paste rulebook text here.

export type StateId = 'confused' | 'vulnerable' | 'stunned' | 'unstoppable' | 'acceleration';

/** When a state is cleared automatically. */
export type StateEnds = 'end-of-round' | 'start-of-next-round' | 'manual';

export interface StateDef {
  id: StateId;
  name: string;
  ends: StateEnds;
  /** Only one at a time; it can't be added while the monster already has it. Otherwise it stacks. */
  single: boolean;
  hint: string;
  page: number;
}

export const STATE_DEFS: Record<StateId, StateDef> = {
  confused: {
    id: 'confused',
    name: 'Confused',
    ends: 'start-of-next-round',
    single: true,
    hint: 'Cancels the next boost effect (the boost cost is still paid), then is removed. Otherwise removed at the start of the next round.',
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
    hint: 'One behavior card in play is blocked from triggering this round. A player then reveals up to two attack cards and deals their weapon damage. Removed at the end of the round.',
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
  acceleration: {
    id: 'acceleration',
    name: 'Acceleration',
    ends: 'manual',
    single: false,
    hint: 'Each token adds 1 Struggle at monster upkeep (included automatically). Tokens stack; remove them when a card says so.',
    page: 106,
  },
};

export const STATE_IDS = Object.keys(STATE_DEFS) as StateId[];
