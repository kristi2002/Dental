/**
 * Simplified 2D chart of the 32 permanent teeth, using the Universal Numbering
 * System that the Prisma schema encodes (`toothNum` 1–32).
 *
 *  1–16  upper arch, patient's right → patient's left
 * 17–32  lower arch, patient's left  → patient's right
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

export const UPPER_TEETH = Array.from({ length: 16 }, (_, i) => i + 1);
export const LOWER_TEETH = Array.from({ length: 16 }, (_, i) => i + 17);

/** The lower arch is numbered right-to-left, so mirror it to keep the patient's
 *  right side on the left of the screen in both arches. */
export const LOWER_TEETH_DISPLAY = [...LOWER_TEETH].reverse();

/** Teeth 1–8 / 25–32 sit on the patient's right; the rest on the left. */
export function isRightSide(toothNum: number): boolean {
  return toothNum <= 8 || toothNum >= 25;
}

/** Anything other than "healthy" is worth flagging to the dentist. */
export function needsAttention(status: string): boolean {
  return status !== 'HEALTHY';
}
