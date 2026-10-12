import { SECTORS, type Sector } from '../engine/fight';

// Exposure diagram: a circle in four sectors, front at the bottom like the
// stance cards. Exposed sectors are red.
const R = 46;
const C = 50;
const D = R * Math.SQRT1_2;
const TL = [C - D, C - D];
const TR = [C + D, C - D];
const BR = [C + D, C + D];
const BL = [C - D, C + D];

const WEDGES: Record<Sector, { from: number[]; to: number[]; text: [number, number]; name: string }> = {
  rear: { from: TL, to: TR, text: [50, 22], name: 'REAR' },
  right: { from: TR, to: BR, text: [80, 52], name: 'FLANK' },
  front: { from: BR, to: BL, text: [50, 84], name: 'FRONT' },
  left: { from: BL, to: TL, text: [20, 52], name: 'FLANK' },
};

export function sectorsSvg(exposed: Record<Sector, boolean>, editable: boolean, action = 'sector'): string {
  const paths = SECTORS.map((s) => {
    const w = WEDGES[s];
    const d = `M${C} ${C} L${w.from[0]} ${w.from[1]} A${R} ${R} 0 0 1 ${w.to[0]} ${w.to[1]} Z`;
    const attrs = editable ? ` data-act="${action}" data-sector="${s}" role="button" aria-label="${s}"` : '';
    return `<path d="${d}" class="${exposed[s] ? 'exposed' : ''}"${attrs}></path>`;
  }).join('');
  const labels = SECTORS.map((s) => {
    const w = WEDGES[s];
    return `<text x="${w.text[0]}" y="${w.text[1]}" class="${exposed[s] ? 'on-exposed' : ''}" pointer-events="none">${w.name}</text>`;
  }).join('');
  return `<svg class="sectors${editable ? ' editable' : ''}" viewBox="0 0 100 100" aria-label="Exposed sides">${paths}${labels}</svg>`;
}
