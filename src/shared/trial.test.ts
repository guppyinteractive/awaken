import { describe, expect, it } from 'vitest';
import { freshTrial, lost, over, score, won } from './trial';

const t = (defeats: number, totalDefeats = 0, valor = 0) => ({ ...freshTrial(), on: true, defeats, totalDefeats, valor });

describe("Hunter's Trial", () => {
  it('scores 90, less 2 per total defeat, plus valor', () => {
    expect(score(freshTrial())).toBe(90);
    expect(score(t(2, 3, 10))).toBe(94); // defeats on the track don't count yet
  });

  it('marks a defeat for a lost scenario, and ends the campaign at 3', () => {
    expect(lost(t(0)).defeats).toBe(1);
    expect(over(lost(t(1)))).toBe(false);
    expect(over(lost(t(2)))).toBe(true);
    expect(lost(t(3)).defeats).toBe(3);
  });

  it('moves the defeats to the total on a win', () => {
    expect(won(t(2, 1, 4), false)).toEqual({ trial: t(0, 3, 4), valor: 0 });
  });

  it('gives 2 valor for a first try and 2 for no one KO\'d', () => {
    expect(won(t(0), false).valor).toBe(2);
    expect(won(t(0), true)).toEqual({ trial: t(0, 0, 4), valor: 4 });
    expect(won(t(1), true).valor).toBe(2);
  });
});
