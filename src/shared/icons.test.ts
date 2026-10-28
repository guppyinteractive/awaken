import { describe, expect, it } from 'vitest';
import { MATERIALS, PLANTS, ELEMENTS } from './game';
import { resourceIcon, skullIcon } from './icons';

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

describe('skullIcon', () => {
  it('is an inline SVG hidden from screen readers', () => {
    expect(skullIcon()).toMatch(/^<svg class="skull" viewBox="0 0 24 24"[^>]*aria-hidden="true">/);
  });
});
