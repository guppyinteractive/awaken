import { describe, expect, it } from 'vitest';
import { trophyFor } from './game';

describe('trophyFor', () => {
  it('matches a trophy monster typed in any case, with spaces around it', () => {
    expect(trophyFor('Vyraxen')).toBe('Vyraxen');
    expect(trophyFor('  vyraxen ')).toBe('Vyraxen');
  });

  it('is null for anything else', () => {
    expect(trophyFor('')).toBeNull();
    expect(trophyFor('Vyrax')).toBeNull();
  });
});
