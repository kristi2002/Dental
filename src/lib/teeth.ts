/**
 * The dental chart, numbered the way its readers number teeth.
 *
 * This shipped using the **Universal** system (1–32) — the American one — in an
 * app translated into Albanian and Italian, where every dentist is taught
 * **FDI**. "Tooth 14" meant the upper-left first premolar to the schema and the
 * upper-right first premolar to the person reading it. FDI is therefore what is
 * stored; Universal survives as a display choice for a practice that wants it.
 *
 * FDI is two digits: quadrant, then position from the midline.
 *
 *   permanent   1x upper-right   2x upper-left   3x lower-left   4x lower-right
 *   primary     5x upper-right   6x upper-left   7x lower-left   8x lower-right
 *
 * Primary teeth matter for the obvious reason: without them a child cannot be
 * charted at all, and children are a large part of a general practice.
 */

export const TOOTH_STATUSES = [
  'HEALTHY',
  'CARIES',
  'FILLED',
  'CROWN',
  'ROOT_CANAL',
  'EXTRACTED',
  'IMPLANT',
  'MISSING',
] as const;

export type ToothStatus = (typeof TOOTH_STATUSES)[number];

export const DEFAULT_TOOTH_STATUS: ToothStatus = 'HEALTHY';

export function isToothStatus(value: string): value is ToothStatus {
  return (TOOTH_STATUSES as readonly string[]).includes(value);
}

/** Pale fills carrying dark, same-hue text. This reads quieter than the saturated
 *  blocks it replaces AND lands better contrast on the tooth number, which used to
 *  be white on mid-tone red. Each status also carries a distinct letter, so the
 *  chart never depends on colour alone.
 *
 *  EXTRACTED stays the one dark chip — it is the status you want to spot from
 *  across the room. */
export const TOOTH_STATUS_STYLE: Record<
  ToothStatus,
  { swatch: string; button: string; short: string }
> = {
  HEALTHY: {
    swatch: 'bg-white border-slate-300 text-slate-700',
    button: 'bg-white border-slate-300 text-slate-700 hover:border-slate-500',
    short: '',
  },
  CARIES: {
    swatch: 'bg-rose-100 border-rose-300 text-rose-800',
    button: 'bg-rose-100 border-rose-300 text-rose-800 hover:border-rose-500',
    short: 'C',
  },
  FILLED: {
    swatch: 'bg-sky-100 border-sky-300 text-sky-800',
    button: 'bg-sky-100 border-sky-300 text-sky-800 hover:border-sky-500',
    short: 'F',
  },
  CROWN: {
    swatch: 'bg-amber-100 border-amber-300 text-amber-800',
    button: 'bg-amber-100 border-amber-300 text-amber-800 hover:border-amber-500',
    short: 'K',
  },
  ROOT_CANAL: {
    swatch: 'bg-violet-100 border-violet-300 text-violet-800',
    button: 'bg-violet-100 border-violet-300 text-violet-800 hover:border-violet-500',
    short: 'R',
  },
  EXTRACTED: {
    swatch: 'bg-slate-600 border-slate-700 text-white',
    button: 'bg-slate-600 border-slate-700 text-white hover:border-slate-900',
    short: '×',
  },
  IMPLANT: {
    swatch: 'bg-teal-100 border-teal-300 text-teal-800',
    button: 'bg-teal-100 border-teal-300 text-teal-800 hover:border-teal-500',
    short: 'I',
  },
  MISSING: {
    swatch: 'bg-slate-100 border-slate-300 text-slate-600',
    button: 'bg-slate-100 border-slate-300 text-slate-600 hover:border-slate-500',
    short: '–',
  },
};

export type Dentition = 'PERMANENT' | 'PRIMARY';

/** Quadrant order runs from the midline outwards, so 8 is the third molar. */
function quadrant(prefix: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => prefix * 10 + i + 1);
}

/**
 * Display order for each row: the patient's right-hand side on the left of the
 * screen, both arches, so the chart reads like the dentist is facing them.
 */
export const PERMANENT_UPPER = [...quadrant(1, 8)].reverse().concat(quadrant(2, 8));
export const PERMANENT_LOWER = [...quadrant(4, 8)].reverse().concat(quadrant(3, 8));
export const PRIMARY_UPPER = [...quadrant(5, 5)].reverse().concat(quadrant(6, 5));
export const PRIMARY_LOWER = [...quadrant(8, 5)].reverse().concat(quadrant(7, 5));

export const PERMANENT_TEETH = [...PERMANENT_UPPER, ...PERMANENT_LOWER];
export const PRIMARY_TEETH = [...PRIMARY_UPPER, ...PRIMARY_LOWER];
export const ALL_TEETH = [...PERMANENT_TEETH, ...PRIMARY_TEETH];

export function dentitionOf(toothNum: number): Dentition {
  return Math.floor(toothNum / 10) >= 5 ? 'PRIMARY' : 'PERMANENT';
}

export function isValidTooth(toothNum: number): boolean {
  return ALL_TEETH.includes(toothNum);
}

/** Quadrants 1 and 4 (and 5, 8 for primary) are the patient's right. */
export function isRightSide(toothNum: number): boolean {
  const q = Math.floor(toothNum / 10);
  return q === 1 || q === 4 || q === 5 || q === 8;
}

/**
 * Universal labels, for a practice that reads them. Permanent teeth are 1–32
 * running upper-right to upper-left then lower-left to lower-right; primary
 * teeth are the letters A–T over the same path.
 */
const UNIVERSAL_ORDER = [
  ...[...quadrant(1, 8)].reverse(), ...quadrant(2, 8),
  ...[...quadrant(3, 8)].reverse(), ...quadrant(4, 8),
];
const UNIVERSAL_PRIMARY_ORDER = [
  ...[...quadrant(5, 5)].reverse(), ...quadrant(6, 5),
  ...[...quadrant(7, 5)].reverse(), ...quadrant(8, 5),
];

export type ToothNumbering = 'FDI' | 'UNIVERSAL';

export function toothLabel(toothNum: number, numbering: ToothNumbering = 'FDI'): string {
  if (numbering === 'FDI') return String(toothNum);

  const permanent = UNIVERSAL_ORDER.indexOf(toothNum);
  if (permanent >= 0) return String(permanent + 1);

  const primary = UNIVERSAL_PRIMARY_ORDER.indexOf(toothNum);
  if (primary >= 0) return String.fromCharCode(65 + primary); // A–T

  return String(toothNum);
}

/**
 * The five surfaces of a tooth. Without them the chart can record that a tooth
 * has caries but not *where*, which is the difference between a note and a
 * treatment plan. Stored as a short string like `"MOD"`.
 */
export const TOOTH_SURFACES = ['M', 'O', 'D', 'B', 'L'] as const;
export type ToothSurface = (typeof TOOTH_SURFACES)[number];

/** Front teeth have an incisal edge where back teeth have an occlusal surface. */
export function isAnterior(toothNum: number): boolean {
  const position = toothNum % 10;
  return position <= 3;
}

export function parseSurfaces(value: string | null | undefined): ToothSurface[] {
  if (!value) return [];
  const seen = new Set<string>();
  for (const char of value.toUpperCase()) {
    if ((TOOTH_SURFACES as readonly string[]).includes(char)) seen.add(char);
  }
  // Kept in anatomical order rather than typing order, so "DOM" and "MOD" are
  // the same record.
  return TOOTH_SURFACES.filter((surface) => seen.has(surface));
}

export function formatSurfaces(value: string | null | undefined): string {
  return parseSurfaces(value).join('');
}

/** Anything other than "healthy" is worth flagging to the dentist. */
export function needsAttention(status: string): boolean {
  return status !== 'HEALTHY';
}
