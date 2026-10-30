// The Hunter's Trial variant (rulebook p. 63), in our own words: a lost
// scenario marks a defeat, and 3 end the campaign; a win moves the marked
// defeats to the total and can earn valor.

export interface Trial {
  /** Whether the campaign is playing the variant. Off keeps the numbers. */
  on: boolean;
  /** Spaces marked on the Defeat track, 0–3. */
  defeats: number;
  totalDefeats: number;
  valor: number;
}

export const DEFEAT_SPACES = 3;

export const freshTrial = (): Trial => ({ on: false, defeats: 0, totalDefeats: 0, valor: 0 });

export const score = (t: Trial): number => 90 - 2 * t.totalDefeats + t.valor;

/** All the Defeat spaces are marked: start again from Chapter 1. */
export const over = (t: Trial): boolean => t.defeats >= DEFEAT_SPACES;

export function lost(t: Trial): Trial {
  return { ...t, defeats: Math.min(DEFEAT_SPACES, t.defeats + 1) };
}

/** A won scenario, and the valor it earned: 2 for a first try, 2 if no one was KO'd. */
export function won(t: Trial, noKO: boolean): { trial: Trial; valor: number } {
  const valor = (t.defeats === 0 ? 2 : 0) + (noKO ? 2 : 0);
  return { trial: { ...t, defeats: 0, totalDefeats: t.totalDefeats + t.defeats, valor: t.valor + valor }, valor };
}
