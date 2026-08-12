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
 * The four quadrants, each in *display* order — outwards from the midline for
 * the left-hand quadrants, inwards for the right-hand ones, so that laying them
 * side by side puts the midline in the middle of the page.
 *
 *   upper right 18→11 │ 21→28 upper left
 *   lower right 48→41 │ 31→38 lower left
 *
 * The odontogram draws each of these as its own block either side of the
 * midline, which is why they are exported separately rather than only as the
 * concatenated rows below.
 */
export const PERMANENT_UPPER_RIGHT = [...quadrant(1, 8)].reverse();
export const PERMANENT_UPPER_LEFT = quadrant(2, 8);
export const PERMANENT_LOWER_RIGHT = [...quadrant(4, 8)].reverse();
export const PERMANENT_LOWER_LEFT = quadrant(3, 8);

export const PRIMARY_UPPER_RIGHT = [...quadrant(5, 5)].reverse();
export const PRIMARY_UPPER_LEFT = quadrant(6, 5);
export const PRIMARY_LOWER_RIGHT = [...quadrant(8, 5)].reverse();
export const PRIMARY_LOWER_LEFT = quadrant(7, 5);

/**
 * Display order for each row: the patient's right-hand side on the left of the
 * screen, both arches, so the chart reads like the dentist is facing them.
 */
export const PERMANENT_UPPER = [...PERMANENT_UPPER_RIGHT, ...PERMANENT_UPPER_LEFT];
export const PERMANENT_LOWER = [...PERMANENT_LOWER_RIGHT, ...PERMANENT_LOWER_LEFT];
export const PRIMARY_UPPER = [...PRIMARY_UPPER_RIGHT, ...PRIMARY_UPPER_LEFT];
export const PRIMARY_LOWER = [...PRIMARY_LOWER_RIGHT, ...PRIMARY_LOWER_LEFT];

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
 * The inverse, for reading anything still written in Universal: a permanent
 * `1`–`32`, or a primary `"A"`–`"T"`.
 *
 * Storage moved to FDI and `prisma/migrate-teeth-fdi.ts` converted the rows that
 * existed, so nothing in the database needs this. It is here for the edges that
 * migration cannot reach — an imported file, a pasted treatment plan, a practice
 * whose previous software exported Universal — where a number has to be
 * translated before it can be trusted.
 *
 * Returns null rather than guessing, because a wrong tooth number is worse than
 * a missing one.
 */
export function universalToFdi(value: string | number): number | null {
  if (typeof value === 'string') {
    const letter = value.trim().toUpperCase();
    if (/^[A-T]$/.test(letter)) {
      return UNIVERSAL_PRIMARY_ORDER[letter.charCodeAt(0) - 65] ?? null;
    }
  }

  const position = typeof value === 'number' ? value : Number.parseInt(value.trim(), 10);
  if (!Number.isInteger(position) || position < 1 || position > 32) return null;
  return UNIVERSAL_ORDER[position - 1] ?? null;
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

/**
 * The same five surfaces as a flag per face, which is what a drawn target wants
 * — it asks "is this segment marked?" five times per tooth and a `string.includes`
 * for each is both slower and easier to get subtly wrong (`"MO".includes("O")`
 * is fine, but the habit is not).
 *
 * `"MOD"` on the wire, this in the component. Storage stays the string.
 */
export interface ToothSurfaceState {
  /** Mesial — the face towards the midline. */
  M: boolean;
  /** Occlusal on a back tooth, incisal on a front one. */
  O: boolean;
  /** Distal — the face away from the midline. */
  D: boolean;
  /** Buccal / labial — the cheek side. */
  B: boolean;
  /** Lingual / palatal — the tongue side. */
  L: boolean;
}

export const NO_SURFACES: ToothSurfaceState = { M: false, O: false, D: false, B: false, L: false };

export function toSurfaceState(value: string | null | undefined): ToothSurfaceState {
  const marked = parseSurfaces(value);
  return {
    M: marked.includes('M'),
    O: marked.includes('O'),
    D: marked.includes('D'),
    B: marked.includes('B'),
    L: marked.includes('L'),
  };
}

/** Back to the stored form, in anatomical order. */
export function fromSurfaceState(state: ToothSurfaceState): string {
  return TOOTH_SURFACES.filter((surface) => state[surface]).join('');
}

/** Anything other than "healthy" is worth flagging to the dentist. */
export function needsAttention(status: string): boolean {
  return status !== 'HEALTHY';
}

/* ------------------------------------------------------------------ *
 * Anatomy, for the drawn chart
 * ------------------------------------------------------------------ */

/** Which of the four silhouettes a tooth is drawn with. */
export type ToothShape = 'INCISOR' | 'CANINE' | 'PREMOLAR' | 'MOLAR';

/** Quadrants 1, 2 (and primary 5, 6) hang from the upper jaw. */
export function isUpperArch(toothNum: number): boolean {
  const q = Math.floor(toothNum / 10);
  return q === 1 || q === 2 || q === 5 || q === 6;
}

/**
 * Position within the quadrant decides the shape. Primary quadrants stop at
 * five, where the fourth and fifth are already molars — a milk dentition has no
 * premolars at all, and drawing one there would be a picture of a tooth the
 * child does not have.
 */
export function toothShape(toothNum: number): ToothShape {
  const position = toothNum % 10;
  const primary = dentitionOf(toothNum) === 'PRIMARY';

  if (position <= 2) return 'INCISOR';
  if (position === 3) return 'CANINE';
  if (primary) return 'MOLAR';
  return position <= 5 ? 'PREMOLAR' : 'MOLAR';
}

/* ------------------------------------------------------------------ *
 * Which surface sits where on the chart
 * ------------------------------------------------------------------ */

/** The four outer segments of the surface wheel, as drawn. */
export type WheelPosition = 'top' | 'right' | 'bottom' | 'left';

export const WHEEL_POSITIONS: readonly WheelPosition[] = ['top', 'right', 'bottom', 'left'];

/**
 * Turn a place on the chart into the surface it means.
 *
 * Two conventions, both of them about the reader rather than the data:
 *
 *  - **Buccal points away from the occlusal plane.** The upper row is drawn at
 *    the top of the page, so its cheek side is up; the lower row is drawn
 *    beneath, so its cheek side is down. Anyone reading an odontogram expects
 *    the two arches mirrored like this.
 *  - **Mesial points at the midline.** The patient's right-hand quadrants are
 *    drawn on the left of the screen, so for them mesial is to the *right*.
 *
 * Get either backwards and the chart records the wrong side of the tooth, which
 * no amount of care further down can recover.
 */
export function surfaceAt(toothNum: number, position: WheelPosition): ToothSurface {
  const upper = isUpperArch(toothNum);

  if (position === 'top') return upper ? 'B' : 'L';
  if (position === 'bottom') return upper ? 'L' : 'B';

  const mesialIsRight = isRightSide(toothNum);
  if (position === 'right') return mesialIsRight ? 'M' : 'D';
  return mesialIsRight ? 'D' : 'M';
}

/* ------------------------------------------------------------------ *
 * Selecting teeth and surfaces, for a lab order
 * ------------------------------------------------------------------ */

/**
 * Which teeth a piece of work covers, and — where it matters — which surfaces
 * of them. A tooth mapped to no surfaces is the whole tooth, because that is
 * what a crown, an implant or an extraction actually is.
 */
export type ToothSelection = Record<number, ToothSurface[]>;

/**
 * Read `"22:MO, 27:B, 32"` — and, unchanged, the plain `"46, 47"` that lab
 * cases were written with before surfaces existed. Anything unrecognisable is
 * dropped rather than guessed at.
 */
export function parseToothSelection(value: string | null | undefined): ToothSelection {
  if (!value) return {};

  const selection: ToothSelection = {};
  for (const part of value.split(',')) {
    const [rawTooth, rawSurfaces] = part.split(':');
    const toothNum = Number.parseInt(rawTooth.trim(), 10);
    if (!Number.isFinite(toothNum) || !isValidTooth(toothNum)) continue;

    // A repeated tooth merges rather than replaces, so "16:M,16:D" survives a
    // round trip as "16:MD" instead of losing the first half.
    const surfaces = new Set([...(selection[toothNum] ?? []), ...parseSurfaces(rawSurfaces)]);
    selection[toothNum] = TOOTH_SURFACES.filter((surface) => surfaces.has(surface));
  }
  return selection;
}

/** The inverse, in chart order so the string reads the way the row does. */
export function formatToothSelection(selection: ToothSelection): string {
  return ALL_TEETH.filter((toothNum) => selection[toothNum] !== undefined)
    .map((toothNum) => {
      const surfaces = selection[toothNum];
      return surfaces.length > 0 ? `${toothNum}:${surfaces.join('')}` : String(toothNum);
    })
    .join(',');
}

/** Just the numbers, for the places that show a case in one line. */
export function selectedTeeth(value: string | null | undefined): number[] {
  const selection = parseToothSelection(value);
  return ALL_TEETH.filter((toothNum) => selection[toothNum] !== undefined);
}
