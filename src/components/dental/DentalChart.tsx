'use client';

import { ClipboardList, Stethoscope, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { SurfaceTarget, SURFACE_UNMARKED } from '@/components/dental/SurfaceTarget';
import { ToothDefs, ToothGlyph } from '@/components/dental/ToothGlyph';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { saveToothRecord } from '@/lib/actions/patients';
import { planStepForTooth } from '@/lib/actions/plans';
import { IDLE_STATE } from '@/lib/actions/types';
import {
  ALL_TEETH,
  DEFAULT_TOOTH_STATUS,
  PERMANENT_LOWER_LEFT,
  PERMANENT_LOWER_RIGHT,
  PERMANENT_UPPER_LEFT,
  PERMANENT_UPPER_RIGHT,
  PRIMARY_LOWER_LEFT,
  PRIMARY_LOWER_RIGHT,
  PRIMARY_UPPER_LEFT,
  PRIMARY_UPPER_RIGHT,
  TOOTH_STATUSES,
  TOOTH_STATUS_STYLE,
  TOOTH_SURFACES,
  dentitionOf,
  isAnterior,
  parseSurfaces,
  quadrantOf,
  toothKind,
  toothLabel as toothLabelFor,
  type ToothNumbering,
  type ToothStatus,
  type ToothSurface,
} from '@/lib/teeth';
import { cn } from '@/lib/utils';

/**
 * The chart as an odontogram: each tooth drawn as itself, with the five-surface
 * target beneath it and its number under that, the two arches meeting at a
 * crosshair on the midline.
 *
 * This replaced a grid of coloured buttons. The grid could say "14 has caries";
 * it could not say *where* on 14, which is the difference between a note and a
 * treatment plan — and the surface was already being stored. Reading it off a
 * row of squares also meant counting along to find the tooth, which is how the
 * wrong one gets clicked.
 *
 * Clicking the tooth opens its record. Clicking a segment of the target opens
 * the same record with that surface already ticked, so the common path —
 * "distal-occlusal of 46" — is two clicks and not a hunt through a checkbox
 * list. Both go through the one authorised server action, so there is a single
 * save path and a single audit entry.
 */

export type ToothRecordMap = Record<
  number,
  {
    status: string;
    notes: string;
    surfaces: string;
    /**
     * The day the tooth was last charted, formatted on the server.
     *
     * A date rather than a timestamp because the client cannot be trusted to
     * spell the month: a browser without full ICU data renders Albanian
     * `13 gush 2026` as `Aug 13, 2026`, which is both wrong and a hydration
     * mismatch against the server's markup. Optional because the pickers that
     * reuse this map only ever needed the state, not its date.
     */
    chartedOn?: string;
  }
>;

/** Statuses that describe the whole tooth, where naming a surface is nonsense. */
const WHOLE_TOOTH_STATUSES: readonly ToothStatus[] = [
  'HEALTHY',
  'EXTRACTED',
  'MISSING',
  'IMPLANT',
  'CROWN',
];

/**
 * The status hues as flat colour, for the SVG target.
 *
 * A single red for everything marked would have been less code and less
 * information: the chart distinguishes eight conditions, and a technician
 * glancing at it should be able to tell a filling from a caries without opening
 * anything. These are the 500-weight of each family the legend already uses, so
 * the target and the swatch beside it agree. Caries — the one the brief named —
 * is red-500.
 */
const STATUS_HUE: Record<ToothStatus, string> = {
  HEALTHY: SURFACE_UNMARKED,
  CARIES: '#EF4444', // red-500
  FILLED: '#0EA5E9', // sky-500
  CROWN: '#F59E0B', // amber-500
  ROOT_CANAL: '#8B5CF6', // violet-500
  EXTRACTED: '#475569', // slate-600
  IMPLANT: '#14B8A6', // teal-500
  MISSING: '#94A3B8', // slate-400
};

/** An upper first molar — three roots and a full cusp pattern, so every state
 *  the legend has to show is legible on it. */
const LEGEND_TOOTH = 16;

/** One tooth is one cell wide on every row, so the arches stay in column. */
const CELL = 'w-12 shrink-0';
/** Eight cells — a full permanent quadrant, and the width the shorter primary
 *  quadrants are padded to so every midline on the page lines up. */
const HALF = 'w-96 shrink-0';

function statusOf(records: ToothRecordMap, toothNum: number): ToothStatus {
  const raw = records[toothNum]?.status;
  return raw && (TOOTH_STATUSES as readonly string[]).includes(raw)
    ? (raw as ToothStatus)
    : DEFAULT_TOOTH_STATUS;
}

/**
 * A healthy tooth's target is blank. Otherwise the recorded surfaces carry the
 * status hue — and a status that names no surface, either because it is about
 * the whole tooth or because none was recorded, fills all five rather than
 * leaving a flagged tooth looking untouched.
 */
function surfaceFill(
  status: ToothStatus,
  surfaces: string | undefined,
  surface: ToothSurface,
): string {
  if (status === 'HEALTHY') return SURFACE_UNMARKED;

  const marked = parseSurfaces(surfaces);
  if (WHOLE_TOOTH_STATUSES.includes(status) || marked.length === 0) return STATUS_HUE[status];
  return marked.includes(surface) ? STATUS_HUE[status] : SURFACE_UNMARKED;
}

export function DentalChart({
  patientId,
  records,
  numbering = 'FDI',
  showPrimary: initialShowPrimary = false,
  readOnly = false,
  canPlan = false,
}: {
  patientId: string;
  records: ToothRecordMap;
  /** Which numbering the practice reads. Storage is always FDI. */
  numbering?: ToothNumbering;
  /** Start with the primary arches open — set for a patient young enough. */
  showPrimary?: boolean;
  /** A locum can study the chart; only clinical staff may change it. */
  readOnly?: boolean;
  /** Whether finding decay may go straight onto the treatment plan. */
  canPlan?: boolean;
}) {
  const t = useTranslations('teeth');
  const tc = useTranslations('common');
  const tp = useTranslations('plans');
  const uid = useId();

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<number | null>(null);
  /** The tooth the findings list is pointing at, ringed on the arch. Reading a
   *  row and then hunting for "24" along thirty-two teeth is the hunt the
   *  odontogram exists to remove. */
  const [highlight, setHighlight] = useState<number | null>(null);
  /** Set when the record was opened by clicking a segment rather than the tooth. */
  const [focusSurface, setFocusSurface] = useState<ToothSurface | null>(null);
  const [state, formAction] = useActionState(saveToothRecord, IDLE_STATE);
  const handledTs = useRef<number | undefined>(undefined);

  /** What the tooth was before this edit — the offer below turns on the change. */
  const [openedAs, setOpenedAs] = useState<ToothStatus>(DEFAULT_TOOTH_STATUS);
  /** The tooth whose decay is waiting to be planned, once one has been found. */
  const [offerFor, setOfferFor] = useState<number | null>(null);
  const [planState, planFormAction] = useActionState(planStepForTooth, IDLE_STATE);
  const handledPlanTs = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (state.status !== 'ok' || state.ts === handledTs.current) return;
    handledTs.current = state.ts;

    // Decay found is the one moment the next action is not in doubt: somebody
    // has to fill it. So the dialog stays open and offers the step rather than
    // closing onto a chart that has recorded the problem and planned nothing.
    //
    // Only on the way *into* caries — re-saving a note on a tooth already marked
    // would ask again every time, and an offer that nags is one that gets
    // dismissed without being read.
    if (canPlan && selected !== null && status === 'CARIES' && openedAs !== 'CARIES') {
      setOfferFor(selected);
      return;
    }
    dialogRef.current?.close();
    // Keyed on the save landing, not on the form: the `handledTs` guard already
    // makes this run once per result, and the rest is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    if (planState.status !== 'ok' || planState.ts === handledPlanTs.current) return;
    handledPlanTs.current = planState.ts;
    dialogRef.current?.close();
  }, [planState]);

  // Which status is chosen decides whether surfaces make sense at all.
  const [status, setStatus] = useState<ToothStatus>(DEFAULT_TOOTH_STATUS);

  function openTooth(toothNum: number, surface: ToothSurface | null = null) {
    if (readOnly && surface !== null) return;

    const recorded = statusOf(records, toothNum);
    // Naming a surface on a tooth whose status has none is a contradiction, and
    // the surface list is hidden for those statuses — so the click would vanish.
    // Clicking a segment says the finding is on that face, and caries is far and
    // away the most common reason to say so. It is a starting position, not a
    // decision: the radio is right there.
    const opening =
      surface !== null && WHOLE_TOOTH_STATUSES.includes(recorded) ? 'CARIES' : recorded;

    setSelected(toothNum);
    setFocusSurface(surface);
    setStatus(opening);
    setOpenedAs(recorded);
    setOfferFor(null);
    dialogRef.current?.showModal();
  }

  // Primary teeth are hidden rather than absent: twenty empty milk teeth on an
  // adult chart is noise, and a child's chart is unusable without them. Anything
  // already recorded on one forces them open.
  const [showPrimary, setShowPrimary] = useState(
    initialShowPrimary ||
      [
        ...PRIMARY_UPPER_RIGHT,
        ...PRIMARY_UPPER_LEFT,
        ...PRIMARY_LOWER_RIGHT,
        ...PRIMARY_LOWER_LEFT,
      ].some((n) => records[n] && records[n].status !== DEFAULT_TOOTH_STATUS),
  );

  const surfacesApply = !WHOLE_TOOTH_STATUSES.includes(status);
  const current = selected === null ? null : records[selected];
  const label = (n: number) => toothLabelFor(n, numbering);

  // What the caries and filling thumbnails should show. The surface being
  // recorded if there is one, so the picture the dentist is choosing between is
  // a picture of *their* finding rather than a generic one.
  const previewSurfaces: ToothSurface[] = focusSurface
    ? [focusSurface]
    : parseSurfaces(current?.surfaces).length > 0
      ? parseSurfaces(current?.surfaces)
      : ['O'];

  const rowProps = {
    records,
    readOnly,
    onSelect: openTooth,
    highlight,
    numberLabel: label,
    toothLabel: (n: number) => t('tooth', { num: label(n) }),
  };

  return (
    // Measured against this box rather than the window: how much room the chart
    // actually has depends on the sidebar and on the shell's padding, both of
    // which change at their own breakpoints, so a viewport width is the wrong
    // question to ask.
    <div className="@container space-y-6">
      <ToothDefs />
      <p className="text-[1.02rem] text-ink-soft">{t('subtitle')}</p>

      {/* The arches and the written record of them, side by side — but only
          past the width where both fit whole. A permanent chart is two 24rem
          quadrants and cannot shrink; with this panel at 18rem and a 1.5rem
          gap the pair needs 68rem, and under that the panel goes beneath the
          chart instead — the same information in one column. In rem, not
          pixels, because the chart is measured in rem too: at a larger root
          size both grow and the threshold has to grow with them.

          Splitting sooner would buy the panel its place by turning the
          odontogram into something you scroll, which is a bad trade — on this
          screen the drawing is the interface. */}
      <div className="grid gap-6 @min-[68rem]:grid-cols-[minmax(0,1fr)_18rem] @min-[68rem]:items-start">
        <div className="min-w-0 space-y-6">
          <div className="overflow-x-auto pb-2">
            {/* Sized to its contents rather than the viewport, so the arches keep
                their proportions and the page scrolls instead of the chart
                squashing — a compressed odontogram is an unreadable one. */}
            <div className="w-max">
              <div className="flex justify-between px-1 pb-1">
                <span className="text-[0.85rem] font-bold text-ink-faint">{t('right')}</span>
                <span className="text-[0.85rem] font-bold text-ink-faint">{t('left')}</span>
              </div>

              {/* The upper arch's bottom edge and the midline are the same cyan,
                  and cross at the centre of the mouth — the reference point every
                  other tooth on the chart is read against. */}
              <div className="border-b-2 border-cyan-400 pb-2">
                <ArchRow upper right={PERMANENT_UPPER_RIGHT} left={PERMANENT_UPPER_LEFT} {...rowProps} />
                {showPrimary ? (
                  <ArchRow upper primary right={PRIMARY_UPPER_RIGHT} left={PRIMARY_UPPER_LEFT} {...rowProps} />
                ) : null}
              </div>

              <div className="pt-2">
                {showPrimary ? (
                  <ArchRow primary right={PRIMARY_LOWER_RIGHT} left={PRIMARY_LOWER_LEFT} {...rowProps} />
                ) : null}
                <ArchRow right={PERMANENT_LOWER_RIGHT} left={PERMANENT_LOWER_LEFT} {...rowProps} />
              </div>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            aria-expanded={showPrimary}
            onClick={() => setShowPrimary((open) => !open)}
          >
            {showPrimary ? t('hidePrimary') : t('showPrimary')}
          </button>

          {/* The legend draws the same molar in each state rather than a lettered
              square. A key whose swatches look nothing like the thing they label
              is a second notation to learn; this one is just the chart, smaller. */}
          <div className="rounded-lg border border-line bg-paper px-4 py-3">
            <p className="mb-2 text-[0.9rem] font-bold text-ink-faint uppercase">{t('legend')}</p>
            <ul className="grid grid-cols-4 gap-x-3 gap-y-2 sm:grid-cols-8">
              {TOOTH_STATUSES.map((status) => (
                <li key={status} className="flex flex-col items-center gap-0.5 text-center">
                  <span aria-hidden className="h-16 w-9">
                    <ToothGlyph
                      toothNum={LEGEND_TOOTH}
                      status={status}
                      surfaces={status === 'CARIES' || status === 'FILLED' ? ['O'] : []}
                    />
                  </span>
                  <span className="text-[0.82rem] leading-tight font-semibold text-ink">
                    {t(`status_${status}`)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <ChartFindings
          records={records}
          numberLabel={label}
          onSelect={(toothNum) => openTooth(toothNum)}
          onPoint={setHighlight}
        />
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby={`${uid}-title`}
        className="m-auto w-[min(92vw,32rem)] rounded-[var(--radius-card)] border border-line bg-surface p-0 text-ink shadow-pop"
        onClose={() => {
          setSelected(null);
          setFocusSurface(null);
          setOfferFor(null);
        }}
      >
        {selected === null ? null : (
          <>
            <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
              <h2 id={`${uid}-title`} className="text-xl font-bold">
                {t('tooth', { num: label(selected) })}
              </h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-label={tc('close')}
                onClick={() => dialogRef.current?.close()}
              >
                <X size={20} aria-hidden />
              </button>
            </header>

            {offerFor !== null ? (
              // Keyed so the suggested wording comes back fresh for each tooth
              // rather than carrying the last one's edit across.
              <form action={planFormAction} key={`offer-${offerFor}`}>
                <div className="space-y-4 px-5 py-5">
                  <input type="hidden" name="patientId" value={patientId} />
                  <input type="hidden" name="toothNum" value={offerFor} />

                  <p className="flex items-start gap-2.5 rounded-lg border border-brand bg-brand-soft px-3.5 py-3 text-brand-deep">
                    <ClipboardList size={20} aria-hidden className="mt-0.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block font-bold">{tp('chartOfferTitle')}</span>
                      <span className="block text-[0.95rem]">
                        {tp('chartOfferBody', { tooth: label(offerFor) })}
                      </span>
                    </span>
                  </p>

                  <div>
                    <label className="field-label" htmlFor={`${uid}-step`}>
                      {tp('stepTitle')}
                    </label>
                    {/* Prefilled with the treatment decay actually gets, so the
                        common case is one press — and editable, because the
                        common case is not the only one. */}
                    <input
                      id={`${uid}-step`}
                      name="title"
                      className="field-input"
                      defaultValue={tp('chartSuggestion')}
                      maxLength={180}
                      required
                    />
                  </div>

                  {planState.status === 'error' ? (
                    <p
                      role="alert"
                      className="rounded-lg border border-danger bg-danger-soft px-3 py-2 font-semibold text-danger"
                    >
                      {planState.message}
                    </p>
                  ) : null}
                </div>

                <footer className="flex items-center justify-end gap-3 border-t border-line px-5 py-4">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => dialogRef.current?.close()}
                  >
                    {tp('notNow')}
                  </button>
                  <SubmitButton label={tp('addToPlan')} pendingLabel={tc('saving')} />
                </footer>
              </form>
            ) : readOnly ? (
              <>
                <div className="space-y-4 px-5 py-5">
                  <div>
                    <p className="field-label">{t('condition')}</p>
                    <p className="text-[1.05rem] font-semibold text-ink">
                      {t(`status_${statusOf(records, selected)}`)}
                    </p>
                  </div>
                  <div>
                    <p className="field-label">{t('notes')}</p>
                    <p
                      className={cn(
                        'text-[1.02rem] whitespace-pre-line',
                        current?.notes ? 'text-ink' : 'text-ink-faint',
                      )}
                    >
                      {current?.notes || tc('none')}
                    </p>
                  </div>
                </div>

                <footer className="flex items-center justify-end border-t border-line px-5 py-4">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => dialogRef.current?.close()}
                  >
                    {tc('close')}
                  </button>
                </footer>
              </>
            ) : (
              // Keyed so the uncontrolled radios and checkboxes remount when a
              // different tooth — or the same tooth by a different surface — is
              // opened. Without it the previous tooth's ticks stay on screen.
              <form action={formAction} key={`${selected}-${focusSurface ?? ''}`}>
                <div className="space-y-4 px-5 py-5">
                  <input type="hidden" name="patientId" value={patientId} />
                  <input type="hidden" name="toothNum" value={selected} />

                  {/* The choice is made on a picture of the outcome: each option
                      draws *this* tooth as it would look once the condition is
                      recorded, so picking one is recognition rather than reading
                      eight labels and translating each into a mental image. */}
                  <fieldset>
                    <legend className="field-label">{t('condition')}</legend>
                    <div className="grid grid-cols-4 gap-2">
                      {TOOTH_STATUSES.map((option) => (
                        <label
                          key={option}
                          className={cn(
                            'flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-line-strong px-1 py-2',
                            'text-center text-[0.82rem] leading-tight font-semibold hover:border-ink',
                            'has-checked:border-brand has-checked:bg-brand-soft has-checked:text-brand-deep',
                          )}
                        >
                          <input
                            type="radio"
                            name="status"
                            value={option}
                            defaultChecked={status === option}
                            onChange={() => setStatus(option)}
                            className="sr-only"
                          />
                          <span aria-hidden className="h-16 w-9">
                            <ToothGlyph
                              toothNum={selected}
                              status={option}
                              surfaces={
                                option === 'CARIES' || option === 'FILLED'
                                  ? previewSurfaces
                                  : []
                              }
                            />
                          </span>
                          {t(`status_${option}`)}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  {/* "Caries on 14" is a note; "caries on the distal-occlusal of
                      14" is a treatment plan. Hidden for the statuses where a
                      surface makes no sense — a missing tooth has none.

                      These are also the accessible form of the target above: it
                      is a mouse shortcut and hidden from assistive technology,
                      so the same five surfaces have to be reachable here. */}
                  {surfacesApply ? (
                    <fieldset>
                      <legend className="field-label">{t('surfaces')}</legend>
                      <div className="flex flex-wrap gap-2">
                        {TOOTH_SURFACES.map((surface) => (
                          <label
                            key={surface}
                            className={cn(
                              'flex cursor-pointer items-center gap-2 rounded-lg border border-line-strong px-3 py-2',
                              'text-[0.92rem] font-semibold hover:border-ink',
                              'has-checked:border-brand has-checked:bg-brand-soft has-checked:text-brand-deep',
                            )}
                          >
                            <input
                              type="checkbox"
                              name="surfaces"
                              value={surface}
                              defaultChecked={
                                surface === focusSurface ||
                                parseSurfaces(current?.surfaces).includes(surface)
                              }
                              className="sr-only"
                            />
                            <span aria-hidden className="font-bold">
                              {surface}
                            </span>
                            {surface === 'O'
                              ? t(isAnterior(selected) ? 'surface_I' : 'surface_O')
                              : t(`surface_${surface}`)}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}

                  <div>
                    <label className="field-label" htmlFor={`${uid}-notes`}>
                      {t('notes')}
                      <span className="ml-1.5 font-normal text-ink-faint">({tc('optional')})</span>
                    </label>
                    <textarea
                      id={`${uid}-notes`}
                      name="notes"
                      rows={3}
                      className="field-input min-h-20 resize-y"
                      defaultValue={current?.notes ?? ''}
                    />
                  </div>

                  {state.status === 'error' ? (
                    <p
                      role="alert"
                      className="rounded-lg border border-danger bg-danger-soft px-3 py-2 font-semibold text-danger"
                    >
                      {state.message}
                    </p>
                  ) : null}
                </div>

                <footer className="flex items-center justify-end gap-3 border-t border-line px-5 py-4">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => dialogRef.current?.close()}
                  >
                    {tc('cancel')}
                  </button>
                  <SubmitButton label={tc('save')} pendingLabel={tc('saving')} />
                </footer>
              </form>
            )}
          </>
        )}
      </dialog>
    </div>
  );
}

/**
 * The chart in words: every tooth that is not plain healthy, written out.
 *
 * The drawing answers "which tooth and what colour" at a glance and nothing
 * else. Everything else the practice recorded — which faces, the note typed
 * while looking in the mouth, the day it was charted — was reachable only by
 * clicking each tooth in turn, which is thirty-two clicks to find out whether
 * anything was written down. Under the chart there was a single line saying how
 * many teeth were flagged.
 *
 * So the same records are listed beside the arches, in the order the rows read:
 * upper right to upper left, then the lower arch, then the milk teeth. Each row
 * names the tooth the way it gets *said* — "upper right first molar" — because
 * the number is the notation and the name is what gets checked against the
 * mouth. Pointing at a row rings the tooth on the chart; pressing it opens the
 * same record the tooth does, so the list is a way into the chart rather than a
 * second copy of it.
 *
 * A tooth charted healthy but carrying a note is listed too: that note is
 * invisible on the drawing apart from one grey dot, and "watch the fissure on
 * 36" is exactly the kind of thing written once and never seen again.
 */
function ChartFindings({
  records,
  numberLabel,
  onSelect,
  onPoint,
}: {
  records: ToothRecordMap;
  numberLabel: (toothNum: number) => string;
  onSelect: (toothNum: number) => void;
  /** Ring this tooth on the arch, or clear the ring with null. */
  onPoint: (toothNum: number | null) => void;
}) {
  const t = useTranslations('teeth');

  const findings = ALL_TEETH.map((toothNum) => ({
    toothNum,
    status: statusOf(records, toothNum),
    surfaces: parseSurfaces(records[toothNum]?.surfaces),
    notes: records[toothNum]?.notes ?? '',
    chartedOn: records[toothNum]?.chartedOn ?? '',
  })).filter((finding) => finding.status !== DEFAULT_TOOTH_STATUS || finding.notes !== '');

  const flagged = findings.filter((finding) => finding.status !== DEFAULT_TOOTH_STATUS);

  // Counted in the order the statuses are declared, which is roughly worst
  // first — a tally that reshuffles itself as teeth are charted is one nobody
  // can read twice.
  const tally = TOOTH_STATUSES.filter((status) => status !== DEFAULT_TOOTH_STATUS)
    .map((status) => ({ status, count: flagged.filter((f) => f.status === status).length }))
    .filter((row) => row.count > 0);

  return (
    <aside className="overflow-hidden rounded-lg border border-line bg-paper @min-[68rem]:sticky @min-[68rem]:top-4">
      <div className="border-b border-line px-4 py-3">
        <p className="flex items-center gap-2 text-[0.9rem] font-bold text-ink-faint uppercase">
          <Stethoscope size={17} aria-hidden />
          {t('findings')}
        </p>
        <p className="mt-1 font-semibold text-ink-soft">
          {t('summary', { count: flagged.length })}
        </p>

        {tally.length > 0 ? (
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {tally.map(({ status, count }) => (
              <li
                key={status}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-[0.82rem] font-bold',
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
        <p className="px-4 py-6 text-center text-[0.98rem] text-ink-faint">
          {t('findingsEmpty')}
        </p>
      ) : (
        <ul className="max-h-[34rem] space-y-2 overflow-y-auto p-3">
          {findings.map((finding) => {
            const kind = toothKind(finding.toothNum);
            return (
              <li key={finding.toothNum}>
                <button
                  type="button"
                  onClick={() => onSelect(finding.toothNum)}
                  onMouseEnter={() => onPoint(finding.toothNum)}
                  onMouseLeave={() => onPoint(null)}
                  onFocus={() => onPoint(finding.toothNum)}
                  onBlur={() => onPoint(null)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-lg border border-line-strong bg-surface px-3 py-2.5',
                    'text-left transition-colors hover:border-ink',
                  )}
                >
                  <span aria-hidden className="h-14 w-8 shrink-0">
                    <ToothGlyph
                      toothNum={finding.toothNum}
                      status={finding.status}
                      surfaces={finding.surfaces}
                    />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[1.05rem] leading-tight font-bold text-ink tabular-nums">
                        {numberLabel(finding.toothNum)}
                      </span>
                      <span
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-[0.78rem] font-bold',
                          TOOTH_STATUS_STYLE[finding.status].swatch,
                        )}
                      >
                        {t(`status_${finding.status}`)}
                      </span>
                    </span>

                    <span className="mt-0.5 block text-[0.88rem] leading-snug text-ink-soft">
                      {t(`quadrant_${quadrantOf(finding.toothNum)}`)}
                      {kind ? ` · ${t(`name_${kind}`)}` : ''}
                      {dentitionOf(finding.toothNum) === 'PRIMARY' ? ` · ${t('primaryTooth')}` : ''}
                    </span>

                    {/* The letters are how the finding is written down and the
                        words are how it is checked — "MOD" is unreadable to
                        anyone outside the surgery, and the names alone are too
                        long to scan. */}
                    {finding.surfaces.length > 0 ? (
                      <span className="mt-1 block text-[0.88rem] leading-snug text-ink">
                        <span className="font-bold tracking-wide">
                          {finding.surfaces.join('')}
                        </span>
                        <span className="text-ink-soft">
                          {' — '}
                          {finding.surfaces
                            .map((surface) =>
                              surface === 'O'
                                ? t(isAnterior(finding.toothNum) ? 'surface_I' : 'surface_O')
                                : t(`surface_${surface}`),
                            )
                            .join(', ')}
                        </span>
                      </span>
                    ) : null}

                    {finding.notes ? (
                      <span className="mt-1 block line-clamp-3 text-[0.92rem] leading-snug whitespace-pre-line text-ink">
                        {finding.notes}
                      </span>
                    ) : null}

                    {finding.chartedOn ? (
                      <span className="mt-1 block text-[0.8rem] text-ink-faint">
                        {t('chartedOn', { date: finding.chartedOn })}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

/**
 * One arch: two quadrants either side of the midline. The right-hand quadrant is
 * packed against the midline and the left-hand one away from it, so a five-tooth
 * primary row still meets the permanent row's centre line exactly.
 */
function ArchRow({
  right,
  left,
  upper = false,
  primary = false,
  ...cell
}: {
  right: number[];
  left: number[];
  upper?: boolean;
  primary?: boolean;
} & Omit<ToothCellProps, 'toothNum' | 'upper' | 'primary'>) {
  return (
    <div className="flex items-stretch">
      <div className={cn(HALF, 'flex justify-end')}>
        {right.map((toothNum) => (
          <ToothCell key={toothNum} toothNum={toothNum} upper={upper} primary={primary} {...cell} />
        ))}
      </div>

      <div className="w-0.5 shrink-0 bg-cyan-400" role="presentation" />

      <div className={cn(HALF, 'flex justify-start')}>
        {left.map((toothNum) => (
          <ToothCell key={toothNum} toothNum={toothNum} upper={upper} primary={primary} {...cell} />
        ))}
      </div>
    </div>
  );
}

type ToothCellProps = {
  toothNum: number;
  records: ToothRecordMap;
  readOnly: boolean;
  /** Crown down, root up — and the number sits beneath the target. */
  upper?: boolean;
  primary?: boolean;
  onSelect: (toothNum: number, surface?: ToothSurface | null) => void;
  /** The tooth the findings list is pointing at, if it is this one. */
  highlight?: number | null;
  /** FDI or Universal, whichever the practice reads. */
  numberLabel: (toothNum: number) => string;
  toothLabel: (toothNum: number) => string;
};

function ToothCell({
  toothNum,
  records,
  readOnly,
  upper = false,
  primary = false,
  onSelect,
  highlight = null,
  numberLabel,
  toothLabel,
}: ToothCellProps) {
  const record = records[toothNum];
  const status = statusOf(records, toothNum);
  const style = TOOTH_STATUS_STYLE[status];
  const marked = parseSurfaces(record?.surfaces);

  const glyph = (
    <button
      type="button"
      onClick={() => onSelect(toothNum)}
      aria-label={toothLabel(toothNum)}
      className={cn(
        // A tooth is a long thin thing, so the glyph is given height rather
        // than width — it is the only dimension that makes the drawing bigger.
        'relative block w-full rounded-md transition-colors hover:bg-brand-soft/60',
        primary ? 'h-14' : 'h-20',
      )}
    >
      <ToothGlyph toothNum={toothNum} status={status} surfaces={marked} />
      {record?.notes ? (
        <span aria-hidden className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-ink-faint" />
      ) : null}
    </button>
  );

  const target = (
    <div className="mx-auto h-9 w-9">
      <SurfaceTarget
        toothNum={toothNum}
        readOnly={readOnly}
        fillOf={(surface) => surfaceFill(status, record?.surfaces, surface)}
        onSurfaceClick={(surface) => onSelect(toothNum, surface)}
      />
    </div>
  );

  // The status letter rides with the number so the condition never depends on
  // colour alone — the same reason the legend carries one.
  const number = (
    <span
      className={cn(
        'block text-center text-[0.85rem] leading-5 font-bold tabular-nums',
        status === 'HEALTHY' ? 'text-ink-faint' : 'text-ink',
      )}
    >
      {numberLabel(toothNum)}
      {style.short ? (
        <span aria-hidden className="ml-0.5 text-[0.7rem] opacity-80">
          {style.short}
        </span>
      ) : null}
    </span>
  );

  return (
    <div
      className={cn(
        CELL,
        'flex flex-col gap-1 rounded-md px-0.5 py-0.5',
        highlight === toothNum && 'bg-brand-soft ring-2 ring-brand',
      )}
    >
      {upper ? (
        <>
          {glyph}
          {target}
          {number}
        </>
      ) : (
        <>
          {number}
          {target}
          {glyph}
        </>
      )}
    </div>
  );
}
