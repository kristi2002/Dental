import type { ToothRecordMap } from '@/components/dental/DentalChart';
import { isToothStatus, type ToothCondition } from '@/lib/teeth';

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
  findings: readonly { toothNum: number; status: string; surfaces: string | null }[],
  /** Composed by the caller, because a browser without full ICU data spells an
   *  Albanian month wrong and the mismatch is a hydration error. */
  formatDay: (value: Date) => string,
): ToothRecordMap {
  const byTooth = new Map<number, ToothCondition[]>();
  for (const finding of findings) {
    // A status the app no longer knows is dropped rather than rendered: the
    // colour tables and the drawing are both keyed on the union, and a stray
    // value from an old import would otherwise reach them as `undefined`.
    if (!isToothStatus(finding.status)) continue;
    const list = byTooth.get(finding.toothNum) ?? [];
    list.push({ status: finding.status, surfaces: finding.surfaces ?? '' });
    byTooth.set(finding.toothNum, list);
  }

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
