import { describe, expect, it } from 'vitest';
import { MATERIALS, PLANTS, ELEMENTS } from './game';
import { resourceIcon } from './icons';

describe('resourceIcon', () => {
  it('has an icon for every material, plant, and element', () => {
    for (const name of [...MATERIALS, ...PLANTS, ...ELEMENTS]) {
      expect(resourceIcon(name), name).toMatch(/^<svg class="res-icon"/);
    }
  });

  it('is empty for anything else', () => {
    expect(resourceIcon('Vyraxen')).toBe('');
  });
});
