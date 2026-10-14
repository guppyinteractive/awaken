// Component names as printed on the hunter and campaign sheets, used as plain
// labels. No game art, icons, logos, or rules text.

export const MATERIALS = ['Scales', 'Bones', 'Blood', 'Zima', 'Iride', 'Kobaureo'] as const;

export const PLANTS = ['Nillea', 'Tarmaret', 'Albalacea', 'Mellis', 'Anthemon', 'Saelicornia'] as const;

export const ELEMENTS = [
  'Fire', 'Horn', 'Coral', 'Crystal', 'Thunder', 'Metal', 'Feather', 'Venom', 'Ice',
] as const;

/** Trophy monsters, in campaign-sheet order (left column, then right). */
export const MONSTERS = [
  'Vyraxen', 'Toramat', 'Korowon', 'Felaxir', 'Ozew', 'Hurom',
  'Hydar', 'Sirkaaj', 'Pazis', 'Zekath', 'Taraska',
  'Kharja', 'Dygorax', 'Orouxen', 'Morkraas', 'Jekoros', 'Tarragua',
  'Reikal', 'Mamuraak', 'Nagarjas', 'Zekalith', 'Xitheros',
] as const;

export const RESOURCES = {
  materials: { title: 'Materials', names: MATERIALS },
  plants: { title: 'Plants', names: PLANTS },
  elements: { title: 'Elements', names: ELEMENTS },
} as const;

export type ResourceKind = keyof typeof RESOURCES;
export const RESOURCE_KINDS = Object.keys(RESOURCES) as ResourceKind[];

/** The trophy monster with this name, ignoring case and surrounding spaces, or null. */
export function trophyFor(name: string): string | null {
  const key = name.trim().toLowerCase();
  return MONSTERS.find((m) => m.toLowerCase() === key) ?? null;
}
