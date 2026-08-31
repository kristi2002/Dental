import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { ToothRecordMap } from '@/components/dental/DentalChart';
import { PerioStrip } from '@/components/dental/PerioStrip';
import { SurfaceTarget } from '@/components/dental/SurfaceTarget';
import { ToothDefs } from '@/components/dental/ToothDefsProvider';
import { ToothGlyph } from '@/components/dental/ToothGlyph';
import { MOBILITY_LABEL, perioOverview, perioSummaryOf, type PerioSummary } from '@/lib/perio';
import {
  ALL_TEETH,
  DEFAULT_TOOTH_STATUS,
  dentitionOf,
  isAnterior,
  isToothStatus,
  parseSurfaces,
  PERMANENT_LOWER_LEFT,
  PERMANENT_LOWER_RIGHT,
  PERMANENT_UPPER_LEFT,
  PERMANENT_UPPER_RIGHT,
  PRIMARY_LOWER_LEFT,
  PRIMARY_LOWER_RIGHT,
  PRIMARY_UPPER_LEFT,
  PRIMARY_UPPER_RIGHT,
  quadrantOf,
  surfaceFill,
  toothKind,
  toothLabel as toothLabelFor,
  TOOTH_STATUSES,
  TOOTH_STATUS_STYLE,
  type ToothNumbering,
  type ToothStatus,
} from '@/lib/teeth';
import { cn } from '@/lib/utils';

/**
 * The dental chart as a page of a document rather than as a screen to work on.
 *
 * `DentalChart` is an instrument: the findings sit in a panel that scrolls, the
 * two examinations are a toggle, a note past three lines is clamped, and one
 * tooth's pocket depths and typed note live in a dialog you open. All four are
 * the right answer at a desk and none of them survive a printer. What came out
 * of the record sheet was an arch drawing, a legend, a dead pair of tab buttons
 * and whichever six findings happened to be scrolled into view — with the
 * periodontal examination missing altogether unless somebody had thought to
 * flip the toggle before pressing print.
 *
 * So the sheet does not print the instrument. It states the same record flat:
 *
 *  - the arches, with the surfaces drawn and — where the mouth has been probed —
 *    the six depths under every tooth, so the drawing carries both examinations
 *    at once instead of one at a time;
 *  - a legend, because the reader is a surgeon or the patient rather than
 *    somebody who works this chart daily;
 *  - **every** charted tooth, in one table, in anatomical order: its condition,
 *    its surfaces, its pockets, its mobility, its whole note and the day it was
 *    charted. Nothing behind a scroll bar, nothing behind a click.
 *
 * A tooth earns a row by having anything recorded on it at all — a condition, a
 * note, or a probe reading. That union is the point: on screen those are two
 * lists you switch between, and a tooth with a sound crown in a failing socket
 * appears on exactly one of them.
 */
export function ChartSheet({
  records,
  numbering = 'FDI',
  showPrimary = false,
}: {
  records: ToothRecordMap;
  numbering?: ToothNumbering;
  /** Whether the milk-teeth rows are drawn — a child's chart, or an adult's
   *  that has something recorded on them anyway. */
  showPrimary?: boolean;
}) {
  const t = useTranslations('teeth');

  const label = (toothNum: number) => toothLabelFor(toothNum, numbering);

  const statusOf = (toothNum: number): ToothStatus => {
    const raw = records[toothNum]?.status;
    return raw && isToothStatus(raw) ? raw : DEFAULT_TOOTH_STATUS;
  };

  const perioOf = (toothNum: number) => perioSummaryOf(records[toothNum] ?? {});

  const findings = ALL_TEETH.map((toothNum) => ({
    toothNum,
    status: statusOf(toothNum),
    surfaces: parseSurfaces(records[toothNum]?.surfaces),
    notes: records[toothNum]?.notes ?? '',
    chartedOn: records[toothNum]?.chartedOn ?? '',
    perio: perioOf(toothNum),
  })).filter(
    (finding) =>
      finding.status !== DEFAULT_TOOTH_STATUS || finding.notes !== '' || finding.perio.recorded,
  );

  const flagged = findings.filter((finding) => finding.status !== DEFAULT_TOOTH_STATUS);
  const overview = perioOverview(ALL_TEETH.map((toothNum) => perioOf(toothNum)));

  /**
   * Whether this mouth has been probed at all.
   *
   * It settles two things at once, and they have to be settled together: the
   * strip is drawn under every tooth on the arch or under none of them, and the
   * table grows its two periodontal columns or does not. Drawing the strip only
   * beneath the teeth carrying readings would take the row of tooth numbers off
   * its line, and six dots under thirty-two teeth on a chart nobody probes is a
   * column of noise on every referral the practice ever sends.
   */
  const probed = overview.teethProbed > 0;

  // Counted in the order the statuses are declared, which is roughly worst
  // first — the same tally the screen shows, in the same order.
  const tally = TOOTH_STATUSES.filter((status) => status !== DEFAULT_TOOTH_STATUS)
    .map((status) => ({ status, count: flagged.filter((f) => f.status === status).length }))
    .filter((row) => row.count > 0);

  const arch = { statusOf, perioOf, probed, surfacesOf: records, numberLabel: label };

  return (
    <div className="odontogram odontogram-sheet space-y-4">
      <ToothDefs />

      {/* On paper there is no scrolling and the print rules narrow the arch to
          fit — but the sheet is read on screen first, inside a measure that a
          full arch overruns, and a chart clipped at the edge there is exactly
          the failure this component exists to end. */}
      <div className="overflow-x-auto pb-1">
        {/* The arch is one drawing and is never cut in half by the fold. The
            section around it is allowed to break — it carries a findings table
            that will not fit on the page beside the arches — so each part of it
            keeps itself whole instead. */}
        <div className="w-max break-inside-avoid">
          <div className="flex justify-between px-1 pb-1">
            <span className="text-caption font-bold text-ink-faint">{t('right')}</span>
            <span className="text-caption font-bold text-ink-faint">{t('left')}</span>
          </div>

          {/* The upper arch's bottom edge and the midline are the same cyan and
              cross at the centre of the mouth, exactly as on the screen chart —
              the reference point every other tooth is read against. */}
          <div className="border-b-4 border-cyan-400 pb-1.5">
            <SheetArch upper right={PERMANENT_UPPER_RIGHT} left={PERMANENT_UPPER_LEFT} {...arch} />
            {showPrimary ? (
              <SheetArch
                upper
                primary
                right={PRIMARY_UPPER_RIGHT}
                left={PRIMARY_UPPER_LEFT}
                {...arch}
              />
            ) : null}
          </div>

          <div className="pt-1.5">
            {showPrimary ? (
              <SheetArch primary right={PRIMARY_LOWER_RIGHT} left={PRIMARY_LOWER_LEFT} {...arch} />
            ) : null}
            <SheetArch right={PERMANENT_LOWER_RIGHT} left={PERMANENT_LOWER_LEFT} {...arch} />
          </div>
        </div>
      </div>

      {/* The same key the read-only chart carries, for the same reason: the
          swatches are the teeth themselves rather than lettered squares, so
          there is no second notation to learn off a sheet of paper. */}
      <div className="break-inside-avoid rounded-lg border border-line px-3 py-2">
        <p className="mb-1.5 text-caption font-bold tracking-wide text-ink-faint uppercase">
          {t('legend')}
        </p>
        <ul className="grid grid-cols-4 gap-x-3 gap-y-1 print:grid-cols-8 sm:grid-cols-8">
          {TOOTH_STATUSES.map((status) => (
            <li key={status} className="flex flex-col items-center gap-0.5 text-center">
              <span aria-hidden className="h-12 w-7">
                <ToothGlyph
                  toothNum={LEGEND_TOOTH}
                  status={status}
                  surfaces={status === 'CARIES' || status === 'FILLED' ? ['O'] : []}
                />
              </span>
              <span className="text-micro leading-tight font-semibold text-ink">
                {t(`status_${status}`)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="break-inside-avoid">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-meta font-bold tracking-wide text-ink-faint uppercase">
            {t('findings')}
          </span>
          <span className="text-body font-semibold text-ink-soft">
            {[
              t('summary', { count: flagged.length }),
              probed ? t('perioSummary', { count: overview.teethProbed }) : null,
              overview.deepest !== null ? `${t('perioDeepest')} ${overview.deepest}mm` : null,
              overview.bleedingPercent !== null
                ? `${t('perioBleeding')} ${overview.bleedingPercent}%`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </p>

        {tally.length > 0 ? (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {tally.map(({ status, count }) => (
              <li
                key={status}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-caption font-bold',
                  TOOTH_STATUS_STYLE[status].swatch,
                )}
              >
                {t(`status_${status}`)}
                <span className="ml-1.5 tabular-nums">{count}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {findings.length === 0 ? (
        <p className="text-body text-ink-faint">{t('findingsEmpty')}</p>
      ) : (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line-strong">
              <Th>{t('colTooth')}</Th>
              <Th>{t('condition')}</Th>
              <Th>{t('surfaces')}</Th>
              {probed ? <Th>{t('colPockets')}</Th> : null}
              {probed ? <Th>{t('mobility')}</Th> : null}
              <Th>{t('notes')}</Th>
            </tr>
          </thead>
          <tbody>
            {findings.map((finding) => {
              const kind = toothKind(finding.toothNum);
              return (
                <tr key={finding.toothNum} className="break-inside-avoid border-b border-line">
                  <Td className="whitespace-nowrap">
                    <span className="text-body font-bold text-ink tabular-nums">
                      {label(finding.toothNum)}
                    </span>
                    <span className="block text-micro leading-tight text-ink-faint">
                      {t(`quadrant_${quadrantOf(finding.toothNum)}`)}
                      {kind ? ` · ${t(`name_${kind}`)}` : ''}
                      {dentitionOf(finding.toothNum) === 'PRIMARY' ? ` · ${t('primaryTooth')}` : ''}
                    </span>
                  </Td>

                  <Td>
                    {finding.status === DEFAULT_TOOTH_STATUS ? (
                      <Dash />
                    ) : (
                      <span className="font-semibold text-ink">{t(`status_${finding.status}`)}</span>
                    )}
                  </Td>

                  {/* The letters are how the finding is written down and the
                      words are how it is checked — "MOD" is unreadable to
                      anyone outside the surgery, and this sheet is read by
                      people who do not work here. */}
                  <Td>
                    {finding.surfaces.length > 0 ? (
                      <>
                        <span className="font-bold tracking-wide text-ink">
                          {finding.surfaces.join('')}
                        </span>
                        <span className="block text-micro leading-tight text-ink-faint">
                          {finding.surfaces
                            .map((surface) =>
                              surface === 'O'
                                ? t(isAnterior(finding.toothNum) ? 'surface_I' : 'surface_O')
                                : t(`surface_${surface}`),
                            )
                            .join(', ')}
                        </span>
                      </>
                    ) : (
                      <Dash />
                    )}
                  </Td>

                  {probed ? (
                    <Td>
                      {finding.perio.recorded ? (
                        <PerioStrip
                          toothNum={finding.toothNum}
                          summary={finding.perio}
                          showMobility={false}
                        />
                      ) : (
                        <Dash />
                      )}
                    </Td>
                  ) : null}

                  {probed ? (
                    <Td className="whitespace-nowrap">
                      {finding.perio.mobility === null ? (
                        <Dash />
                      ) : (
                        <>
                          <span className="font-bold text-ink">
                            M{MOBILITY_LABEL[finding.perio.mobility]}
                          </span>
                          <span className="block text-micro leading-tight text-ink-faint">
                            {t(`mobility_${finding.perio.mobility}`)}
                          </span>
                        </>
                      )}
                    </Td>
                  ) : null}

                  {/* The whole note. The screen clamps it to three lines behind
                      a click that opens the rest; paper has no click. */}
                  <Td>
                    {finding.notes ? (
                      <span className="block whitespace-pre-line text-ink">{finding.notes}</span>
                    ) : null}
                    {finding.chartedOn ? (
                      <span className="block text-micro leading-tight text-ink-faint">
                        {t('chartedOn', { date: finding.chartedOn })}
                      </span>
                    ) : null}
                    {!finding.notes && !finding.chartedOn ? <Dash /> : null}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** An upper first molar — three roots and a full cusp pattern, so every state
 *  the legend has to show is legible on it. */
const LEGEND_TOOTH = 16;

function Th({ children }: { children: ReactNode }) {
  return (
    <th
      scope="col"
      className="py-1 pr-3 align-bottom text-micro font-bold tracking-wide text-ink-faint uppercase last:pr-0"
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td className={cn('py-1.5 pr-3 align-top text-meta last:pr-0', className)}>{children}</td>
  );
}

/** Nothing recorded in this column for this tooth — said with a rule rather
 *  than left blank, so an empty cell is never read as a row cut off. */
function Dash() {
  return (
    <span aria-hidden className="text-ink-faint">
      —
    </span>
  );
}

/**
 * One arch, laid out the way the chart lays it out: two quadrants either side of
 * a midline rule, the right-hand one packed against it, so a five-tooth primary
 * row still meets the permanent row's centre exactly.
 */
function SheetArch({
  right,
  left,
  upper = false,
  primary = false,
  ...cell
}: {
  right: readonly number[];
  left: readonly number[];
  upper?: boolean;
  primary?: boolean;
} & Omit<SheetCellProps, 'toothNum' | 'upper' | 'primary'>) {
  return (
    <div className="flex items-stretch">
      <div className="flex w-[calc(var(--tooth-col)*8)] shrink-0 justify-end">
        {right.map((toothNum) => (
          <SheetCell key={toothNum} toothNum={toothNum} upper={upper} primary={primary} {...cell} />
        ))}
      </div>

      <div className="w-1 shrink-0 bg-cyan-400" role="presentation" />

      <div className="flex w-[calc(var(--tooth-col)*8)] shrink-0 justify-start">
        {left.map((toothNum) => (
          <SheetCell key={toothNum} toothNum={toothNum} upper={upper} primary={primary} {...cell} />
        ))}
      </div>
    </div>
  );
}

type SheetCellProps = {
  toothNum: number;
  statusOf: (toothNum: number) => ToothStatus;
  perioOf: (toothNum: number) => PerioSummary;
  surfacesOf: ToothRecordMap;
  /** Whether the periodontal row is drawn on this chart at all. */
  probed: boolean;
  numberLabel: (toothNum: number) => string;
  upper?: boolean;
  primary?: boolean;
};

function SheetCell({
  toothNum,
  statusOf,
  perioOf,
  surfacesOf,
  probed,
  numberLabel,
  upper = false,
  primary = false,
}: SheetCellProps) {
  const status = statusOf(toothNum);
  const style = TOOTH_STATUS_STYLE[status];
  const surfaces = surfacesOf[toothNum]?.surfaces ?? '';

  const glyph = (
    <span
      className={cn(
        'block w-full',
        primary ? 'h-[calc(var(--tooth-glyph-h)*0.7)]' : 'h-(--tooth-glyph-h)',
      )}
    >
      <ToothGlyph toothNum={toothNum} status={status} surfaces={parseSurfaces(surfaces)} />
    </span>
  );

  const wheel = (
    <span className="mx-auto block h-9 w-9">
      <SurfaceTarget
        toothNum={toothNum}
        readOnly
        fillOf={(surface) => surfaceFill(status, surfaces, surface)}
      />
    </span>
  );

  // Both examinations under the one tooth. On screen these are two views you
  // switch between; paper has nothing to switch, and a chart that printed the
  // crown and left the socket out would read as a clean bill of health.
  const strip = probed ? (
    <PerioStrip toothNum={toothNum} summary={perioOf(toothNum)} className="mx-auto" />
  ) : null;

  const number = (
    <span
      className={cn(
        'block text-center text-caption leading-4 font-bold tabular-nums',
        status === DEFAULT_TOOTH_STATUS ? 'text-ink-faint' : 'text-ink',
      )}
    >
      {numberLabel(toothNum)}
      {style.short ? (
        <span aria-hidden className="ml-0.5 text-micro opacity-80">
          {style.short}
        </span>
      ) : null}
    </span>
  );

  return (
    <div className="flex w-(--tooth-col) shrink-0 flex-col gap-0.5 px-0.5">
      {upper ? (
        <>
          {glyph}
          {wheel}
          {strip}
          {number}
        </>
      ) : (
        <>
          {number}
          {strip}
          {wheel}
          {glyph}
        </>
      )}
    </div>
  );
}
