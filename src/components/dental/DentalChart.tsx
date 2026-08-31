'use client';

import { Activity, ClipboardList, Droplet, Stethoscope, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useId, useRef, useState, useTransition } from 'react';
import { ConditionPalette } from '@/components/dental/ConditionPalette';
import { PerioFields } from '@/components/dental/PerioFields';
import { PerioStrip } from '@/components/dental/PerioStrip';
import { SurfaceTarget } from '@/components/dental/SurfaceTarget';
import { ToothDefs } from '@/components/dental/ToothDefsProvider';
import { ToothGlyph } from '@/components/dental/ToothGlyph';
import { TOOTH_PHOTOS, ToothPhoto } from '@/components/dental/ToothPhoto';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { saveToothPerio, saveToothRecord, setToothCondition } from '@/lib/actions/patients';
import { planStepForTooth } from '@/lib/actions/plans';
import { IDLE_STATE } from '@/lib/actions/types';
import {
  MOBILITY_LABEL,
  PERIO_SITES,
  perioOverview,
  perioSummaryOf,
  type PerioSummary,
} from '@/lib/perio';
import {
  ALL_TEETH,
  applyCondition,
  DEFAULT_TOOTH_STATUS,
  HEALTHY_TOOTH,
  PERMANENT_LOWER_LEFT,
  PERMANENT_LOWER_RIGHT,
  PERMANENT_UPPER_LEFT,
  PERMANENT_UPPER_RIGHT,
  PRIMARY_LOWER_LEFT,
  PRIMARY_LOWER_RIGHT,
  PRIMARY_UPPER_LEFT,
  PRIMARY_UPPER_RIGHT,
  statusTakesSurfaces,
  surfaceFill,
  TOOTH_STATUSES,
  TOOTH_STATUS_STYLE,
  TOOTH_SURFACES,
  dentitionOf,
  isAnterior,
  isRightSide,
  isUpperArch,
  parseSurfaces,
  quadrantOf,
  toothKind,
  toothLabel as toothLabelFor,
  type ToothCondition,
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
 * Two things are being recorded here, and they are two examinations rather than
 * one, so the chart has two views of the same arches:
 *
 *   **Gjendja**      what is wrong with the tooth — caries, fillings, crowns,
 *                    what is missing. Charted by looking.
 *   **Periodonti**   what is wrong with the hold on it — pocket depths at six
 *                    sites, which of them bled, how far the tooth moves.
 *                    Charted with a probe, often by a different person.
 *
 * The second one is not decoration. A tooth can be flawless enamel and still be
 * leaving, and a chart that only draws the crown will call it healthy right up
 * until it is extracted.
 *
 * Recording is built for the pace it actually happens at. Holding a condition
 * from the palette turns every click into a record, because charting a mouth is
 * thirty-two findings in a row and a dialog apiece made this screen lose to
 * paper. The dialog is still the first tool on the palette, for the times a
 * note has to be typed rather than a colour applied — and it is what a click
 * does when no tool is held, which is where the chart starts.
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
    /** Miller grade, or null for a tooth nobody has pressed. See `perio.ts`. */
    mobility?: number | null;
    /** Six probe depths, comma-separated. */
    pockets?: string | null;
    /** Which of those six bled, as a six-character mask. */
    bleeding?: string | null;
  }
>;

/** Which examination the arches are showing. */
const CHART_VIEWS = ['CONDITION', 'PERIO'] as const;
type ChartView = (typeof CHART_VIEWS)[number];

/** An upper first molar — three roots and a full cusp pattern, so every state
 *  the legend has to show is legible on it. */
const LEGEND_TOOTH = 16;

/**
 * One tooth is one cell wide on every row, so the arches stay in column.
 *
 * The width itself lives in `--tooth-col` (`globals.css`, on `.odontogram`),
 * and everything the arch is made of is derived from it: the quadrant is eight
 * of these, the glyph box is one of these over the drawing's own aspect ratio.
 * Three numbers that must agree, expressed once.
 *
 * That is not tidiness. `HALF` used to be a second hand-written constant that
 * happened to equal eight cells, and nothing enforced it or could show it
 * broken: both halves are `shrink-0` inside a `w-max` wrapper, so a `HALF`
 * narrower than its cells overflows the *inline-start* edge — which a scroll
 * container cannot scroll to — and the far molars are simply gone. Deriving it
 * also gives print somewhere to stand: one variable to turn down, and the whole
 * arch comes with it.
 *
 * The value is a good deal wider than it was. The drawing is modelled down to
 * growth lines in the enamel and the shadow in a molar's furcation, and at the
 * old size none of that survived — a tooth came out about thirty pixels across,
 * and every bit of the modelling collapsed into a beige smudge. Detail that
 * cannot be seen is not detail, it is cost.
 */
const CELL = 'w-(--tooth-col) shrink-0';
/** Eight cells — a full permanent quadrant, and the width the shorter primary
 *  quadrants are padded to so every midline on the page lines up. */
const HALF = 'w-[calc(var(--tooth-col)*8)] shrink-0';

/** Deep enough that one wrong click never costs an examination, short enough
 *  that the stack is not a second copy of the chart's history. */
const UNDO_DEPTH = 50;

/** One step back: which tooth, and what it was before. Carries its own id
 *  because a write that fails has to find the step it pushed among however many
 *  have been pushed on that tooth since. */
type UndoEntry = { id: number; toothNum: number; before: ToothCondition };

function statusOf(records: ToothRecordMap, toothNum: number): ToothStatus {
  const raw = records[toothNum]?.status;
  return raw && (TOOTH_STATUSES as readonly string[]).includes(raw)
    ? (raw as ToothStatus)
    : DEFAULT_TOOTH_STATUS;
}

function storedCondition(records: ToothRecordMap, toothNum: number): ToothCondition {
  return { status: statusOf(records, toothNum), surfaces: records[toothNum]?.surfaces ?? '' };
}

/**
 * The widest file in the photographed set, which is a first molar.
 *
 * Every plate is sized as a fraction of this rather than fitted to its own box,
 * because the sixteen files came off one poster at one scale — so a molar really
 * is twice the width of a lower incisor, and laying them out by width is what
 * keeps that true. Fit each tooth to a fixed box instead and an incisor comes
 * out molar-sized, which is the single loudest tell that a picture of a tooth
 * was drawn rather than observed. Computed rather than written down, for the
 * reason `DentalArch` gives: replace the artwork and this follows it.
 */
const WIDEST_PHOTO = Math.max(
  ...[...Object.values(TOOTH_PHOTOS.upper), ...Object.values(TOOTH_PHOTOS.lower)].map(
    (photo) => photo.width,
  ),
);

/**
 * A photograph of the open tooth, on the plate at the top of its dialog.
 *
 * This is the one place in the chart where a photograph is the right instrument
 * and the drawing is not, and the two are doing different jobs three inches
 * apart. `ToothGlyph` is what the chart is made of because it renders a tooth
 * *in the state a finding leaves it in* — the eight thumbnails in the condition
 * picker below are that same drawing, once per status. None of them is a picture
 * of the tooth itself, and at one column wide none of them could be: the
 * odontogram gives a tooth about 68px and the printed sheet about 38px, which is
 * why the drawing is modelled for that size and the stock artwork is not.
 *
 * The dialog is the first place in this app with room for the other thing. At
 * about 135px the photograph is doing what it is good at — reading as an
 * object rather than a diagram — and none of the reasons it cannot be the chart
 * apply here, because nothing is recorded on it: no surfaces, no status, no hit
 * target, nothing to mark. It says "this is the tooth you have open", and that
 * is the one job it does better than the drawing.
 *
 * **Permanent teeth only, and deliberately no fallback.** The poster never drew
 * the twenty primary teeth (`ToothPhoto` has the detail), and `toothKind` will
 * happily call 55 a first molar — so without the dentition guard a child's chart
 * would show an adult molar standing in for a milk one. Falling back to the
 * drawn glyph was the other option and is worse: one slot holding a photograph
 * for this patient and a drawing for the next reads as a rendering fault, and
 * the drawing is already on screen eight times immediately below. A baby tooth
 * gets a plate with no picture on it, which is honest about what is on disk.
 *
 * Hidden from assistive technology by `ToothPhoto`'s own default: the heading
 * beside it already says which tooth this is, so a second announcement is noise.
 */
function PlateTooth({ toothNum }: { toothNum: number }) {
  const kind = toothKind(toothNum);
  if (!kind || dentitionOf(toothNum) !== 'PERMANENT') return null;

  const arch = isUpperArch(toothNum) ? 'upper' : 'lower';
  const photo = TOOTH_PHOTOS[arch][kind];

  return (
    /* 4.5rem, chosen against the alternatives rather than picked. At 6rem the
       molar is 177px and crowds both edges of the plate — the tooth stops being
       an illustration in a header and becomes a poster with a heading beside
       it. At 3.5rem the photograph is small enough that the drawn glyph would
       have done the job, which defeats the point of being here at all. This
       lands the molar at about 133px and the incisor at 144: comfortably twice
       what the odontogram gives a tooth, three times what the printed sheet
       does, and still a header. */
    <span className="flex w-[4.5rem] shrink-0 justify-center self-center">
      {/* Sized by width, never by height. The poster draws every tooth to
          nearly one length — 1.09x longest over shortest, where a real set is
          1.63x — so heights here come out within about a tenth of each other
          whatever the tooth, and the plate keeps a steady weight across the
          arch. Size by height instead and that same flaw makes a third molar
          and a lower incisor the same object. */}
      <span className="block" style={{ width: `${(photo.width / WIDEST_PHOTO) * 100}%` }}>
        <ToothPhoto
          kind={kind}
          arch={arch}
          side={isRightSide(toothNum) ? 'right' : 'left'}
          className="w-full"
        />
      </span>
    </span>
  );
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

  /** Which examination the arches are drawing, and which half of the dialog
   *  opens with them. */
  const [view, setView] = useState<ChartView>('CONDITION');
  const [dialogTab, setDialogTab] = useState<ChartView>('CONDITION');

  const [perioState, perioFormAction] = useActionState(saveToothPerio, IDLE_STATE);
  const handledPerioTs = useRef<number | undefined>(undefined);

  /** What the tooth was before this edit — the offer below turns on the change. */
  const [openedAs, setOpenedAs] = useState<ToothStatus>(DEFAULT_TOOTH_STATUS);
  /** The tooth whose decay is waiting to be planned, once one has been found. */
  const [offerFor, setOfferFor] = useState<number | null>(null);
  const [planState, planFormAction] = useActionState(planStepForTooth, IDLE_STATE);
  const handledPlanTs = useRef<number | undefined>(undefined);

  /* ---------------------------------------------------------------- *
   * Marking with a held tool
   * ---------------------------------------------------------------- */

  /** The condition being applied on click, or null when a click opens the record. */
  const [tool, setTool] = useState<ToothStatus | null>(null);
  /**
   * Teeth changed since the last server render, so the drawing answers the
   * click rather than the round trip. Marking is done at the speed of speech
   * and a chart that lags a save behind is one that gets clicked twice.
   */
  const [pending, setPending] = useState<Record<number, ToothCondition>>({});
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [markError, setMarkError] = useState<string | null>(null);
  const [, startMarking] = useTransition();
  /** Identifies one pushed step, so a failed write takes back the step *it*
   *  pushed rather than every step ever recorded on that tooth. */
  const undoSeq = useRef(0);

  /**
   * Drop the optimistic entries the server has now confirmed, and keep the ones
   * still in flight.
   *
   * Clearing the whole map on every render would be simpler and would make each
   * mark flicker back to its old colour while the *next* mark's revalidation
   * lands — every write revalidates the entire page, so a fast hand always has
   * more than one outstanding.
   */
  useEffect(() => {
    setPending((current) => {
      const waiting = Object.entries(current).filter(([key, condition]) => {
        const stored = storedCondition(records, Number(key));
        return stored.status !== condition.status || stored.surfaces !== condition.surfaces;
      });
      return waiting.length === Object.keys(current).length ? current : Object.fromEntries(waiting);
    });
  }, [records]);

  /** What the tooth is right now, as far as this screen knows. */
  function conditionOf(toothNum: number): ToothCondition {
    return pending[toothNum] ?? storedCondition(records, toothNum);
  }

  /** Write a resolved condition, keeping the drawing ahead of the round trip. */
  function write(toothNum: number, after: ToothCondition, undoTo: ToothCondition | null) {
    setMarkError(null);
    setPending((current) => ({ ...current, [toothNum]: after }));

    let step: number | null = null;
    if (undoTo !== null) {
      const id = (step = ++undoSeq.current);
      setUndoStack((stack) => [...stack, { id, toothNum, before: undoTo }].slice(-UNDO_DEPTH));
    }

    startMarking(async () => {
      const result = await setToothCondition({
        patientId,
        toothNum,
        status: after.status,
        surfaces: after.surfaces,
      });

      if (result.status === 'error') {
        // Drop the optimistic entry rather than replacing it with the old
        // value: what is on file is whatever the server still has, and falling
        // back to the record is the one answer that cannot be wrong.
        setPending((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([key]) => Number(key) !== toothNum),
          ),
        );
        // Only this write's own step. Filtering by tooth took back every step
        // recorded on it, so one refused mark made the marks before it — which
        // are on file and perfectly undoable — permanently un-undoable.
        setUndoStack((stack) => stack.filter((entry) => entry.id !== step));
        setMarkError(result.message);
      }
    });
  }

  function mark(toothNum: number, surface: ToothSurface | null) {
    if (readOnly || tool === null) return;

    const before = conditionOf(toothNum);
    const after = applyCondition(before, tool, surface);
    // Clicking a face that is already marked with the held tool turns it off,
    // and clicking one that changes nothing should not cost a write.
    if (after.status === before.status && after.surfaces === before.surfaces) return;

    write(toothNum, after, before);
  }

  function undo() {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack((stack) => stack.slice(0, -1));
    write(last.toothNum, last.before, null);
  }

  // Ctrl+Z where a marking tool is held. Bound to the window rather than to the
  // chart because the hand that just clicked a tooth is not on a focused
  // control, and a shortcut that needs the right thing focused first is one
  // nobody reaches for.
  useEffect(() => {
    if (readOnly || view !== 'CONDITION') return;

    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
      // Nothing to take back is not the chart's shortcut to swallow — with an
      // empty stack the keypress belongs to whatever the browser would have
      // done with it.
      if (dialogRef.current?.open || undoStack.length === 0) return;
      event.preventDefault();
      undo();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // Rebound as the stack changes, so `undo` always closes over the current
    // top of it rather than the one that existed when the tool was picked up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, view, undoStack]);

  /* ---------------------------------------------------------------- *
   * The record dialog
   * ---------------------------------------------------------------- */

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
    if (perioState.status !== 'ok' || perioState.ts === handledPerioTs.current) return;
    handledPerioTs.current = perioState.ts;
    dialogRef.current?.close();
  }, [perioState]);

  useEffect(() => {
    if (planState.status !== 'ok' || planState.ts === handledPlanTs.current) return;
    handledPlanTs.current = planState.ts;
    dialogRef.current?.close();
  }, [planState]);

  // Which status is chosen decides whether surfaces make sense at all.
  const [status, setStatus] = useState<ToothStatus>(DEFAULT_TOOTH_STATUS);

  function openTooth(toothNum: number, surface: ToothSurface | null = null) {
    if (readOnly && surface !== null) return;

    const recorded = conditionOf(toothNum).status;
    // Naming a surface on a tooth whose status has none is a contradiction, and
    // the surface list is hidden for those statuses — so the click would vanish.
    // Clicking a segment says the finding is on that face, and caries is far and
    // away the most common reason to say so. It is a starting position, not a
    // decision: the radio is right there.
    const opening = surface !== null && !statusTakesSurfaces(recorded) ? 'CARIES' : recorded;

    setSelected(toothNum);
    setFocusSurface(surface);
    setStatus(opening);
    setOpenedAs(recorded);
    setOfferFor(null);
    // Opened from the periodontal arches, it is the probe readings the hand is
    // reaching for — not the condition it was already looking at.
    setDialogTab(view);
    dialogRef.current?.showModal();
  }

  /** A click on a tooth: mark it where a tool is held, open it where none is. */
  function touch(toothNum: number, surface: ToothSurface | null = null) {
    if (view === 'CONDITION' && tool !== null && !readOnly) {
      mark(toothNum, surface);
      return;
    }
    openTooth(toothNum, surface);
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

  const surfacesApply = statusTakesSurfaces(status);
  const current = selected === null ? null : records[selected];
  const openKind = selected === null ? null : toothKind(selected);
  const label = (n: number) => toothLabelFor(n, numbering);
  const perioOf = (toothNum: number): PerioSummary => perioSummaryOf(records[toothNum] ?? {});

  /**
   * The open tooth as *the screen* knows it, which is one mark ahead of the
   * server while a click is still in flight.
   *
   * The status the dialog opens on already comes from `conditionOf`, so the
   * surfaces have to as well. Reading them off `records` instead meant that
   * marking the distal of 46 and then opening it before the round trip landed
   * showed caries with no face ticked — and saving that wrote the answer back,
   * quietly taking the surface off a finding that had just been recorded.
   */
  const openCondition: ToothCondition = selected === null ? HEALTHY_TOOTH : conditionOf(selected);
  const openSurfaces = parseSurfaces(openCondition.surfaces);

  // What the caries and filling thumbnails should show. The surface being
  // recorded if there is one, so the picture the dentist is choosing between is
  // a picture of *their* finding rather than a generic one.
  const previewSurfaces: ToothSurface[] = focusSurface
    ? [focusSurface]
    : openSurfaces.length > 0
      ? openSurfaces
      : ['O'];

  /**
   * What one status thumbnail draws for *this* tooth.
   *
   * Caries and fillings show a face even where none is named — a finding with
   * no surface still has to be visible. A root canal is drawn from what was
   * actually written down, so its thumbnail shows the ticked faces and nothing
   * when there are none: it may carry surfaces, and the option that promises
   * "this is how the tooth will look" was ignoring them. The rest are
   * whole-tooth states with no face to draw.
   */
  const previewFor = (option: ToothStatus): ToothSurface[] => {
    if (option === 'CARIES' || option === 'FILLED') return previewSurfaces;
    if (!statusTakesSurfaces(option)) return [];
    return focusSurface ? [focusSurface] : openSurfaces;
  };

  /**
   * What the tooth's own button announces.
   *
   * In the periodontal view that has to carry the readings. The strip drawn
   * under the tooth is a picture and is hidden from assistive technology, the
   * same way the surface wheel is — so without this the entire examination is
   * legible only to someone looking at it.
   */
  function announce(toothNum: number): string {
    const name = t('tooth', { num: label(toothNum) });
    if (view !== 'PERIO') return name;

    const perio = perioOf(toothNum);
    if (!perio.recorded) return `${name} — ${t('perioNone')}`;

    return `${name} — ${[
      perio.deepest !== null ? `${t('perioDeepest')} ${perio.deepest}mm` : null,
      perio.bleedingCount > 0
        ? `${t('perioBleeding')}: ${t('perioBleedingCount', { count: perio.bleedingCount })}`
        : null,
      perio.mobility !== null ? `${t('mobility')} ${MOBILITY_LABEL[perio.mobility]}` : null,
    ]
      .filter(Boolean)
      .join(', ')}`;
  }

  const rowProps = {
    view,
    conditionOf,
    perioOf,
    readOnly,
    hasNote: (n: number) => Boolean(records[n]?.notes),
    marking: tool !== null && !readOnly && view === 'CONDITION',
    onSelect: touch,
    highlight,
    numberLabel: label,
    // The biting surface is the occlusal one on a tooth that grinds and the
    // incisal one on a tooth that cuts, which is the same wedge with two names
    // depending on where in the mouth it is.
    surfaceLabel: (toothNum: number, surface: ToothSurface) =>
      surface === 'O'
        ? t(isAnterior(toothNum) ? 'surface_I' : 'surface_O')
        : t(`surface_${surface}`),
    toothLabel: announce,
  };

  return (
    // Measured against this box rather than the window: how much room the chart
    // actually has depends on the sidebar and on the shell's padding, both of
    // which change at their own breakpoints, so a viewport width is the wrong
    // question to ask.
    <div className="odontogram @container space-y-5">
      <ToothDefs />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[1.02rem] text-ink-soft">
          {t(view === 'PERIO' ? 'perioSubtitle' : 'subtitle')}
        </p>

        {/* The two examinations, as two views of the same arches rather than
            two screens. They are read against each other constantly — a 6mm
            pocket on a tooth already crowned is a different conversation from
            one on a sound tooth — and a tab that navigated away would break
            that comparison every time. */}
        <div
          role="group"
          aria-label={t('viewLabel')}
          className="inline-flex rounded-lg border border-line-strong bg-surface p-0.5"
        >
          {CHART_VIEWS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => setView(option)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[0.92rem] font-bold',
                view === option
                  ? 'bg-brand-dark text-white'
                  : 'text-ink-soft hover:bg-brand-soft hover:text-brand-deep',
              )}
            >
              {option === 'PERIO' ? (
                <Activity size={16} aria-hidden />
              ) : (
                <Stethoscope size={16} aria-hidden />
              )}
              {t(`view_${option}`)}
            </button>
          ))}
        </div>
      </div>

      {/* The arches, and the written record of them underneath.
          
          This used to be a two-column split above 68rem, with the panel beside
          the chart. It cannot be any more, and the reason is arithmetic rather
          than taste: the arch is two 34rem quadrants, and 68rem of arch plus an
          18rem panel plus the gap needs 87.5rem of container, where the shell's
          `max-w-6xl` can supply about 69rem. There is no viewport wide enough —
          the cap binds before the window does.

          It was left as a breakpoint at 88rem for a while, which was worse than
          either answer: a condition that cannot fire reads like a layout that
          exists, and the next person to touch it has to redo this arithmetic to
          find out it does not. One column, stated plainly.

          The alternative, if the panel is wanted back alongside, is to let the
          chart page out of the shared measure rather than to shrink the teeth —
          the drawing is the interface on this screen, and squeezing the
          odontogram to buy a side panel its place is the wrong way round. */}
      <div className="grid gap-6">
        <div className="min-w-0 space-y-5">
          {markError !== null ? (
            <p
              role="alert"
              className="rounded-lg border border-danger bg-danger-soft px-3 py-2 font-semibold text-danger"
            >
              {markError}
            </p>
          ) : null}

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
              <div className="border-b-4 border-cyan-400 pb-2">
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

          {view === 'PERIO' ? (
            <PerioLegend />
          ) : readOnly ? (
            // The legend draws the same molar in each state rather than a
            // lettered square. A key whose swatches look nothing like the thing
            // they label is a second notation to learn; this one is just the
            // chart, smaller. Where the chart can be edited the palette *is*
            // this legend, and showing both would be the same key twice.
            <div className="rounded-lg border border-line bg-paper px-4 py-3">
              <p className="mb-2 text-[0.9rem] font-bold text-ink-faint uppercase">{t('legend')}</p>
              <ul className="grid grid-cols-4 gap-x-3 gap-y-2 @min-[40rem]:grid-cols-8">
                {TOOTH_STATUSES.map((option) => (
                  <li key={option} className="flex flex-col items-center gap-0.5 text-center">
                    <span aria-hidden className="h-16 w-9">
                      <ToothGlyph
                        toothNum={LEGEND_TOOTH}
                        status={option}
                        surfaces={option === 'CARIES' || option === 'FILLED' ? ['O'] : []}
                      />
                    </span>
                    <span className="text-[0.82rem] leading-tight font-semibold text-ink">
                      {t(`status_${option}`)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ConditionPalette
              tool={tool}
              onPick={setTool}
              onUndo={undo}
              canUndo={undoStack.length > 0}
            />
          )}
        </div>

        <ChartFindings
          view={view}
          records={records}
          conditionOf={conditionOf}
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
            {/* A plate rather than a title bar, and navy because this artwork
                has no other ground. The teeth are ivory — about #eee7e2 through
                the crowns — and this dialog is white: composited there they very
                nearly vanish, and the shading that survives reads as a smudge.
                `DentalArch` measured that before choosing the same navy for the
                front page, so this is the storefront's answer applied to the one
                block in the app that has the same problem. It is the app's first
                dark panel and the departure is the point: it marks the part of
                this dialog that is a picture of the tooth rather than a control
                on it.

                Rounded here rather than clipped on the dialog — `<dialog>`
                scrolls its own overflow, so `overflow-hidden` up there would
                trap the bottom of a long form. */}
            <header className="flex items-center gap-4 rounded-t-[var(--radius-card)] bg-navy px-5 py-4 text-navy-ink">
              <PlateTooth toothNum={selected} />

              <div className="min-w-0 flex-1">
                <h2 id={`${uid}-title`} className="text-xl font-bold">
                  {t('tooth', { num: label(selected) })}
                </h2>

                {/* The number is what gets stored; the name is what gets said.
                    The findings list already carries this line for the same
                    reason — "16" is a location only to someone who reads FDI,
                    and this dialog is often turned round to face the patient. */}
                <p className="mt-0.5 text-[0.88rem] text-navy-ink-soft">
                  {t(`quadrant_${quadrantOf(selected)}`)}
                  {openKind ? ` · ${t(`name_${openKind}`)}` : ''}
                  {dentitionOf(selected) === 'PRIMARY' ? ` · ${t('primaryTooth')}` : ''}
                </p>
              </div>

              <button
                type="button"
                // The ghost button is drawn for a white ground: on navy its ink
                // is unreadable and its hover border invisible. Same button,
                // navy palette. The focus ring is left alone — brand-dark
                // clears 3:1 against this navy, which is what it has to.
                className="btn btn-ghost btn-sm self-start text-navy-ink-soft hover:border-navy-line hover:text-navy-ink"
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
            ) : (
              <>
                {/* Both examinations of the tooth, behind one heading. They are
                    written at different moments by different hands, so they are
                    two forms and two saves — but they are one tooth, and making
                    the probe readings a separate screen would mean closing the
                    record to answer "and how deep is it round there?". */}
                <div
                  role="group"
                  aria-label={t('viewLabel')}
                  className="flex gap-1 border-b border-line px-5 pt-3"
                >
                  {CHART_VIEWS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={dialogTab === option}
                      onClick={() => setDialogTab(option)}
                      className={cn(
                        '-mb-px border-b-2 px-3 py-2 text-[0.95rem] font-bold',
                        dialogTab === option
                          ? 'border-brand-dark text-brand-deep'
                          : 'border-transparent text-ink-soft hover:text-ink',
                      )}
                    >
                      {t(`view_${option}`)}
                    </button>
                  ))}
                </div>

                {dialogTab === 'PERIO' ? (
                  readOnly ? (
                    <>
                      <div className="px-5 py-5">
                        <PerioReadout summary={perioOf(selected)} toothNum={selected} />
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
                    // Keyed on the tooth so six uncontrolled boxes are remounted
                    // rather than carrying the previous tooth's readings across
                    // — which on this form would be six plausible wrong numbers.
                    <form action={perioFormAction} key={`perio-${selected}`}>
                      <div className="px-5 py-5">
                        <input type="hidden" name="patientId" value={patientId} />
                        <input type="hidden" name="toothNum" value={selected} />
                        <PerioFields toothNum={selected} summary={perioOf(selected)} />

                        {perioState.status === 'error' ? (
                          <p
                            role="alert"
                            className="mt-4 rounded-lg border border-danger bg-danger-soft px-3 py-2 font-semibold text-danger"
                          >
                            {perioState.message}
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
                  )
                ) : readOnly ? (
                  <>
                    <div className="space-y-4 px-5 py-5">
                      <div>
                        <p className="field-label">{t('condition')}</p>
                        <p className="text-[1.05rem] font-semibold text-ink">
                          {t(`status_${openCondition.status}`)}
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
                                  surfaces={previewFor(option)}
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
                                    surface === focusSurface || openSurfaces.includes(surface)
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
          </>
        )}
      </dialog>
    </div>
  );
}

/** The three bands the depth numbers are coloured in, spelled out — the colour
 *  is a second channel over the digits, and a reader has to be told what it
 *  means once. */
function PerioLegend() {
  const t = useTranslations('teeth');

  const bands: { key: string; className: string }[] = [
    { key: 'perioBandHealthy', className: 'bg-ok-soft text-ok' },
    { key: 'perioBandWatch', className: 'bg-warn-soft text-warn' },
    { key: 'perioBandDiseased', className: 'bg-danger-soft text-danger' },
  ];

  return (
    <div className="rounded-lg border border-line bg-paper px-4 py-3">
      <p className="mb-2 text-[0.9rem] font-bold text-ink-faint uppercase">{t('legend')}</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-2">
        {bands.map((band) => (
          <li key={band.key} className="flex items-center gap-2">
            <span className={cn('rounded px-2 py-0.5 text-[0.85rem] font-bold', band.className)}>
              {t(`${band.key}Range`)}
            </span>
            <span className="text-[0.9rem] text-ink">{t(band.key)}</span>
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span className="rounded px-2 py-0.5 text-[0.85rem] font-bold text-ink underline decoration-danger decoration-2 underline-offset-[2px]">
            4
          </span>
          <span className="text-[0.9rem] text-ink">{t('perioBleeding')}</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="rounded bg-warn-soft px-2 py-0.5 text-[0.85rem] font-bold text-warn">
            MII
          </span>
          <span className="text-[0.9rem] text-ink">{t('mobility')}</span>
        </li>
      </ul>
    </div>
  );
}

/** One tooth's readings written out, for a reader who may not change them. */
function PerioReadout({ summary, toothNum }: { summary: PerioSummary; toothNum: number }) {
  const t = useTranslations('teeth');
  const tc = useTranslations('common');

  if (!summary.recorded) {
    return <p className="text-[1.02rem] text-ink-faint">{t('perioNone')}</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="field-label">{t('perioDepths')}</p>
        <div className="mt-1 flex items-center gap-3">
          <PerioStrip toothNum={toothNum} summary={summary} className="scale-125 origin-left" />
          <p className="text-[0.95rem] text-ink-soft">
            {PERIO_SITES.map((site, index) =>
              summary.depths[index] === null
                ? null
                : `${t(`site_${site}`)} ${summary.depths[index]}`,
            )
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <p>
          <span className="field-label">{t('perioBleeding')}</span>
          <span className="text-[1.02rem] font-semibold text-ink">
            {summary.bleedingCount > 0
              ? t('perioBleedingCount', { count: summary.bleedingCount })
              : tc('none')}
          </span>
        </p>
        <p>
          <span className="field-label">{t('mobility')}</span>
          <span className="text-[1.02rem] font-semibold text-ink">
            {summary.mobility === null
              ? t('mobilityUnknown')
              : `${MOBILITY_LABEL[summary.mobility]} — ${t(`mobility_${summary.mobility}`)}`}
          </span>
        </p>
      </div>
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
 *
 * In the periodontal view it lists the same teeth by a different question —
 * which pockets are deep, which sites bleed, which teeth move — under the two
 * numbers a periodontal examination is actually reported as.
 */
function ChartFindings({
  view,
  records,
  conditionOf,
  numberLabel,
  onSelect,
  onPoint,
}: {
  view: ChartView;
  records: ToothRecordMap;
  /** The tooth as the screen knows it — one mark ahead of `records` while a
   *  click is in flight. */
  conditionOf: (toothNum: number) => ToothCondition;
  numberLabel: (toothNum: number) => string;
  onSelect: (toothNum: number) => void;
  /** Ring this tooth on the arch, or clear the ring with null. */
  onPoint: (toothNum: number | null) => void;
}) {
  const t = useTranslations('teeth');

  const perio = view === 'PERIO';

  const findings = ALL_TEETH.map((toothNum) => {
    // The condition as the screen knows it, so a tooth just marked on the arch
    // appears in the list beside it on the same click. Read off `records` this
    // list stayed a round trip behind the drawing, and under a fast hand it was
    // permanently behind — the panel and the arch disagreeing about the mouth.
    const condition = conditionOf(toothNum);
    return {
      toothNum,
      status: condition.status,
      surfaces: parseSurfaces(condition.surfaces),
      notes: records[toothNum]?.notes ?? '',
      chartedOn: records[toothNum]?.chartedOn ?? '',
      perio: perioSummaryOf(records[toothNum] ?? {}),
    };
  }).filter((finding) =>
    perio
      ? finding.perio.recorded
      : finding.status !== DEFAULT_TOOTH_STATUS || finding.notes !== '',
  );

  const flagged = findings.filter((finding) => finding.status !== DEFAULT_TOOTH_STATUS);
  const overview = perioOverview(
    ALL_TEETH.map((toothNum) => perioSummaryOf(records[toothNum] ?? {})),
  );

  // Counted in the order the statuses are declared, which is roughly worst
  // first — a tally that reshuffles itself as teeth are charted is one nobody
  // can read twice.
  const tally = TOOTH_STATUSES.filter((status) => status !== DEFAULT_TOOTH_STATUS)
    .map((status) => ({ status, count: flagged.filter((f) => f.status === status).length }))
    .filter((row) => row.count > 0);

  // Not sticky any more: it sits under the chart rather than beside it, and a
  // panel that pins itself to the top of a column it is the only thing in just
  // floats away from the arch it belongs to.
  return (
    <aside className="overflow-hidden rounded-lg border border-line bg-paper">
      <div className="border-b border-line px-4 py-3">
        <p className="flex items-center gap-2 text-[0.9rem] font-bold text-ink-faint uppercase">
          {perio ? <Activity size={17} aria-hidden /> : <Stethoscope size={17} aria-hidden />}
          {t(perio ? 'perioFindings' : 'findings')}
        </p>

        {perio ? (
          <>
            <p className="mt-1 font-semibold text-ink-soft">
              {t('perioSummary', { count: overview.teethProbed })}
            </p>
            {overview.teethProbed > 0 ? (
              <ul className="mt-2.5 flex flex-wrap gap-1.5">
                {overview.deepest !== null ? (
                  <li
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 text-[0.82rem] font-bold',
                      overview.deepest >= 6
                        ? 'border-danger bg-danger-soft text-danger'
                        : overview.deepest > 3
                          ? 'border-warn bg-warn-soft text-warn'
                          : 'border-line-strong bg-ok-soft text-ok',
                    )}
                  >
                    {t('perioDeepest')}
                    <span className="ml-1.5 tabular-nums">{overview.deepest}mm</span>
                  </li>
                ) : null}
                {overview.bleedingPercent !== null ? (
                  <li
                    className={cn(
                      'flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.82rem] font-bold',
                      overview.bleedingPercent >= 10
                        ? 'border-danger bg-danger-soft text-danger'
                        : 'border-line-strong bg-surface text-ink-soft',
                    )}
                  >
                    <Droplet size={13} aria-hidden />
                    <span className="tabular-nums">{overview.bleedingPercent}%</span>
                  </li>
                ) : null}
              </ul>
            ) : null}
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      {findings.length === 0 ? (
        <p className="px-4 py-6 text-center text-[0.98rem] text-ink-faint">
          {t(perio ? 'perioFindingsEmpty' : 'findingsEmpty')}
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
                      {perio ? (
                        <>
                          {finding.perio.deepest !== null ? (
                            <span
                              className={cn(
                                'rounded-full border px-2 py-0.5 text-[0.78rem] font-bold tabular-nums',
                                finding.perio.deepest >= 6
                                  ? 'border-danger bg-danger-soft text-danger'
                                  : finding.perio.deepest > 3
                                    ? 'border-warn bg-warn-soft text-warn'
                                    : 'border-line-strong bg-ok-soft text-ok',
                              )}
                            >
                              {finding.perio.deepest}mm
                            </span>
                          ) : null}
                          {finding.perio.mobility !== null && finding.perio.mobility > 0 ? (
                            // Banded exactly as the strip bands it, so the chip
                            // and the drawing beside it never disagree about
                            // how bad the same grade is.
                            <span
                              className={cn(
                                'rounded-full border px-2 py-0.5 text-[0.78rem] font-bold',
                                finding.perio.mobility >= 2
                                  ? 'border-danger bg-danger-soft text-danger'
                                  : 'border-warn bg-warn-soft text-warn',
                              )}
                            >
                              M{MOBILITY_LABEL[finding.perio.mobility]}
                            </span>
                          ) : null}
                          {finding.perio.bleedingCount > 0 ? (
                            <span className="flex items-center gap-1 rounded-full border border-danger bg-danger-soft px-2 py-0.5 text-[0.78rem] font-bold text-danger">
                              <Droplet size={12} aria-hidden />
                              <span className="tabular-nums">{finding.perio.bleedingCount}</span>
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-[0.78rem] font-bold',
                            TOOTH_STATUS_STYLE[finding.status].swatch,
                          )}
                        >
                          {t(`status_${finding.status}`)}
                        </span>
                      )}
                    </span>

                    <span className="mt-0.5 block text-[0.88rem] leading-snug text-ink-soft">
                      {t(`quadrant_${quadrantOf(finding.toothNum)}`)}
                      {kind ? ` · ${t(`name_${kind}`)}` : ''}
                      {dentitionOf(finding.toothNum) === 'PRIMARY' ? ` · ${t('primaryTooth')}` : ''}
                    </span>

                    {perio ? (
                      // A flex parent rather than a block one: the strip centres
                      // its own rows, and in a full-width block that centring
                      // pushes it into the middle of the row instead of lining
                      // it up under the tooth number.
                      <span className="mt-1 flex">
                        <PerioStrip toothNum={finding.toothNum} summary={finding.perio} />
                      </span>
                    ) : (
                      <>
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
                      </>
                    )}
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

      <div className="w-1 shrink-0 bg-cyan-400" role="presentation" />

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
  /** Which examination this row is drawing. */
  view: ChartView;
  /** The tooth as the screen currently knows it — which is one mark ahead of
   *  the server while a click is in flight. */
  conditionOf: (toothNum: number) => ToothCondition;
  perioOf: (toothNum: number) => PerioSummary;
  hasNote: (toothNum: number) => boolean;
  readOnly: boolean;
  /** Whether a condition is held, so a click writes rather than opens. */
  marking: boolean;
  /** Crown down, root up — and the number sits beneath the target. */
  upper?: boolean;
  primary?: boolean;
  onSelect: (toothNum: number, surface?: ToothSurface | null) => void;
  /** The tooth the findings list is pointing at, if it is this one. */
  highlight?: number | null;
  /** FDI or Universal, whichever the practice reads. */
  numberLabel: (toothNum: number) => string;
  toothLabel: (toothNum: number) => string;
  /** What one wedge of the surface target is called, for its tooltip. */
  surfaceLabel: (toothNum: number, surface: ToothSurface) => string;
};

function ToothCell({
  toothNum,
  view,
  conditionOf,
  perioOf,
  hasNote,
  readOnly,
  marking,
  upper = false,
  primary = false,
  onSelect,
  highlight = null,
  numberLabel,
  toothLabel,
  surfaceLabel,
}: ToothCellProps) {
  const condition = conditionOf(toothNum);
  const status = condition.status;
  const style = TOOTH_STATUS_STYLE[status];
  const marked = parseSurfaces(condition.surfaces);
  const perio = perioOf(toothNum);

  const glyph = (
    <button
      type="button"
      onClick={() => onSelect(toothNum)}
      aria-label={toothLabel(toothNum)}
      className={cn(
        // A tooth is a long thin thing, so the glyph is given height rather
        // than width — it is the only dimension that makes the drawing bigger.
        //
        // Derived from the cell width over the drawing's own aspect, so the box
        // is exactly the size of what lands in it. Any more is letterbox:
        // `preserveAspectRatio` defaults to `meet`, so the surplus is split
        // above and below and pushes the surface wheel and the tooth number
        // away from the crown they belong to. `--tooth-glyph-h` carries the
        // arithmetic; a milk tooth gets seven tenths of it, as it always did.
        'relative block w-full rounded-md transition-colors hover:bg-brand-soft/60',
        primary ? 'h-[calc(var(--tooth-glyph-h)*0.7)]' : 'h-(--tooth-glyph-h)',
      )}
    >
      <ToothGlyph toothNum={toothNum} status={status} surfaces={marked} />
      {hasNote(toothNum) ? (
        <span aria-hidden className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-ink-faint" />
      ) : null}
    </button>
  );

  // Under the tooth: the five faces in the condition view, the six probe
  // readings in the periodontal one. The same slot either way, so the number
  // stays where the eye left it when the view changes.
  const under =
    view === 'PERIO' ? (
      // Hidden from assistive technology and skipped by the tab key, exactly
      // as the surface target is: it opens the same record the tooth above it
      // opens, and two controls with one name is a list read twice.
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={() => onSelect(toothNum)}
        className="mx-auto block rounded-md px-0.5 py-0.5 transition-colors hover:bg-brand-soft/60"
      >
        <PerioStrip toothNum={toothNum} summary={perio} />
      </button>
    ) : (
      <div className="mx-auto h-11 w-11">
        <SurfaceTarget
          toothNum={toothNum}
          readOnly={readOnly}
          fillOf={(surface) => surfaceFill(status, condition.surfaces, surface)}
          labelOf={(surface) => surfaceLabel(toothNum, surface)}
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
        // With a tool held the whole cell is a target, and saying so with the
        // cursor is cheaper than a tooltip nobody waits for.
        marking && 'cursor-crosshair',
        highlight === toothNum && 'bg-brand-soft ring-2 ring-brand',
      )}
    >
      {upper ? (
        <>
          {glyph}
          {under}
          {number}
        </>
      ) : (
        <>
          {number}
          {under}
          {glyph}
        </>
      )}
    </div>
  );
}
