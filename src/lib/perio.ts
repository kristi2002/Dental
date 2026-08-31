/**
 * The periodontal half of the chart: how deep the gum pocket is round each
 * tooth, whether it bled when probed, and how much the tooth moves.
 *
 * The odontogram in `teeth.ts` answers "what is wrong with the tooth". It has
 * nothing to say about what is wrong with the *hold* on it, and that is the
 * half that decides whether a crown is worth building. A tooth can be flawless
 * enamel and still be leaving.
 *
 * Three measurements, because they are the three that change the treatment:
 *
 *   depth      how far the probe goes down before the attachment stops it.
 *              Up to 3mm is a healthy sulcus; 4–5mm is a pocket to watch and
 *              clean; 6mm and past it is disease that surgery gets called to.
 *   bleeding   whether the site bled. A 4mm pocket that does not bleed is a
 *              measurement; the same pocket bleeding is active disease. This is
 *              why depth alone is not enough to record.
 *   mobility   Miller's grades. 0 is firm, I is perceptible, II moves more than
 *              a millimetre sideways, III can be depressed into its socket.
 *
 * Six sites per tooth is the standard examination — three round the cheek side
 * and three round the tongue side — because a pocket is local: 3mm everywhere
 * and 8mm at one corner is one failing root, not a healthy tooth averaged out.
 * They are stored in one string apiece rather than a row per site: six readings
 * taken in one pass, written down together and read together.
 */

import { dentitionOf, isRightSide, isUpperArch } from '@/lib/teeth';

/**
 * The six sites, in storage order — distal to mesial round the cheek, then the
 * same round the tongue. Canonical, not as-displayed: which end of the row is
 * mesial depends on which side of the mouth the tooth is, exactly as it does
 * for the surface wheel, and `perioLayout` is where that gets resolved.
 */
export const PERIO_SITES = ['DB', 'B', 'MB', 'DL', 'L', 'ML'] as const;

export type PerioSite = (typeof PERIO_SITES)[number];

/** Six, everywhere. Named so the reason a loop runs six times is legible. */
export const PERIO_SITE_COUNT = PERIO_SITES.length;

/** The first three sites are the cheek side. */
export const BUCCAL_SITES = [0, 1, 2] as const;
export const LINGUAL_SITES = [3, 4, 5] as const;

/**
 * A probe reading per site — millimetres, or null for a site nobody probed.
 *
 * Null rather than 0 throughout: a 0mm pocket does not exist, so a zero here
 * could only ever mean "not measured", and a number that means "no number" is
 * the kind of thing that gets summed by accident.
 */
export type PocketDepths = readonly (number | null)[];

/** Whether each site bled. */
export type BleedingSites = readonly boolean[];

export const NO_POCKETS: PocketDepths = [null, null, null, null, null, null];
export const NO_BLEEDING: BleedingSites = [false, false, false, false, false, false];

/** Past this the reading is a typo, not a pocket — the deepest ever recorded in
 *  a mouth is far short of it, and a stray keypress must not become a 55mm
 *  finding the summary then shouts about. */
export const POCKET_MAX = 15;

/** Where a healthy sulcus stops and a pocket begins. */
export const POCKET_SHALLOW = 3;
/** Where watching stops and disease begins. */
export const POCKET_DEEP = 6;

export const MOBILITY_GRADES = [0, 1, 2, 3] as const;
export type MobilityGrade = (typeof MOBILITY_GRADES)[number];

/** Miller's grades are written as roman numerals on every chart in the world,
 *  and `2` beside a pocket depth of `4` reads as another millimetre count. */
export const MOBILITY_LABEL: Record<MobilityGrade, string> = {
  0: '0',
  1: 'I',
  2: 'II',
  3: 'III',
};

export function isMobilityGrade(value: number): value is MobilityGrade {
  return (MOBILITY_GRADES as readonly number[]).includes(value);
}

/** A grade off the wire, or null for anything that is not one — an unassessed
 *  tooth and an unreadable value are the same answer, which is "do not report
 *  a number for this". */
export function parseMobility(value: unknown): MobilityGrade | null {
  const grade = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  return typeof grade === 'number' && Number.isInteger(grade) && isMobilityGrade(grade)
    ? grade
    : null;
}

/**
 * One reading, checked — millimetres, or null for anything that is not a pocket
 * depth.
 *
 * The only place the range lives, because three callers have to agree about it
 * and the two that disagreed produced a mouth that bled at 600% of its sites:
 * `parsePockets` reads it off the column, `formatPockets` checks it on the way
 * back, and `saveToothPerio` asks it which sites really carry a depth before it
 * writes the bleeding mask. A site the depth column refuses while the mask
 * keeps it is a site that bled at no depth — and the bleeding score is then a
 * percentage of more sites than were probed.
 *
 * Zero is not a reading. A sulcus that measures nothing does not exist, so a
 * zero can only ever have meant "not probed".
 */
export function toPocketDepth(value: unknown): number | null {
  const depth = typeof value === 'string' ? Number.parseInt(value.trim(), 10) : value;
  return typeof depth === 'number' && Number.isInteger(depth) && depth > 0 && depth <= POCKET_MAX
    ? depth
    : null;
}

/**
 * Read the stored depths. Always six entries out, whatever came in — a short or
 * damaged string yields nulls rather than a ragged array every caller would
 * then have to bounds-check.
 */
export function parsePockets(value: string | null | undefined): PocketDepths {
  if (!value) return NO_POCKETS;

  const parts = value.split(',');
  return Array.from({ length: PERIO_SITE_COUNT }, (_, i) => toPocketDepth(parts[i] ?? ''));
}

/**
 * Back to the column. Null when nothing was probed, so a tooth whose readings
 * are all cleared stops carrying an empty `",,,,,"` that every `if (pockets)`
 * downstream would read as data.
 */
export function formatPockets(depths: PocketDepths): string | null {
  const written = Array.from({ length: PERIO_SITE_COUNT }, (_, i) => {
    const depth = toPocketDepth(depths[i]);
    return depth === null ? '' : String(depth);
  });
  return written.some((part) => part !== '') ? written.join(',') : null;
}

/**
 * Gingival recession, in millimetres, at the same six sites.
 *
 * How far the gum has retreated from the enamel margin, which is the other half
 * of the only number periodontal diagnosis actually runs on. A probe reads from
 * wherever the gum currently is, so pocket depth alone under-reports a recessed
 * tooth badly: 4mm of pocket on 3mm of recession is 7mm of attachment gone,
 * which is a referral, against 4mm with no recession, which is a hygiene visit.
 *
 * Zero *is* a reading here, unlike a pocket depth — "the margin is exactly at
 * the enamel" is the normal healthy finding and the commonest value in a mouth.
 * So an unmeasured site is the empty string and nothing else, and `RECESSION_MAX`
 * rather than `> 0` is what a value has to clear.
 */
export const RECESSION_MAX = 20;

export type Recessions = readonly (number | null)[];
export const NO_RECESSION: Recessions = [null, null, null, null, null, null];

export function toRecession(value: unknown): number | null {
  const mm = typeof value === 'string' ? Number.parseInt(value.trim(), 10) : value;
  return typeof mm === 'number' && Number.isInteger(mm) && mm >= 0 && mm <= RECESSION_MAX
    ? mm
    : null;
}

export function parseRecession(value: string | null | undefined): Recessions {
  if (!value) return NO_RECESSION;
  const parts = value.split(',');
  return Array.from({ length: PERIO_SITE_COUNT }, (_, i) => toRecession(parts[i] ?? ''));
}

export function formatRecession(values: Recessions): string | null {
  const written = Array.from({ length: PERIO_SITE_COUNT }, (_, i) => {
    const mm = toRecession(values[i]);
    return mm === null ? '' : String(mm);
  });
  return written.some((part) => part !== '') ? written.join(',') : null;
}

/**
 * Clinical attachment loss at one site: how much of the tooth's hold is gone.
 *
 * Pocket plus recession, and null unless *both* were read — an estimate made by
 * treating an unmeasured recession as zero is exactly the under-report this
 * column was added to stop, and it would be indistinguishable from a real
 * reading once stored.
 */
export function attachmentLoss(depth: number | null, recession: number | null): number | null {
  return depth === null || recession === null ? null : depth + recession;
}

/**
 * Furcation grades, where the roots of a multi-rooted tooth divide.
 *
 * 0 none, 1 a probe catches the concavity, 2 it enters but does not pass
 * through, 3 it passes clean between the roots. Grade 2 is where a molar's
 * prognosis changes and 3 is usually where it ends, which is why one number per
 * tooth — the worst of its furcations — answers the question this is for.
 */
export const FURCATION_GRADES = [0, 1, 2, 3] as const;
export type FurcationGrade = (typeof FURCATION_GRADES)[number];

export function isFurcationGrade(value: number): value is FurcationGrade {
  return (FURCATION_GRADES as readonly number[]).includes(value);
}

export function parseFurcation(value: unknown): FurcationGrade | null {
  const grade = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  return typeof grade === 'number' && Number.isInteger(grade) && isFurcationGrade(grade)
    ? grade
    : null;
}

/**
 * Whether a tooth has a furcation at all — a grade on a single-rooted tooth is
 * a category error, not a finding, so the field is not offered there.
 *
 * Every molar, upper and lower, and the upper first premolar, which is the one
 * premolar in the mouth that routinely has two roots.
 */
export function hasFurcation(toothNum: number): boolean {
  const position = toothNum % 10;
  if (dentitionOf(toothNum) === 'PRIMARY') return position >= 4;
  return position >= 6 || (position === 4 && isUpperArch(toothNum));
}

export function parseBleeding(value: string | null | undefined): BleedingSites {
  if (!value) return NO_BLEEDING;
  return Array.from({ length: PERIO_SITE_COUNT }, (_, i) => value[i] === '1');
}

export function formatBleeding(sites: BleedingSites): string | null {
  const mask = Array.from({ length: PERIO_SITE_COUNT }, (_, i) => (sites[i] ? '1' : '0')).join('');
  return mask.includes('1') ? mask : null;
}

/** How bad one reading is, as the three bands every periodontal chart colours. */
export type PocketBand = 'UNPROBED' | 'HEALTHY' | 'WATCH' | 'DISEASED';

export function pocketBand(depth: number | null | undefined): PocketBand {
  // A zero is banded as unprobed rather than as the healthiest reading there
  // is. Nothing stored can be one, but the box being typed into can hold one
  // for as long as it takes to press the next key, and colouring it green says
  // the reading was accepted when it is about to be dropped.
  if (typeof depth !== 'number' || depth <= 0) return 'UNPROBED';
  if (depth <= POCKET_SHALLOW) return 'HEALTHY';
  return depth < POCKET_DEEP ? 'WATCH' : 'DISEASED';
}

/**
 * Where each site sits on screen for this tooth.
 *
 * Same two conventions the surface wheel follows, and for the same reason —
 * getting either backwards records the wrong corner of the tooth:
 *
 *  - **The cheek side is drawn away from the bite.** Upper teeth hang down the
 *    page, so their buccal row is the top one; lower teeth stand up, so theirs
 *    is the bottom.
 *  - **Mesial points at the midline.** The patient's right-hand quadrants are
 *    drawn on the left of the screen, so for those teeth mesial is the
 *    right-hand end of the row and the storage order reads straight across.
 */
export function perioLayout(toothNum: number): {
  /** Site indices along the cheek-side row, left to right as drawn. */
  buccal: number[];
  /** Site indices along the tongue-side row, left to right as drawn. */
  lingual: number[];
  /** Whether the cheek-side row is the upper of the two. */
  buccalFirst: boolean;
} {
  const mesialIsRight = isRightSide(toothNum);
  const order = (sites: readonly number[]) => (mesialIsRight ? [...sites] : sites.toReversed());

  return {
    buccal: order(BUCCAL_SITES),
    lingual: order(LINGUAL_SITES),
    buccalFirst: isUpperArch(toothNum),
  };
}

/**
 * Everything the chart wants to say about one tooth's periodontium, worked out
 * once. The strip under the tooth, the findings list beside the arch and the
 * summary above them all ask the same three questions, and each answering them
 * from raw strings is how two of them end up disagreeing.
 */
export interface PerioSummary {
  depths: PocketDepths;
  bleeding: BleedingSites;
  mobility: MobilityGrade | null;
  recession: Recessions;
  furcation: FurcationGrade | null;
  /** Pocket plus recession per site, null where either was not read. */
  attachment: readonly (number | null)[];
  /** The worst attachment loss, which is the number a prognosis turns on. */
  worstAttachment: number | null;
  /** How many of the six were actually probed. */
  probed: number;
  /** The worst reading, which is the one that decides the treatment. */
  deepest: number | null;
  /** How many sites bled. */
  bleedingCount: number;
  /** Whether anything at all was recorded — an unassessed tooth is left out of
   *  every average rather than counted as healthy. */
  recorded: boolean;
  /** Whether this tooth is one to raise: a pocket past watching, or a tooth
   *  that moves. Bleeding alone is a hygiene finding, not a red flag. */
  concerning: boolean;
}

export function perioSummaryOf(record: {
  pockets?: string | null;
  bleeding?: string | null;
  mobility?: number | null;
  recession?: string | null;
  furcation?: number | null;
}): PerioSummary {
  const depths = parsePockets(record.pockets);
  const mobility = parseMobility(record.mobility ?? null);
  const recession = parseRecession(record.recession);
  const furcation = parseFurcation(record.furcation ?? null);
  const attachment = depths.map((depth, site) => attachmentLoss(depth, recession[site]));
  const measuredAttachment = attachment.filter((mm): mm is number => typeof mm === 'number');

  // A tick at a site with no depth is dropped rather than reported. Bleeding is
  // recorded per site *alongside* the depth or not at all — that is what the
  // column means — so a mask that outruns the readings is damage, and counting
  // it is how `sitesBleeding` overtakes `sitesProbed` and the mouth is reported
  // as bleeding at more than 100% of the sites anybody probed.
  const bleeding = parseBleeding(record.bleeding).map(
    (bled, site) => bled && depths[site] !== null,
  );

  const measured = depths.filter((depth): depth is number => typeof depth === 'number');
  const bleedingCount = bleeding.filter(Boolean).length;
  const deepest = measured.length > 0 ? Math.max(...measured) : null;

  return {
    depths,
    bleeding,
    mobility,
    recession,
    furcation,
    attachment,
    worstAttachment: measuredAttachment.length > 0 ? Math.max(...measuredAttachment) : null,
    probed: measured.length,
    deepest,
    bleedingCount,
    // Recession and furcation count as having been examined. A tooth whose only
    // finding is 3mm of recession has certainly been looked at, and leaving it
    // out of `recorded` drops it from every average the overview computes.
    recorded:
      measured.length > 0 ||
      bleedingCount > 0 ||
      mobility !== null ||
      furcation !== null ||
      recession.some((mm) => mm !== null),
    // Grade 2 furcation is where a molar's prognosis changes, so it belongs in
    // the same flag a 4mm pocket raises.
    concerning:
      (deepest !== null && deepest > POCKET_SHALLOW) ||
      (mobility !== null && mobility > 0) ||
      (furcation !== null && furcation >= 2),
  };
}

/** Whether a stored row carries periodontal readings — the question the delete
 *  rule in `saveToothRecord` has to ask before dropping a "healthy, no note"
 *  tooth, since a perfect crown can sit in a failing socket. */
export function hasPerio(record: {
  pockets?: string | null;
  bleeding?: string | null;
  mobility?: number | null;
}): boolean {
  return perioSummaryOf(record).recorded;
}

/**
 * The mouth as a whole: the two numbers a periodontal examination is reported
 * as, over the teeth that were actually examined.
 *
 * Bleeding is a percentage of *probed sites*, not of all thirty-two teeth —
 * scoring an unexamined mouth as 0% bleeding is the one arithmetic mistake here
 * that would read as good news.
 */
export function perioOverview(summaries: readonly PerioSummary[]): {
  teethProbed: number;
  sitesProbed: number;
  sitesBleeding: number;
  /** Rounded whole percent, or null when nothing has been probed. */
  bleedingPercent: number | null;
  deepest: number | null;
  /** Teeth carrying a pocket past 3mm or any mobility. */
  concerning: number;
} {
  const examined = summaries.filter((summary) => summary.recorded);
  const sitesProbed = examined.reduce((total, summary) => total + summary.probed, 0);
  const sitesBleeding = examined.reduce((total, summary) => total + summary.bleedingCount, 0);
  const depths = examined
    .map((summary) => summary.deepest)
    .filter((depth): depth is number => depth !== null);

  return {
    teethProbed: examined.length,
    sitesProbed,
    sitesBleeding,
    bleedingPercent: sitesProbed > 0 ? Math.round((sitesBleeding / sitesProbed) * 100) : null,
    deepest: depths.length > 0 ? Math.max(...depths) : null,
    concerning: examined.filter((summary) => summary.concerning).length,
  };
}
