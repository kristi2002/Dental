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

/** High-contrast fills — each one also carries a distinct letter, so the chart
 *  stays readable without relying on colour alone. */
export const TOOTH_STATUS_STYLE: Record<
  ToothStatus,
  { swatch: string; button: string; short: string }
> = {
  HEALTHY: {
    swatch: 'bg-white border-slate-400',
    button: 'bg-white border-slate-400 text-slate-900 hover:border-slate-900',
    short: '',
  },
  CARIES: {
    swatch: 'bg-red-500 border-red-700',
    button: 'bg-red-500 border-red-700 text-white hover:border-red-900',
    short: 'C',
  },
  FILLED: {
    swatch: 'bg-blue-500 border-blue-700',
    button: 'bg-blue-500 border-blue-700 text-white hover:border-blue-900',
    short: 'F',
  },
  CROWN: {
    swatch: 'bg-amber-400 border-amber-600',
    button: 'bg-amber-400 border-amber-600 text-slate-900 hover:border-amber-800',
    short: 'K',
  },
  ROOT_CANAL: {
    swatch: 'bg-violet-500 border-violet-700',
    button: 'bg-violet-500 border-violet-700 text-white hover:border-violet-900',
    short: 'R',
  },
  EXTRACTED: {
    swatch: 'bg-slate-700 border-slate-900',
    button: 'bg-slate-700 border-slate-900 text-white hover:border-black',
    short: '×',
  },
  IMPLANT: {
    swatch: 'bg-teal-500 border-teal-700',
    button: 'bg-teal-500 border-teal-700 text-white hover:border-teal-900',
    short: 'I',
  },
  MISSING: {
    swatch: 'bg-slate-200 border-slate-400',
    button: 'bg-slate-200 border-slate-400 text-slate-500 hover:border-slate-700',
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
