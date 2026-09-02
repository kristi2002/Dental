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

import type { ToothFindingStatus } from '@/generated/prisma/enums';

export const TOOTH_STATUSES = [
  'HEALTHY',
  'CARIES',
  'FILLED',
  'CROWN',
  'ROOT_CANAL',
  'EXTRACTED',
  'IMPLANT',
  'MISSING',
  // Four the chart could not say, added together because the gap they left was
  // one gap: everything here was either decay, a repair of decay, or the tooth
  // being gone. A sealed fissure, a cracked cusp, a veneer and a bridge unit are
  // none of those, and a practice that does all four was recording them in the
  // notes field — which the findings list can print and nothing can count.
  'SEALANT',
  'FRACTURE',
  'VENEER',
  'BRIDGE',
  // Five more, added for the same reason as those four and found the same way:
  // reading what a general practice was typing into the notes field because the
  // chart had no column for it.
  //
  //   IMPACTED          a tooth that is there and has not come through. Charted
  //                     as MISSING until now, which is the one wrong answer:
  //                     the tooth exists, it is usually the one being referred
  //                     about, and a chart that says it is absent will have it
  //                     left out of the surgical letter.
  //   RETAINED_ROOT     the crown is gone and the root is still in. Neither
  //                     missing nor extracted nor restorable, and it is the
  //                     finding that decides whether the next appointment is a
  //                     filling or a surgical extraction.
  //   PERIAPICAL        infection at the root tip. The most consequential
  //                     omission of the lot: it is what turns a quiet
  //                     root-filled tooth into urgent work, and it was
  //                     invisible on a chart that could only describe crowns.
  //   TEMPORARY         a dressing rather than a restoration. Recorded as
  //                     FILLED it reads as finished work, and the tooth stops
  //                     appearing on anybody's list of things still owed.
  //   WATCH             the monitored fissure, the shadow on the radiograph you
  //                     are not opening yet. This lived in the note field,
  //                     which is exactly the kind of thing written once and
  //                     never read again.
  'IMPACTED',
  'RETAINED_ROOT',
  'PERIAPICAL',
  'TEMPORARY',
  'WATCH',
] as const;

export type ToothStatus = (typeof TOOTH_STATUSES)[number];

export const DEFAULT_TOOTH_STATUS: ToothStatus = 'HEALTHY';

export function isToothStatus(value: string): value is ToothStatus {
  return (TOOTH_STATUSES as readonly string[]).includes(value);
}

/**
 * What may actually be *stored* against a tooth: the list above without
 * `HEALTHY`.
 *
 * A healthy tooth is a tooth with no findings, which is the whole model
 * `ToothFinding` was built to express — so `HEALTHY` is a thing the palette
 * offers (it is the eraser) and never a row. The database now says so itself:
 * `status` is the `ToothFindingStatus` enum, which has the other sixteen
 * members and not that one.
 *
 * Two lists in two files is exactly how a palette and a column come to
 * disagree, so this asserts they do not. `_findingStatusesMatch` fails to
 * compile the moment somebody adds a finding here without adding it to the
 * schema, or the reverse — which is the failure that used to be discovered by
 * a chart quietly drawing two of something.
 */
export type ToothFindingKind = Exclude<ToothStatus, 'HEALTHY'>;

type Identical<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _findingStatusesMatch: Identical<ToothFindingKind, ToothFindingStatus> = true;
void _findingStatusesMatch;

/** Whether this is something a tooth can carry a row for, as against the eraser. */
export function isToothFindingKind(status: ToothStatus): status is ToothFindingKind {
  return status !== DEFAULT_TOOTH_STATUS;
}

/** Tailwind slate-300 — an unmarked surface. */
export const SURFACE_UNMARKED = '#CBD5E1';

/** Pale fills carrying dark, same-hue text. This reads quieter than the saturated
 *  blocks it replaces AND lands better contrast on the tooth number, which used to
 *  be white on mid-tone red. Each status also carries a distinct letter, so the
 *  chart never depends on colour alone.
 *
 *  EXTRACTED stays the one dark chip — it is the status you want to spot from
 *  across the room.
 *
 *  `hue` is the same family at 500 weight, as a flat colour for the SVG surface
 *  target — so the wedge under a tooth and the chip in the legend beside it are
 *  read as the same statement. */
export const TOOTH_STATUS_STYLE: Record<
  ToothStatus,
  { swatch: string; button: string; short: string; hue: string }
> = {
  HEALTHY: {
    swatch: 'bg-white border-slate-300 text-slate-700',
    button: 'bg-white border-slate-300 text-slate-700 hover:border-slate-500',
    short: '',
    hue: SURFACE_UNMARKED,
  },
  CARIES: {
    swatch: 'bg-rose-100 border-rose-300 text-rose-800',
    button: 'bg-rose-100 border-rose-300 text-rose-800 hover:border-rose-500',
    short: 'C',
    hue: '#EF4444', // red-500
  },
  FILLED: {
    swatch: 'bg-sky-100 border-sky-300 text-sky-800',
    button: 'bg-sky-100 border-sky-300 text-sky-800 hover:border-sky-500',
    short: 'F',
    hue: '#0EA5E9', // sky-500
  },
  CROWN: {
    swatch: 'bg-amber-100 border-amber-300 text-amber-800',
    button: 'bg-amber-100 border-amber-300 text-amber-800 hover:border-amber-500',
    short: 'K',
    hue: '#F59E0B', // amber-500
  },
  ROOT_CANAL: {
    swatch: 'bg-violet-100 border-violet-300 text-violet-800',
    button: 'bg-violet-100 border-violet-300 text-violet-800 hover:border-violet-500',
    short: 'R',
    hue: '#8B5CF6', // violet-500
  },
  EXTRACTED: {
    swatch: 'bg-slate-600 border-slate-700 text-white',
    button: 'bg-slate-600 border-slate-700 text-white hover:border-slate-900',
    short: '×',
    hue: '#475569', // slate-600
  },
  IMPLANT: {
    swatch: 'bg-teal-100 border-teal-300 text-teal-800',
    button: 'bg-teal-100 border-teal-300 text-teal-800 hover:border-teal-500',
    short: 'I',
    hue: '#14B8A6', // teal-500
  },
  MISSING: {
    swatch: 'bg-slate-100 border-slate-300 text-slate-600',
    button: 'bg-slate-100 border-slate-300 text-slate-600 hover:border-slate-500',
    short: '–',
    hue: '#94A3B8', // slate-400
  },
  // Green for the one preventive finding on the chart: a sealed fissure is the
  // only entry here that means nothing went wrong.
  SEALANT: {
    swatch: 'bg-green-100 border-green-300 text-green-800',
    button: 'bg-green-100 border-green-300 text-green-800 hover:border-green-500',
    short: 'S',
    hue: '#22C55E', // green-500
  },
  // Orange rather than another red. A crack and a cavity are the two urgent
  // findings on a chart and they call for different instruments, so they must
  // not be the same colour at a glance.
  FRACTURE: {
    swatch: 'bg-orange-100 border-orange-300 text-orange-800',
    button: 'bg-orange-100 border-orange-300 text-orange-800 hover:border-orange-500',
    short: 'Fx',
    hue: '#F97316', // orange-500
  },
  VENEER: {
    swatch: 'bg-fuchsia-100 border-fuchsia-300 text-fuchsia-800',
    button: 'bg-fuchsia-100 border-fuchsia-300 text-fuchsia-800 hover:border-fuchsia-500',
    short: 'V',
    hue: '#D946EF', // fuchsia-500
  },
  BRIDGE: {
    swatch: 'bg-indigo-100 border-indigo-300 text-indigo-800',
    button: 'bg-indigo-100 border-indigo-300 text-indigo-800 hover:border-indigo-500',
    short: 'B',
    hue: '#6366F1', // indigo-500
  },
  // Seventeen findings and about a dozen hues that are distinguishable at chip
  // size, so the last five are placed by meaning and lean on the drawing and
  // the letter to finish the job — which is what those two channels are for.
  //
  // Stone, because what an impacted tooth is buried in is bone. `Ue` rather
  // than `I`, which the implant has.
  IMPACTED: {
    swatch: 'bg-stone-100 border-stone-300 text-stone-800',
    button: 'bg-stone-100 border-stone-300 text-stone-800 hover:border-stone-500',
    short: 'Ue',
    hue: '#78716C', // stone-500
  },
  // Yellow-600 rather than 500: the 500 sits close enough to the crown's amber
  // that a wedge of one could be read as the other, and these two turn up on
  // the same tooth constantly — a crowned tooth whose root has fractured off.
  RETAINED_ROOT: {
    swatch: 'bg-yellow-100 border-yellow-300 text-yellow-800',
    button: 'bg-yellow-100 border-yellow-300 text-yellow-800 hover:border-yellow-500',
    short: 'Rr',
    hue: '#CA8A04', // yellow-600
  },
  // Pink is the nearest free hue to caries' rose, and they are the two findings
  // most often on one tooth. What keeps them apart is the drawing — decay is a
  // hole in the crown, this is a halo at the apex, and they are at opposite
  // ends of the tooth.
  PERIAPICAL: {
    swatch: 'bg-pink-100 border-pink-300 text-pink-800',
    button: 'bg-pink-100 border-pink-300 text-pink-800 hover:border-pink-500',
    short: 'Pa',
    hue: '#EC4899', // pink-500
  },
  // Deliberately beside the filling's sky, because that is what a temporary is:
  // the same restoration, not finished. Neighbouring hues are the right answer
  // where the two findings really are neighbours.
  TEMPORARY: {
    swatch: 'bg-cyan-100 border-cyan-300 text-cyan-800',
    button: 'bg-cyan-100 border-cyan-300 text-cyan-800 hover:border-cyan-500',
    short: 'T',
    hue: '#06B6D4', // cyan-500
  },
  // The quietest finding on the chart gets the quietest treatment — an outline
  // rather than a body, everywhere it is drawn. Nothing has happened to this
  // tooth yet, and the mark has to say so.
  WATCH: {
    swatch: 'bg-blue-100 border-blue-300 text-blue-800',
    button: 'bg-blue-100 border-blue-300 text-blue-800 hover:border-blue-500',
    short: 'W',
    hue: '#3B82F6', // blue-500
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

/* ------------------------------------------------------------------ *
 * Marking a tooth
 * ------------------------------------------------------------------ */

/**
 * The statuses that describe the whole tooth, where naming a surface is
 * nonsense: an extracted tooth has no mesial face left to have caries on.
 */
const WHOLE_TOOTH_STATUSES: readonly ToothStatus[] = [
  'HEALTHY',
  'EXTRACTED',
  'MISSING',
  'IMPLANT',
  'CROWN',
  // A veneer faces the whole crown and a bridge unit replaces it; neither is a
  // finding *on* a face. A sealant and a fracture are — a sealed occlusal
  // fissure and a cracked mesial cusp are two different entries on two
  // different faces, and the chart has to be able to tell them apart.
  'VENEER',
  'BRIDGE',
  // A tooth still under the bone has no face anybody has touched; a retained
  // root has no crown left to have faces on; and a periapical lesion is at the
  // other end of the tooth entirely — naming a mesial for it would be recording
  // the infection on the wrong anatomy.
  'IMPACTED',
  'RETAINED_ROOT',
  'PERIAPICAL',
  // `TEMPORARY` and `WATCH` are absent on purpose. Both are statements about a
  // face: a dressing sits in a specific cavity, and what is being watched is a
  // particular fissure or margin rather than the tooth in general.
];

export function statusTakesSurfaces(status: ToothStatus): boolean {
  return !WHOLE_TOOTH_STATUSES.includes(status);
}

/**
 * The colour one face of the surface target is painted.
 *
 * A healthy tooth's target is blank. Otherwise the recorded surfaces carry the
 * status hue — and a status that names no surface, either because it is about
 * the whole tooth or because none was recorded, fills all five rather than
 * leaving a flagged tooth looking untouched.
 *
 * Here rather than in the chart because the chart is a client component and the
 * printed record sheet is not: both draw the same wheel, and two copies of this
 * rule is how the paper and the screen come to disagree about a tooth.
 */
export function surfaceFill(findings: ToothFindings, surface: ToothSurface): string {
  // Newest first, and the first finding that claims this face wins it. A face
  // carrying both a filling and fresh decay at its margin is the commonest
  // reason a tooth is being looked at again, and the newer of the two is the
  // one the dentist is deciding about.
  for (const finding of findings) {
    const marked = parseSurfaces(finding.surfaces);
    const claimsAll = WHOLE_TOOTH_STATUSES.includes(finding.status) || marked.length === 0;
    if (claimsAll || marked.includes(surface)) return TOOTH_STATUS_STYLE[finding.status].hue;
  }
  return SURFACE_UNMARKED;
}

/**
 * The three findings a tooth can only have one of.
 *
 * Everything else on the chart can coexist and most of it routinely does — a
 * crowned, root-filled molar with a filling on the distal is three findings on
 * one tooth and an ordinary Tuesday. These three are different: a tooth cannot
 * be both missing and extracted, and a socket cannot hold both an implant and
 * the tooth that used to be there. Recording one of them clears the other two,
 * and clears everything else with them — a tooth that is gone has no faces left
 * to have caries on.
 *
 * The rule lives here rather than in a database constraint because it is about
 * clinical meaning rather than about data shape, and because both places that
 * enforce it — the action that writes and the chart that predicts the write —
 * have to agree, which they can only do by reading one list.
 */
export const EXCLUSIVE_STATUSES: readonly ToothStatus[] = ['MISSING', 'EXTRACTED', 'IMPLANT'];

export function isExclusive(status: ToothStatus): boolean {
  return EXCLUSIVE_STATUSES.includes(status);
}

/** What is recorded on one tooth, as the chart paints it — surfaces in the
 *  stored short form, `''` for a status that names none. */
export interface ToothCondition {
  status: ToothStatus;
  surfaces: string;
  /**
   * The day this finding was made, formatted on the server, where it is known.
   *
   * Optional because half the findings in the app do not have one and must not
   * pretend to: a finding the browser has just applied optimistically has not
   * been written yet, the pickers that reuse this type are choosing teeth
   * rather than reading a record, and a row recorded before the column existed
   * has no author or date to give.
   *
   * Nothing compares teeth by these — `findingsKey` is status and surfaces, so
   * a tooth is the same tooth whether or not its provenance came along.
   */
  on?: string;
  /** Who made it, where it is known. Same reasons for optional. */
  by?: string;
}

export const HEALTHY_TOOTH: ToothCondition = { status: DEFAULT_TOOTH_STATUS, surfaces: '' };

/**
 * Everything true of one tooth, newest first.
 *
 * A tooth used to be one status. It is now a list, because a mouth is: see
 * `ToothFinding` in the schema on the crowned, root-filled molar the chart
 * could only half record. `HEALTHY` never appears here — a healthy tooth is one
 * with no findings, which is the same statement made without a special value to
 * remember to filter out.
 */
export type ToothFindings = readonly ToothCondition[];

export const NO_FINDINGS: ToothFindings = [];

/** The finding of this kind, if the tooth has one. */
export function findingOf(findings: ToothFindings, status: ToothStatus): ToothCondition | null {
  return findings.find((finding) => finding.status === status) ?? null;
}

/**
 * The one finding that decides how the tooth reads at a glance.
 *
 * The chart still has places that can show exactly one thing — the letter beside
 * the tooth number, the colour of a findings row, the pin on the patient's
 * view — and they need an answer rather than a list. Gone beats built beats
 * broken: a missing tooth is missing whatever else was ever recorded on it, and
 * a tooth with both a crown and caries is a tooth with caries as far as the eye
 * skimming an arch is concerned.
 */
const HEADLINE_ORDER: readonly ToothStatus[] = [
  'MISSING',
  'EXTRACTED',
  'IMPLANT',
  // Not a tooth you can treat as a tooth: the crown is gone, or it never came
  // through. Both belong with "gone" rather than with the pathology below,
  // because both change what the next appointment *is* before they change what
  // is wrong.
  'RETAINED_ROOT',
  'IMPACTED',
  // Then the pathology, worst first. A lesion at the apex outranks decay in the
  // crown: it is the finding that can put the patient in the chair this week.
  'PERIAPICAL',
  'CARIES',
  'FRACTURE',
  'ROOT_CANAL',
  'BRIDGE',
  'CROWN',
  'VENEER',
  // A dressing outranks a definitive filling, because the whole point of
  // recording it separately is that the tooth is not finished.
  'TEMPORARY',
  'FILLED',
  'SEALANT',
  // Last, and last on purpose. Watching a fissure is the least that can be true
  // of a tooth, and anything else recorded on it speaks first.
  'WATCH',
];

export function headlineStatus(findings: ToothFindings): ToothStatus {
  for (const status of HEADLINE_ORDER) {
    if (findings.some((finding) => finding.status === status)) return status;
  }
  return DEFAULT_TOOTH_STATUS;
}

/**
 * A tooth with one finding added, removed, or amended — the whole of the
 * quick-marking rule, in one pure function.
 *
 * Needed in two places at once and therefore in neither: the browser applies it
 * to show the change before the server has agreed, and the action applies it to
 * decide what to write. Two copies is how the optimistic chart and the stored
 * one come to disagree about a tooth.
 *
 * Clicking a status the tooth already carries **removes** it, which is what
 * makes the palette a toggle rather than a one-way ratchet; clicking a face of
 * a finding it already carries toggles that face, and the finding goes when its
 * last face does.
 */
export function applyFinding(
  findings: ToothFindings,
  status: ToothStatus,
  surface: ToothSurface | null,
): ToothFindings {
  // Healthy is the absence of findings, so marking it is clearing them.
  if (status === DEFAULT_TOOTH_STATUS) return NO_FINDINGS;

  // Gone is gone: an exclusive finding is the only thing left on the tooth.
  if (isExclusive(status)) {
    return findingOf(findings, status) ? NO_FINDINGS : [{ status, surfaces: '' }];
  }

  const rest = findings.filter(
    (finding) => finding.status !== status && !isExclusive(finding.status),
  );
  const current = findingOf(findings, status);

  if (!statusTakesSurfaces(status)) {
    return current ? rest : [{ status, surfaces: '' }, ...rest];
  }

  if (surface === null) {
    // The whole tooth, from the palette or the picker: on if it was off, and
    // keeping whatever faces were already named for it.
    return current ? rest : [{ status, surfaces: '' }, ...rest];
  }

  const marked = parseSurfaces(current?.surfaces);
  const next = marked.includes(surface)
    ? marked.filter((face) => face !== surface)
    : [...marked, surface];

  if (next.length === 0) return rest;

  // **One face, one surface finding.** A face cannot carry both decay and the
  // filling that replaced it: the decay was cut out to place the restoration,
  // and a chart showing both on the same surface is showing a tooth that has
  // never existed. So claiming a face takes it off whatever else claimed it,
  // and a finding that loses its last face goes with it.
  //
  // This is what replaces the old rule, back when a tooth held one status, that
  // painting a filling over caries *became* the filling. That was right then and
  // is wrong now: findings are a list, so a tooth with an old filling on the
  // mesial and fresh decay on the distal is two findings and the commonest
  // reason a tooth is looked at twice. Only the faces actually claimed move.
  const freed = rest.flatMap((finding) => {
    if (!statusTakesSurfaces(finding.status)) return [finding];
    const kept = parseSurfaces(finding.surfaces).filter((face) => !next.includes(face));
    if (kept.length === parseSurfaces(finding.surfaces).length) return [finding];
    // Spread rather than rebuilt: a finding that loses a face to its neighbour
    // is the same finding, found on the same day by the same person, and
    // reconstructing it from status and surfaces alone dropped both.
    return kept.length === 0 ? [] : [{ ...finding, surfaces: kept.join('') }];
  });

  return [
    {
      // Amending a finding's faces does not re-date it — this is the decay
      // found in March, now known to reach the distal as well.
      ...current,
      status,
      surfaces: TOOTH_SURFACES.filter((f) => next.includes(f)).join(''),
    },
    ...freed,
  ];
}


/* ------------------------------------------------------------------ *
 * The chart as one number
 * ------------------------------------------------------------------ */

/**
 * Decayed, missing and filled teeth — the score every dental record in the
 * world is compared by, and the one thing this chart could not produce from
 * data it has held all along.
 *
 * DMFT is what makes two charts comparable: to the same mouth two years apart,
 * to a sibling, to a national average. Written as a count of *teeth* rather
 * than of findings, so a molar with three fillings scores one.
 *
 * Each tooth is counted once, worst first, because that is the definition:
 *
 *   D  decayed        `CARIES`, and `RETAINED_ROOT` — a root left in is decay
 *                     that got past the point of restoring.
 *   M  missing        `MISSING`, `EXTRACTED`, `IMPLANT`. An implant is a tooth
 *                     that was lost and then replaced; the tooth is still gone.
 *   F  filled         `FILLED`, `TEMPORARY`, `CROWN`, `ROOT_CANAL`, `BRIDGE` —
 *                     restored, whatever it was restored with. Not `VENEER`,
 *                     which is usually cosmetic, and not `SEALANT`, which is
 *                     prevention on a tooth that was never drilled.
 *
 * `IMPACTED` is excluded from the count altogether rather than scored as
 * missing, which is the standard rule and the reason the status had to exist:
 * an unerupted tooth is not a lost one.
 *
 * **One honest overstatement, and it is worth naming.** The index proper counts
 * teeth missing *because of caries*, and no chart in this app records why a
 * tooth came out — the extraction that was orthodontic and the one that was
 * carious are the same row. So M here is every absent tooth. That is the same
 * approximation a paper chart makes, it errs upward, and the alternative was
 * either not offering the number or asking for a reason nobody would type.
 */
export interface CariesIndex {
  decayed: number;
  missing: number;
  filled: number;
  /** D + M + F. The score itself. */
  total: number;
  /** How many teeth were eligible to be counted — the denominator, and the
   *  thing that says whether a score of 2 is a sound mouth or a barely
   *  started examination. */
  counted: number;
}

const DECAYED_STATUSES: readonly ToothStatus[] = ['CARIES', 'RETAINED_ROOT'];
const MISSING_STATUSES: readonly ToothStatus[] = ['MISSING', 'EXTRACTED', 'IMPLANT'];
const FILLED_STATUSES: readonly ToothStatus[] = [
  'FILLED',
  'TEMPORARY',
  'CROWN',
  'ROOT_CANAL',
  'BRIDGE',
];

export function cariesIndex(
  teeth: readonly number[],
  findingsOf: (toothNum: number) => ToothFindings,
): CariesIndex {
  const index: CariesIndex = { decayed: 0, missing: 0, filled: 0, total: 0, counted: 0 };

  for (const toothNum of teeth) {
    const findings = findingsOf(toothNum);
    const holds = (statuses: readonly ToothStatus[]) =>
      findings.some((finding) => statuses.includes(finding.status));

    if (holds(['IMPACTED'])) continue;
    index.counted += 1;

    // Worst first, and each tooth leaves through exactly one of these: a tooth
    // with an old filling and fresh decay at its margin is a decayed tooth, and
    // counting it in both columns is how a mouth scores more than it has teeth.
    if (holds(DECAYED_STATUSES)) index.decayed += 1;
    else if (holds(MISSING_STATUSES)) index.missing += 1;
    else if (holds(FILLED_STATUSES)) index.filled += 1;
  }

  index.total = index.decayed + index.missing + index.filled;
  return index;
}

/* ------------------------------------------------------------------ *
 * Anatomy, for the drawn chart
 * ------------------------------------------------------------------ */

/** Quadrants 1, 2 (and primary 5, 6) hang from the upper jaw. */
export function isUpperArch(toothNum: number): boolean {
  const q = Math.floor(toothNum / 10);
  return q === 1 || q === 2 || q === 5 || q === 6;
}

/** Which corner of the mouth a tooth is in, as the two facts a reader wants:
 *  arch and side. */
export type ToothQuadrant = 'UPPER_RIGHT' | 'UPPER_LEFT' | 'LOWER_RIGHT' | 'LOWER_LEFT';

export function quadrantOf(toothNum: number): ToothQuadrant {
  const side = isRightSide(toothNum) ? 'RIGHT' : 'LEFT';
  return `${isUpperArch(toothNum) ? 'UPPER' : 'LOWER'}_${side}` as ToothQuadrant;
}

/**
 * Which tooth this is within its quadrant, by name.
 *
 * The number is what gets stored and what fits on the chart; the name is what
 * gets *said* — "the upper right first molar" — and what a nurse or a patient
 * can check a finding against without knowing FDI. It is also what the drawn
 * chart is modelled from: each of these is a different tooth with a different
 * outline, and one silhouette shared between two of them is visible.
 */
export type ToothKind =
  | 'CENTRAL_INCISOR'
  | 'LATERAL_INCISOR'
  | 'CANINE'
  | 'FIRST_PREMOLAR'
  | 'SECOND_PREMOLAR'
  | 'FIRST_MOLAR'
  | 'SECOND_MOLAR'
  | 'THIRD_MOLAR';

const PERMANENT_KINDS: readonly ToothKind[] = [
  'CENTRAL_INCISOR',
  'LATERAL_INCISOR',
  'CANINE',
  'FIRST_PREMOLAR',
  'SECOND_PREMOLAR',
  'FIRST_MOLAR',
  'SECOND_MOLAR',
  'THIRD_MOLAR',
];

/** A milk quadrant is five teeth and has no premolars: positions four and five
 *  are its first and second molars. */
const PRIMARY_KINDS: readonly ToothKind[] = [
  'CENTRAL_INCISOR',
  'LATERAL_INCISOR',
  'CANINE',
  'FIRST_MOLAR',
  'SECOND_MOLAR',
];

/** Null for anything that is not a tooth, rather than a name for a tooth that
 *  does not exist — the same reason `universalToFdi` refuses to guess. */
export function toothKind(toothNum: number): ToothKind | null {
  if (!isValidTooth(toothNum)) return null;
  const kinds = dentitionOf(toothNum) === 'PRIMARY' ? PRIMARY_KINDS : PERMANENT_KINDS;
  return kinds[(toothNum % 10) - 1] ?? null;
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
function parseToothSelection(value: string | null | undefined): ToothSelection {
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

/** Just the numbers, for the places that show a case in one line. */
export function selectedTeeth(value: string | null | undefined): number[] {
  const selection = parseToothSelection(value);
  return ALL_TEETH.filter((toothNum) => selection[toothNum] !== undefined);
}
