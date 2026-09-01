import type { ToothRecordMap } from '@/components/dental/DentalChart';
import type { ChartedTeeth } from '@/components/dental/ToothPicker';
import {
  DEFAULT_TOOTH_STATUS,
  findingOf,
  headlineStatus,
  isToothStatus,
  type ToothCondition,
} from '@/lib/teeth';

/**
 * One row as it comes off `ToothFinding`.
 *
 * The provenance is optional because half the callers do not select it: the
 * pickers reuse this map to choose teeth rather than to read a record, and a
 * query that fetched the examiner's name to draw a lab order's tooth row would
 * be paying for a join nobody reads.
 */
type FindingRow = {
  toothNum: number;
  status: string;
  surfaces: string | null;
  recordedAt?: Date;
  recordedBy?: { firstName: string; lastName: string } | null;
};

/** A tooth's findings, gathered from the flat rows the database returns. */
function findingsByTooth(
  findings: readonly FindingRow[],
  /** Spells the date a finding was made, where the caller asked for one.
   *  Composed by the caller for the reason `formatDay` below is. */
  formatDay?: (value: Date) => string,
): Map<number, ToothCondition[]> {
  const byTooth = new Map<number, ToothCondition[]>();
  for (const finding of findings) {
    // A status the app no longer knows is dropped rather than rendered: the
    // colour tables and the drawing are both keyed on the union, and a stray
    // value from an old import would otherwise reach them as `undefined`.
    if (!isToothStatus(finding.status)) continue;
    const list = byTooth.get(finding.toothNum) ?? [];
    const condition: ToothCondition = {
      status: finding.status,
      surfaces: finding.surfaces ?? '',
    };
    // Set only when known. A finding recorded before the column existed has no
    // author, and an empty string in its place would draw a byline with nobody
    // in it — which reads as a bug where a missing line reads as history.
    if (formatDay && finding.recordedAt) condition.on = formatDay(finding.recordedAt);
    if (finding.recordedBy) {
      condition.by = `${finding.recordedBy.firstName} ${finding.recordedBy.lastName}`.trim();
    }
    list.push(condition);
    byTooth.set(finding.toothNum, list);
  }
  return byTooth;
}

/**
 * The chart's input, assembled from the two tables that now hold a tooth.
 *
 * Findings moved out of `ToothRecord` into `ToothFinding` — see that model on
 * the crowned, root-filled molar the old single `status` column could only
 * half record. What is left on `ToothRecord` is the periodontal examination and
 * the note.
 *
 * **Which means the two can exist independently, and the map has to be built
 * from the union of them.** A tooth that has been charted with caries and never
 * probed has a finding and no record; a tooth that was probed and found sound
 * has a record and no findings. Building the map by walking `teethRecords`
 * alone — which is what the pages did when there was only one table — would
 * have silently dropped every finding on a tooth nobody had probed, which is
 * most of them.
 *
 * Shared by the patient page and the printed record for the reason `surfaceFill`
 * is shared: two copies of this is how the screen and the paper come to
 * disagree about a tooth.
 */
export function toothRecordMap(
  records: readonly {
    toothNum: number;
    notes: string | null;
    updatedAt: Date;
    mobility: number | null;
    pockets: string | null;
    bleeding: string | null;
    recession: string | null;
    furcation: number | null;
  }[],
  findings: readonly FindingRow[],
  /** Composed by the caller, because a browser without full ICU data spells an
   *  Albanian month wrong and the mismatch is a hydration error. */
  formatDay: (value: Date) => string,
): ToothRecordMap {
  const byTooth = findingsByTooth(findings, formatDay);

  const map: ToothRecordMap = {};

  for (const record of records) {
    map[record.toothNum] = {
      findings: byTooth.get(record.toothNum) ?? [],
      notes: record.notes ?? '',
      mobility: record.mobility,
      pockets: record.pockets,
      bleeding: record.bleeding,
      recession: record.recession,
      furcation: record.furcation,
      // When the tooth was last charted. Caries found two years ago and caries
      // found this morning are the same red on the drawing and two very
      // different conversations.
      chartedOn: formatDay(record.updatedAt),
    };
  }

  // And the teeth that have a finding and nothing else. No `chartedOn`: the
  // date on this map is the periodontal row's, and there is no row.
  for (const [toothNum, list] of byTooth) {
    if (map[toothNum]) continue;
    map[toothNum] = {
      findings: list,
      notes: '',
      mobility: null,
      pockets: null,
      bleeding: null,
      recession: null,
      furcation: null,
    };
  }

  return map;
}

/**
 * What one visit charted, as one row per finding.
 *
 * The timeline's own unit is the finding, not the tooth — it says what happened
 * that day, and "caries on 26" and "root canal on 26" are two things that
 * happened even when they happened at the same appointment. `toothRecordMap`
 * above answers the other question, the tooth's whole state now, which is why
 * this cannot simply reuse it.
 *
 * A tooth's note rides along on each of its findings, because the note was
 * written about the tooth rather than about one of them.
 *
 * **Only the rows that say something about the tooth.** Probing a gum writes a
 * `ToothRecord` too — no finding, no note, nothing but pocket depths — and a
 * full periodontal examination would otherwise append thirty-two teeth to the
 * visit that took it, none of which that visit changed.
 */
export function visitToothViews(
  findings: readonly { toothNum: number; status: string; surfaces: string | null }[],
  records: readonly { toothNum: number; notes: string | null }[],
): { toothNum: number; status: string; surfaces: string; notes: string }[] {
  const noteOf = new Map<number, string>();
  for (const record of records) {
    if (record.notes) noteOf.set(record.toothNum, record.notes);
  }

  const rows = findings.map((finding) => ({
    toothNum: finding.toothNum,
    status: finding.status,
    surfaces: finding.surfaces ?? '',
    notes: noteOf.get(finding.toothNum) ?? '',
  }));

  // And the teeth this visit only wrote a note on. `HEALTHY` is what the glyph
  // reads as "draw the tooth, draw no finding on it" — the note is the row.
  const charted = new Set(findings.map((finding) => finding.toothNum));
  for (const [toothNum, notes] of noteOf) {
    if (charted.has(toothNum)) continue;
    rows.push({ toothNum, status: DEFAULT_TOOTH_STATUS, surfaces: '', notes });
  }

  return rows.toSorted((a, b) => a.toothNum - b.toothNum || a.status.localeCompare(b.status));
}

/**
 * The same findings, collapsed to one status per tooth, for the pickers.
 *
 * A picker tints a button; it has no room for the list of findings a tooth now
 * carries and no need for it. `headlineStatus` decides which one speaks for the
 * tooth — gone beats built beats broken.
 *
 * A tooth with a periodontal row and no finding is simply absent, which is what
 * the picker draws for `HEALTHY` anyway.
 */
export function chartedTeethOf(
  findings: readonly { toothNum: number; status: string; surfaces: string | null }[],
): ChartedTeeth {
  const map: ChartedTeeth = {};
  for (const [toothNum, list] of findingsByTooth(findings)) {
    const status = headlineStatus(list);
    map[toothNum] = { status, surfaces: findingOf(list, status)?.surfaces ?? '' };
  }
  return map;
}
