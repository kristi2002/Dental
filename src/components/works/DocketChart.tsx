import { PERMANENT_LOWER, PERMANENT_UPPER } from '@/lib/teeth';
import { parseToothSpan, spanDigit, type SpanPosition } from '@/lib/tooth-span';
import { cn } from '@/lib/utils';

/**
 * The four rows of eight, as the laboratory docket draws them.
 *
 * This is the grid already printed on the practice's own pads: the arch laid out
 * flat, right-hand teeth on the left of the page, `R` and `L` in the margins,
 * and a rule down the midline. The dentist rings the teeth the case covers
 * before the docket goes in the box.
 *
 * Drawn here from what is already in the register rather than left blank to be
 * ringed by hand — which is the one thing this sheet does that the pad cannot.
 * The span was typed once when the case was written down (see `tooth-span.ts`),
 * and a docket that marks it is a docket that cannot disagree with the register
 * about which teeth went to the laboratory.
 *
 * Deliberately not the app's own `DentalChart`. That is a chart of a *mouth* —
 * every surface, every status, colour-coded, and interactive — and it answers a
 * clinical question. This answers a shipping one: which positions are in this
 * case. Same teeth, different sheet of paper, and the laboratory has no use for
 * a caries history.
 */
export function DocketChart({
  /** Every line's span, already merged — see `mergeSpans`. */
  positions,
  labels,
}: {
  positions: readonly SpanPosition[];
  /**
   * The sides and arches in words, for screen readers.
   *
   * Only ever announced, never drawn — the margins themselves are lettered `R`
   * and `L` below. Those two letters are anatomical notation rather than
   * English: every dental chart in every language marks the arch that way, the
   * practice's own pad is printed with them, and "Djathtas"/"Sinistra" in a
   * margin one character wide would be both wider than the chart and less
   * recognisable to the technician reading it.
   */
  labels: { right: string; left: string; upper: string; lower: string };
}) {
  const marks = new Map(positions.map((position) => [position.toothNum, position.pontic]));

  const row = (teeth: readonly number[], arch: string) => (
    <tr>
      {/* The margin letters are on the paper form and earn their place: the
          chart is drawn from the patient's point of view, so the teeth on the
          left of the page are the ones on their right, and every dentist has
          been caught out by that at least once. */}
      <th scope="row" className="w-7 pr-1.5 text-right text-[0.72rem] font-bold text-ink-faint">
        <span aria-hidden>R</span>
        <span className="sr-only">
          {labels.right} — {arch}
        </span>
      </th>

      {teeth.map((toothNum, index) => {
        const pontic = marks.get(toothNum);
        const marked = pontic !== undefined;

        return (
          <td
            key={toothNum}
            className={cn(
              'h-8 border border-line-strong text-center text-[0.95rem] tabular-nums',
              // The midline, heavier than the cell borders. Without it the two
              // quadrants read as one run of sixteen and `5` stops meaning a
              // particular tooth — the same reason `spanQuadrants` exists.
              index === 8 && 'border-l-2 border-l-ink',
              marked ? 'bg-line/60 font-bold text-ink' : 'text-ink-faint',
            )}
          >
            {/* A gap is written `x`, exactly as the register stores it and the
                docket has always written it: the laboratory still makes an
                element for that position, and printing the absent tooth's own
                number there would ask them to make a crown for a tooth that is
                not in the mouth. */}
            {pontic ? 'x' : spanDigit(toothNum)}
          </td>
        );
      })}

      {/* The mirror margin. Purely the printed pad's own furniture — the row
          already announced itself through the header cell above. */}
      <td aria-hidden className="w-7 pl-1.5 text-left text-[0.72rem] font-bold text-ink-faint">
        L
      </td>
    </tr>
  );

  return (
    <table className="w-full table-fixed border-collapse">
      <tbody>
        {row(PERMANENT_UPPER, labels.upper)}
        {row(PERMANENT_LOWER, labels.lower)}
      </tbody>
    </table>
  );
}

/**
 * Every line's span merged into one, for the chart above.
 *
 * A case is often three pieces of work — a crown here, a bridge there — each
 * with its own span, and the docket has one chart. Re-read through the register's
 * own parser rather than concatenated by hand, so a position named by two lines
 * merges the way it does everywhere else: towards the gap.
 */
export function mergeSpans(lines: ReadonlyArray<{ teeth: string | null }>): SpanPosition[] {
  return parseToothSpan(
    lines
      .map((line) => line.teeth)
      .filter((teeth): teeth is string => Boolean(teeth))
      .join(','),
  );
}
