// Monster states (tokens on the monster board). Hints are our own words plus a
// rulebook page reference; never paste rulebook text here.

export type StateId = 'confused' | 'vulnerable';

/** When a state is cleared automatically. */
export type StateEnds = 'end-of-round' | 'start-of-next-round' | 'manual';

export interface StateDef {
  id: StateId;
  name: string;
  ends: StateEnds;
  /** Only one at a time; it can't be added while the monster already has it. */
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
};

export const STATE_IDS = Object.keys(STATE_DEFS) as StateId[];
