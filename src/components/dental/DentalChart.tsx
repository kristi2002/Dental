'use client';

import {
  Activity,
  ArrowRight,
  CalendarCheck,
  ClipboardList,
  Droplet,
  Paperclip,
  Stethoscope,
  X,
} from 'lucide-react';
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
import { markTeeth, recordChartExam, saveToothPerio, saveToothRecord } from '@/lib/actions/patients';
import { planStepForTooth } from '@/lib/actions/plans';
import { IDLE_STATE } from '@/lib/actions/types';
import {
  MOBILITY_LABEL,
  PERIO_SITES,
  perioOverview,
  perioSummaryOf,
  POCKET_DEEP,
  type PerioSummary,
} from '@/lib/perio';
import {
  ALL_TEETH,
  applyFinding,
  cariesIndex,
  DEFAULT_TOOTH_STATUS,
  HEALTHY_TOOTH,
  PERMANENT_LOWER_LEFT,
  PERMANENT_LOWER_RIGHT,
  PERMANENT_TEETH,
  PERMANENT_UPPER_LEFT,
  PERMANENT_UPPER_RIGHT,
  PRIMARY_LOWER_LEFT,
  PRIMARY_LOWER_RIGHT,
  PRIMARY_TEETH,
  PRIMARY_UPPER_LEFT,
  PRIMARY_UPPER_RIGHT,
  findingOf,
  headlineStatus,
  isExclusive,
  NO_FINDINGS,
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
  type CariesIndex,
  type ToothCondition,
  type ToothFindings,
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

/**
 * The treatment already decided on for a tooth, which the chart has never shown.
 *
 * Every paper odontogram in the world carries two layers — what is *there* and
 * what is *intended* — and reads them apart by colour. This one only ever had
 * the first. That was not a data problem: `TreatmentStep.toothNum` has held the
 * link since treatment plans existed, and `planStepForTooth` fills it in from
 * this very screen. The chart offered to plan a filling and then had no way to
 * tell you it had been planned, so the dentist who found the decay on Tuesday
 * saw the same chart on Friday as the one who had not planned anything.
 *
 * **Pending steps of active plans only.** A `DONE` step is already answered by
 * the tooth's own status — a filled tooth reads as filled — and drawing it again
 * as a plan would say the work is still owed. `SKIPPED` is a decision not to do
 * it. A plan that is `COMPLETED` or `CANCELLED` has no outstanding intent in it
 * at all, whatever its steps say.
 *
 * Composed on the server, like `chartedOn` and for the same reason: the booked
 * date has to be spelled by something with the locale's month names in it.
 */
/**
 * The files already attached to a tooth.
 *
 * `PatientDocument.toothNum` has existed since documents did, and the upload
 * dialog has always asked which tooth — so an OPG or a periapical filed against
 * 46 was already stored as being about 46. The gallery showed that as a badge.
 * Nothing went the other way: standing on the tooth, in the record where the
 * question "have we got an X-ray of this one?" is actually asked, the answer
 * was three clicks away in another tab.
 *
 * Names only, and no link. A thumbnail here would want the bytes, which means a
 * permission check and a signed URL per tooth on a screen that draws
 * thirty-two of them; and the gallery already does that job properly one tab
 * over. This says "there are two, and what they are", which is what turns a
 * hunt into a decision.
 */
export type ToothFile = { id: string; fileName: string; kind: string };
export type ToothFileMap = Record<number, ToothFile[]>;

/**
 * The reading before the one on screen, per tooth.
 *
 * A pocket depth is only diagnostic against its own history: 5mm that was 3mm
 * last year is disease progressing and gets referred, 5mm that has been 5mm for
 * three years is a stable defect that gets maintained. Until `PerioExam` existed
 * the practice was taking the measurement and overwriting the comparison.
 *
 * `deepest` and `worstAttachment` rather than the whole six readings, because
 * this is a comparison and not a second examination — the question at the chair
 * is "better or worse than last time", and six numbers beside six numbers is a
 * puzzle rather than an answer.
 */
export type PerioBefore = {
  /** The day it was taken, formatted on the server for the same reason
   *  `chartedOn` is: a browser without full ICU spells Albanian months wrong. */
  on: string;
  deepest: number | null;
  worstAttachment: number | null;
  /**
   * The deepest pocket at each of this tooth's examinations, oldest first and
   * including the one on screen.
   *
   * Two readings say better or worse. A *line* says which of the two stories
   * this is — 3, 4, 5, 6 is a tooth being lost slowly and nobody noticing,
   * where 6, 6, 6, 6 is a defect that has been stable for four recalls and
   * wants maintaining rather than referring. Both of those show as "+1 since
   * last time" or "no change" respectively, which is exactly the wrong summary
   * of each.
   *
   * A handful of points, not the history: this is a shape read at a glance
   * beside a number, and thirty of them in ten pixels is a smudge.
   */
  series: number[];
};

export type PerioBeforeMap = Record<number, PerioBefore>;

/**
 * The mouth's periodontal condition at each examination, oldest last.
 *
 * The per-tooth trend answers "is this tooth getting worse"; this answers "is
 * this mouth", which is the question a hygiene recall interval is actually set
 * from. Bleeding as a percentage of probed sites, because that is how a
 * periodontal examination is reported and the only form of it that is
 * comparable between two visits that probed different numbers of teeth.
 */
export type PerioMouthPoint = {
  on: string;
  bleedingPercent: number | null;
  deepest: number | null;
};

/**
 * That this mouth was examined, and by whom.
 *
 * See `ChartExam` in the schema: a healthy tooth is a tooth with no findings,
 * so a fully examined sound mouth and a mouth nobody has looked in draw the
 * same thirty-two clean teeth. This is the line that tells them apart.
 */
export type ChartExamStamp = {
  on: string;
  by: string | null;
};

export type PlannedStep = {
  /** The step's own id, so the list has a key that is not its position. */
  id: string;
  title: string;
  /** The slot it is booked into, already formatted, or null if unbooked. */
  booked: string | null;
};

export type PlannedMap = Record<number, PlannedStep[]>;

export type ToothRecordMap = Record<
  number,
  {
    /**
     * Everything true of the tooth, newest first.
     *
     * A list rather than the single `status` this used to hold: a crowned,
     * root-filled molar with a filling on the distal is three findings and the
     * chart could record one of them. See `ToothFinding` in the schema. An
     * empty list is a healthy tooth, which is why `HEALTHY` never appears in
     * one.
     */
    findings: ToothFindings;
    notes: string;
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
    /** Gingival recession at the same six sites — the other half of
     *  attachment loss. See `perio.ts`. */
    recession?: string | null;
    /** Furcation grade, or null on a tooth that has no furcation. */
    furcation?: number | null;
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

/**
 * The order a periodontal sweep walks the mouth in.
 *
 * A full-mouth examination is six readings on each of thirty-two teeth: a
 * hundred and ninety-two numbers, dictated by one person and typed by another.
 * `PerioFields` already moves between the six boxes on its own; what it could
 * not do was move between *teeth*, so every tooth cost a save, a close, a hunt
 * along the arch for the next one, and a click. That is thirty-two hunts, and
 * it is most of what makes a perio pass take ten minutes.
 *
 * Upper right to upper left, then lower left to lower right — round the arch
 * the way a probe travels rather than the way the rows are drawn, so the sweep
 * never asks the hand to jump the midline and come back. The lower run is
 * reversed for the same reason: at the end of the upper arch the probe is at
 * the patient's left, and the next tooth it reaches is the lower left eight.
 *
 * Permanent teeth only. A mixed dentition is charted tooth by tooth anyway, and
 * a sweep that walked into a milk tooth the patient had lost last year would
 * stop the run dead in the middle.
 */
const SWEEP_ORDER: readonly number[] = [
  ...PERMANENT_UPPER_RIGHT,
  ...PERMANENT_UPPER_LEFT,
  ...PERMANENT_LOWER_LEFT.toReversed(),
  ...PERMANENT_LOWER_RIGHT.toReversed(),
];

/**
 * The tools a number key picks up, in the order the palette draws them.
 *
 * Nine, because the tenth would have to be `0` and nobody reads `0` as tenth —
 * and because the shortcut is only worth having for the tools a hand reaches
 * for without looking. The palette draws the number on each of these, which is
 * the only reason anybody will ever find them: an undiscoverable shortcut is a
 * feature written for the person who wrote it.
 *
 * Palette order rather than an order of its own. Two numberings for one row of
 * buttons — the one printed on them and the one the keyboard uses — is worse
 * than any gain from putting caries on `1`.
 */
const TOOL_KEYS: readonly (ToothStatus | null)[] = [null, ...TOOTH_STATUSES.slice(0, 8)];

/** Deep enough that one wrong click never costs an examination, short enough
 *  that the stack is not a second copy of the chart's history. */
const UNDO_DEPTH = 50;

/**
 * How far a tooth sits from the midline, negative on the patient's right.
 *
 * What the arrow keys move by when they cross between rows. The permanent rows
 * are sixteen teeth and the milk rows are ten, so stepping down by *index*
 * would land four columns away from the tooth the eye was on; stepping by
 * position in the mouth lands on the milk tooth under the adult one, which is
 * where it is.
 */
function offsetIn(row: readonly number[], index: number): number {
  const half = row.length / 2;
  return index < half ? index - half : index - half + 1;
}

/**
 * One step back: which teeth, and what each of them was before.
 *
 * A list of teeth rather than one, because a stroke across six molars is one
 * thing the hand did and has to come back in one press. Undoing it tooth by
 * tooth would mean six presses to take back one gesture, and the fifth of them
 * would leave the mouth in a state nobody ever chose.
 *
 * Carries its own id because a write that fails has to find the step *it*
 * pushed among however many have been pushed since.
 */
type UndoEntry = { id: number; teeth: { toothNum: number; before: ToothFindings }[] };

/** What one write does to one tooth. */
type ToothChange = { toothNum: number; after: ToothFindings };

function storedFindings(records: ToothRecordMap, toothNum: number): ToothFindings {
  return records[toothNum]?.findings ?? NO_FINDINGS;
}

/** Two findings lists as one string, for comparing what is on screen against
 *  what the server has just sent back. Order is not significant — the same
 *  three findings in a different order are the same tooth — so it is normalised
 *  before the comparison rather than after somebody notices the flicker. */
function findingsKey(findings: ToothFindings): string {
  return [...findings]
    .map((finding) => `${finding.status}:${finding.surfaces}`)
    .sort()
    .join('|');
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
  planned,
  perioBefore,
  perioTrend,
  exam,
  files,
  numbering = 'FDI',
  showPrimary: initialShowPrimary = false,
  readOnly = false,
  canPlan = false,
}: {
  patientId: string;
  records: ToothRecordMap;
  /** Outstanding treatment, per tooth. Optional because the pickers that reuse
   *  this chart are choosing teeth rather than reading a record. */
  planned?: PlannedMap;
  /** The previous periodontal reading, per tooth. Same reason for optional. */
  perioBefore?: PerioBeforeMap;
  /** The whole mouth's periodontal history, oldest first. */
  perioTrend?: PerioMouthPoint[];
  /** The last recorded examination of this chart, or nothing if there has never
   *  been one. */
  exam?: ChartExamStamp | null;
  /** Files filed against each tooth. Only ever passed by a page that has
   *  already checked `document.view` — this component does not gate. */
  files?: ToothFileMap;
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

  const [examState, examFormAction] = useActionState(recordChartExam, IDLE_STATE);

  const [perioState, perioFormAction] = useActionState(saveToothPerio, IDLE_STATE);
  /**
   * Whether the last periodontal save asked to move on rather than to close.
   *
   * A ref rather than state: it is read once, by the effect that handles the
   * save landing, and re-rendering the form because a button was pressed would
   * throw away what is typed in it.
   */
  const sweeping = useRef(false);
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

  // Primary teeth are hidden rather than absent: twenty empty milk teeth on an
  // adult chart is noise, and a child's chart is unusable without them. Anything
  // already recorded on one forces them open.
  //
  // Declared up here because the arrow keys need it: which rows exist is what
  // decides where Down from an upper molar lands.
  const [showPrimary, setShowPrimary] = useState(
    initialShowPrimary ||
      [
        ...PRIMARY_UPPER_RIGHT,
        ...PRIMARY_UPPER_LEFT,
        ...PRIMARY_LOWER_RIGHT,
        ...PRIMARY_LOWER_LEFT,
      ].some((n) => (records[n]?.findings.length ?? 0) > 0),
  );
  /**
   * Teeth changed since the last server render, so the drawing answers the
   * click rather than the round trip. Marking is done at the speed of speech
   * and a chart that lags a save behind is one that gets clicked twice.
   */
  const [pending, setPending] = useState<Record<number, ToothFindings>>({});
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  /**
   * What undo took back, so it can be put back again.
   *
   * Undo without redo is a trap rather than a safety net: the press that takes
   * back the wrong thing is itself unrecoverable, so people stop pressing it —
   * which costs exactly the confidence the marking tools were built to give.
   * Cleared by the next real mark, because a redo of something the chart has
   * since been told to forget would put back a finding that contradicts what is
   * now on the tooth.
   */
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);
  const [markError, setMarkError] = useState<string | null>(null);
  /** What just happened, for the reader who cannot see the chart change — and
   *  for the one who can but did not catch which tooth moved. */
  const [markSaid, setMarkSaid] = useState<string | null>(null);
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
      const waiting = Object.entries(current).filter(
        ([key, findings]) => findingsKey(storedFindings(records, Number(key))) !== findingsKey(findings),
      );
      return waiting.length === Object.keys(current).length ? current : Object.fromEntries(waiting);
    });
  }, [records]);

  /** What the tooth is right now, as far as this screen knows. */
  function findingsOf(toothNum: number): ToothFindings {
    return pending[toothNum] ?? storedFindings(records, toothNum);
  }

  /**
   * Write a resolved list of findings for one or more teeth, keeping the
   * drawing ahead of the round trip.
   *
   * The whole list goes over rather than a delta: the server then has one job —
   * make the tooth look like this — and cannot end up in a state the screen
   * never predicted.
   *
   * **One call for the whole stroke.** Painting six molars is six teeth in one
   * gesture, and sending it as six actions means six revalidations of the page
   * and six chances for two of them to land out of order. `undoTo` carries what
   * all of them were, so the gesture comes back in one press as well.
   */
  function write(
    changes: readonly ToothChange[],
    undoTo: readonly { toothNum: number; before: ToothFindings }[] | null,
    said: string | null,
    /** Where the step goes if it sticks. Undo pushes what it took back onto the
     *  redo stack and redo pushes it back onto undo, which is the whole of the
     *  difference between the two. */
    onto: 'undo' | 'redo' = 'undo',
  ) {
    if (changes.length === 0) return;

    setMarkError(null);
    setMarkSaid(said);
    setPending((current) => {
      const next = { ...current };
      for (const change of changes) next[change.toothNum] = change.after;
      return next;
    });

    let step: number | null = null;
    if (undoTo !== null) {
      const id = (step = ++undoSeq.current);
      const entry: UndoEntry = { id, teeth: [...undoTo] };
      (onto === 'undo' ? setUndoStack : setRedoStack)((stack) =>
        [...stack, entry].slice(-UNDO_DEPTH),
      );
    }

    startMarking(async () => {
      const result = await markTeeth({
        patientId,
        teeth: changes.map((change) => ({
          toothNum: change.toothNum,
          findings: change.after.map((finding) => ({
            status: finding.status,
            surfaces: finding.surfaces,
          })),
        })),
      });

      if (result.status === 'error') {
        // Drop the optimistic entries rather than replacing them with the old
        // values: what is on file is whatever the server still has, and falling
        // back to the record is the one answer that cannot be wrong.
        const refused = new Set(changes.map((change) => change.toothNum));
        setPending((current) =>
          Object.fromEntries(Object.entries(current).filter(([key]) => !refused.has(Number(key)))),
        );
        // Only this write's own step. Filtering by tooth took back every step
        // recorded on it, so one refused mark made the marks before it — which
        // are on file and perfectly undoable — permanently un-undoable.
        const drop = (stack: UndoEntry[]) => stack.filter((entry) => entry.id !== step);
        (onto === 'undo' ? setUndoStack : setRedoStack)(drop);
        setMarkSaid(null);
        setMarkError(result.message);
      }
    });
  }

  /** What a mark did, in words: the tooth, and what is on it now. */
  function markSentence(toothNum: number, after: ToothFindings): string {
    const name = t('tooth', { num: label(toothNum) });
    return after.length === 0
      ? `${name} — ${t(`status_${DEFAULT_TOOTH_STATUS}`)}`
      : `${name} — ${after.map((finding) => t(`status_${finding.status}`)).join(' · ')}`;
  }

  /** The tooth as the held tool would leave it, or null where the tool would
   *  change nothing — clicking a face already marked with it turns it off, and
   *  a click that changes nothing should not cost a write. */
  function toolChange(toothNum: number, surface: ToothSurface | null): ToothChange | null {
    if (readOnly || tool === null) return null;
    const before = findingsOf(toothNum);
    const after = applyFinding(before, tool, surface);
    return findingsKey(after) === findingsKey(before) ? null : { toothNum, after };
  }

  function mark(toothNum: number, surface: ToothSurface | null) {
    const change = toolChange(toothNum, surface);
    if (!change) return;
    setRedoStack([]);
    write(
      [change],
      [{ toothNum, before: findingsOf(toothNum) }],
      markSentence(toothNum, change.after),
    );
  }

  function undo() {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack((stack) => stack.slice(0, -1));
    write(
      last.teeth.map((tooth) => ({ toothNum: tooth.toothNum, after: tooth.before })),
      // What they are *now* is what a redo would have to put back.
      last.teeth.map((tooth) => ({ toothNum: tooth.toothNum, before: findingsOf(tooth.toothNum) })),
      t('undoSaid', { count: last.teeth.length }),
      'redo',
    );
  }

  function redo() {
    const last = redoStack[redoStack.length - 1];
    if (!last) return;
    setRedoStack((stack) => stack.slice(0, -1));
    write(
      last.teeth.map((tooth) => ({ toothNum: tooth.toothNum, after: tooth.before })),
      last.teeth.map((tooth) => ({ toothNum: tooth.toothNum, before: findingsOf(tooth.toothNum) })),
      t('redoSaid', { count: last.teeth.length }),
      'undo',
    );
  }

  /* ---------------------------------------------------------------- *
   * Painting a run of teeth
   * ---------------------------------------------------------------- */

  /**
   * The teeth this stroke has painted, and what each of them was before it.
   *
   * A ref rather than state: it is written on every pointer that crosses a
   * tooth, and re-rendering the arch mid-drag to store a set nothing draws from
   * would cost frames in the one gesture that has to keep up with a hand.
   *
   * Null when no stroke is in progress, which is also what tells the click
   * handler that the press it is about to see has already been dealt with.
   */
  const stroke = useRef<Map<number, { before: ToothFindings; after: ToothFindings }> | null>(null);
  /** The face the stroke started on, or null for a stroke over whole teeth.
   *  Dragging from the occlusal of 16 across to 18 seals three occlusal
   *  surfaces, which is what starting on one meant. */
  const strokeSurface = useRef<ToothSurface | null>(null);
  /** Set when a stroke actually wrote something, so the click that follows the
   *  same press does not write it a second time. */
  const strokeWrote = useRef(false);

  /**
   * Add one tooth to the stroke in progress, optimistically.
   *
   * The stroke keeps **both** states itself rather than reading the answer back
   * off `pending` when the hand lets go. That was the first version and it
   * silently wrote nothing: `setPending` is asynchronous, and a quick drag
   * finishes before React has committed a single one of its updates, so the
   * release found an empty map and concluded the stroke had changed nothing.
   * Held here, the gesture does not depend on a render having happened.
   */
  function paint(toothNum: number, surface: ToothSurface | null) {
    const run = stroke.current;
    if (run === null || run.has(toothNum)) return;

    const before = findingsOf(toothNum);
    const change = toolChange(toothNum, surface);
    // Recorded even when nothing changed, so dragging back and forth across a
    // tooth already carrying the tool's finding does not toggle it on and off
    // under the hand. A stroke says "these teeth are this", once.
    run.set(toothNum, { before, after: change?.after ?? before });
    if (!change) return;

    setPending((current) => ({ ...current, [toothNum]: change.after }));
  }

  /**
   * The gesture is over: write what it painted, as one step.
   *
   * Bound to the window rather than to the arch, because a hand that leaves the
   * last tooth before letting go — which is most of them — releases over the
   * page and not over a tooth, and a stroke that only ended when the pointer
   * happened to be on a target would sometimes never end at all.
   */
  useEffect(() => {
    if (readOnly || view !== 'CONDITION') return;

    function end() {
      const run = stroke.current;
      stroke.current = null;
      if (run === null) return;

      const changes: ToothChange[] = [];
      const before: { toothNum: number; before: ToothFindings }[] = [];
      for (const [toothNum, was] of run) {
        if (findingsKey(was.after) === findingsKey(was.before)) continue;
        changes.push({ toothNum, after: was.after });
        before.push({ toothNum, before: was.before });
      }

      if (changes.length === 0) return;
      strokeWrote.current = true;
      setRedoStack([]);
      write(
        changes,
        before,
        changes.length === 1
          ? markSentence(changes[0].toothNum, changes[0].after)
          : t('markedCount', { count: changes.length }),
      );
    }

    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    // Reads everything it needs through refs at the moment the hand lets go, so
    // it is bound once per view rather than rebound on every painted tooth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, view]);

  /* ---------------------------------------------------------------- *
   * The keyboard
   * ---------------------------------------------------------------- */

  /**
   * The rows the arrow keys walk, top to bottom as drawn.
   *
   * Built from what is actually on screen: with the milk teeth hidden there are
   * two rows, with them shown there are four, and a Down that stepped into a
   * row nobody can see would move the focus ring somewhere invisible.
   */
  const rows: number[][] = [
    [...PERMANENT_UPPER_RIGHT, ...PERMANENT_UPPER_LEFT],
    ...(showPrimary ? [[...PRIMARY_UPPER_RIGHT, ...PRIMARY_UPPER_LEFT]] : []),
    ...(showPrimary ? [[...PRIMARY_LOWER_RIGHT, ...PRIMARY_LOWER_LEFT]] : []),
    [...PERMANENT_LOWER_RIGHT, ...PERMANENT_LOWER_LEFT],
  ];

  /**
   * Which tooth the tab key lands on.
   *
   * One stop for the whole arch rather than fifty-two. Thirty-two tab presses
   * to get past the chart is not navigation, it is a wall — and it is the
   * reason the chart was, for anybody not using a mouse, a thing to be escaped
   * rather than used. Inside it, the arrows move: along the arch, and across to
   * the other one.
   */
  const [focusTooth, setFocusTooth] = useState<number>(rows[0][0]);
  const toothId = (toothNum: number) => `${uid}-tooth-${toothNum}`;

  function moveFocus(toothNum: number, dx: number, dy: number) {
    let rowIndex = rows.findIndex((row) => row.includes(toothNum));
    if (rowIndex < 0) return;
    let index = rows[rowIndex].indexOf(toothNum);

    if (dy !== 0) {
      const target = Math.min(rows.length - 1, Math.max(0, rowIndex + dy));
      if (target === rowIndex) return;
      const wanted = offsetIn(rows[rowIndex], index);
      // The nearest column *by position in the mouth*, so the ring stays over
      // the same part of the arch when it crosses to a row of another length.
      let best = 0;
      for (let i = 1; i < rows[target].length; i++) {
        if (
          Math.abs(offsetIn(rows[target], i) - wanted) <
          Math.abs(offsetIn(rows[target], best) - wanted)
        ) {
          best = i;
        }
      }
      rowIndex = target;
      index = best;
    } else {
      // Stops at the third molar rather than wrapping to the other side of the
      // mouth. A ring that jumps the midline on one press is a wrong tooth
      // waiting to be marked.
      index = Math.min(rows[rowIndex].length - 1, Math.max(0, index + dx));
    }

    const next = rows[rowIndex][index];
    setFocusTooth(next);
    document.getElementById(toothId(next))?.focus();
  }

  /**
   * The shortcuts that make the chart usable at the pace it is worked at.
   *
   * Bound to the window rather than to the chart, because the hand that just
   * clicked a tooth is not on a focused control, and a shortcut that needs the
   * right thing focused first is one nobody reaches for. Nothing fires while
   * the dialog is open — it has its own form, and a digit typed into the note
   * field must stay in the note field.
   */
  useEffect(() => {
    if (readOnly || view !== 'CONDITION') return;

    function onKeyDown(event: KeyboardEvent) {
      if (dialogRef.current?.open) return;

      const target = event.target as HTMLElement | null;
      // A digit belongs to whatever is being typed into, always.
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;

      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();
        // Ctrl+Shift+Z and Ctrl+Y are the two redo chords in the world, and
        // which one a person reaches for is which editor they grew up in.
        if (key === 'z' && event.shiftKey) {
          if (redoStack.length === 0) return;
          event.preventDefault();
          redo();
          return;
        }
        if (key === 'y') {
          if (redoStack.length === 0) return;
          event.preventDefault();
          redo();
          return;
        }
        if (key === 'z') {
          // Nothing to take back is not the chart's shortcut to swallow — with
          // an empty stack the keypress belongs to whatever the browser would
          // have done with it.
          if (undoStack.length === 0) return;
          event.preventDefault();
          undo();
        }
        return;
      }

      if (typing) return;

      // Escape puts the tool down. The palette's first button does the same
      // thing, and the whole point of a held tool is that the hand is not over
      // there.
      if (event.key === 'Escape' && tool !== null) {
        event.preventDefault();
        setTool(null);
        return;
      }

      // A digit picks the tool with that number drawn on it. Nine of them,
      // because a tenth would be `0` and nobody reads `0` as tenth.
      if (/^[1-9]$/.test(event.key)) {
        const picked = TOOL_KEYS[Number(event.key) - 1];
        if (picked === undefined) return;
        event.preventDefault();
        setTool(picked);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // Rebound as the stacks change, so `undo` and `redo` always close over the
    // current top of each rather than the one that existed when the effect ran.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, view, undoStack, redoStack, tool]);

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

    // A sweep saves and walks on without the dialog ever closing: the form is
    // keyed on the tooth, so pointing `selected` at the next one remounts six
    // empty boxes with the focus already in the first. The whole saving is that
    // the hand never leaves the keyboard between teeth.
    if (sweeping.current) {
      sweeping.current = false;
      const at = SWEEP_ORDER.indexOf(selected ?? -1);
      const next = at >= 0 ? SWEEP_ORDER[at + 1] : undefined;
      if (next !== undefined) {
        setSelected(next);
        setFocusSurface(null);
        return;
      }
      // The end of the arch. Closing is the right answer — there is nothing
      // after 18, and silently wrapping round to the start would have somebody
      // re-probe the mouth they have just finished.
    }

    dialogRef.current?.close();
    // `selected` is read at the moment the save lands, which is what the
    // `handledTs` guard exists to make once-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const recorded = headlineStatus(findingsOf(toothNum));
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

  /**
   * A click on a tooth: mark it where a tool is held, open it where none is.
   *
   * A press that began a stroke has already been dealt with by the time this
   * runs — the pointer handlers wrote it — so the click that follows the same
   * press is swallowed. Without that, every painted tooth would be marked
   * twice, and the second mark would toggle the first straight back off.
   */
  function touch(toothNum: number, surface: ToothSurface | null = null) {
    if (strokeWrote.current) {
      strokeWrote.current = false;
      return;
    }
    if (view === 'CONDITION' && tool !== null && !readOnly) {
      mark(toothNum, surface);
      return;
    }
    openTooth(toothNum, surface);
  }

  /**
   * Press: begin a run.
   *
   * The tooth under the press is painted immediately, so a press that turns out
   * to be an ordinary click has already done the work and the click above has
   * nothing left to do but stand aside. Only where a tool is held — with none,
   * a press is on its way to opening the record.
   */
  function beginStroke(toothNum: number, surface: ToothSurface | null) {
    if (readOnly || tool === null || view !== 'CONDITION') return;
    stroke.current = new Map();
    strokeSurface.current = surface;
    paint(toothNum, surface);
  }

  /** Drag: the pointer has reached another tooth. */
  function extendStroke(toothNum: number) {
    paint(toothNum, strokeSurface.current);
  }

  const surfacesApply = statusTakesSurfaces(status);
  const current = selected === null ? null : records[selected];
  const openKind = selected === null ? null : toothKind(selected);
  const plannedFor = (toothNum: number): PlannedStep[] => planned?.[toothNum] ?? [];
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
  const openFindings: ToothFindings = selected === null ? NO_FINDINGS : findingsOf(selected);
  /** The faces already named for whichever status the picker is sitting on, so
   *  reopening a tooth shows the finding that is there rather than a blank. */
  const openSurfaces = parseSurfaces(findingOf(openFindings, status)?.surfaces);

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
  const previewFor = (option: ToothStatus): ToothFindings => {
    if (option === DEFAULT_TOOTH_STATUS) return NO_FINDINGS;

    const faces =
      option === 'CARIES' || option === 'FILLED'
        ? previewSurfaces
        : statusTakesSurfaces(option)
          ? focusSurface
            ? [focusSurface]
            : openSurfaces
          : [];
    const self: ToothCondition = { status: option, surfaces: faces.join('') };

    // The tooth as it would *become*, which now includes whatever else is
    // already on it: choosing "Crown" on a root-filled tooth shows the crown
    // over the canals, because that is what the tooth will look like. It is
    // also the answer to a question the old single-status picker could not even
    // ask, and the reason the thumbnails stopped being eleven pictures of an
    // empty tooth with one thing on it.
    return isExclusive(option)
      ? [self]
      : [self, ...openFindings.filter((f) => f.status !== option && !isExclusive(f.status))];
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
    // The chip drawn on the tooth is a coloured ring and nothing else, so
    // without this the one fact it carries reaches nobody using a reader.
    const withPlan = (text: string) => {
      const count = plannedFor(toothNum).length;
      return count > 0 ? `${text} — ${t('plannedCount', { count })}` : text;
    };
    if (view !== 'PERIO') return withPlan(name);

    const perio = perioOf(toothNum);
    if (!perio.recorded) return withPlan(`${name} — ${t('perioNone')}`);

    return withPlan(`${name} — ${[
      perio.deepest !== null ? `${t('perioDeepest')} ${perio.deepest}mm` : null,
      perio.bleedingCount > 0
        ? `${t('perioBleeding')}: ${t('perioBleedingCount', { count: perio.bleedingCount })}`
        : null,
      perio.mobility !== null ? `${t('mobility')} ${MOBILITY_LABEL[perio.mobility]}` : null,
    ]
      .filter(Boolean)
      .join(', ')}`);
  }

  const rowProps = {
    view,
    findingsOf,
    perioOf,
    readOnly,
    hasNote: (n: number) => Boolean(records[n]?.notes),
    plannedCount: (n: number) => plannedFor(n).length,
    marking: tool !== null && !readOnly && view === 'CONDITION',
    onSelect: touch,
    onPaintStart: beginStroke,
    onPaintOver: extendStroke,
    tabStop: focusTooth,
    onFocusTooth: setFocusTooth,
    onArrow: moveFocus,
    idOf: toothId,
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
        <p className="text-body text-ink-soft">
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
                'flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-meta font-bold',
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

      {/**
        * That somebody examined this mouth, and when.
        *
        * The chart draws what is wrong with each tooth and, until this line, had
        * no way to say that anybody had looked. A healthy tooth is a tooth with
        * no findings — the right model, and the reason a fully examined sound
        * mouth and a mouth nobody has ever opened draw the same thirty-two clean
        * teeth. Everything else in this record is dated and attributed; the
        * examination itself was the one thing that could only be inferred, and
        * inferred wrong in the case that matters most, because the patient with
        * nothing wrong has no finding to take a date from.
        *
        * At the top rather than beside the button that writes it: it is read far
        * more often than it is pressed.
        */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-line bg-paper px-4 py-2.5">
        <p className="text-meta text-ink-soft">
          <CalendarCheck size={16} aria-hidden className="mr-1.5 -mt-0.5 inline text-ink-faint" />
          {exam ? (
            <>
              <span className="font-bold text-ink">{t('examinedOn', { date: exam.on })}</span>
              {exam.by ? <span className="ml-1.5">{t('examinedBy', { name: exam.by })}</span> : null}
            </>
          ) : (
            t('examinedNever')
          )}
        </p>

        {readOnly ? null : (
          <form action={examFormAction} className="flex items-center gap-3">
            <input type="hidden" name="patientId" value={patientId} />
            {examState.status === 'error' ? (
              <span role="alert" className="text-meta font-semibold text-danger">
                {examState.message}
              </span>
            ) : null}
            <SubmitButton
              variant="secondary"
              className="btn-sm"
              label={t('recordExam')}
              pendingLabel={tc('saving')}
            />
          </form>
        )}
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

          {/* What the last mark did, in words.
              A stroke across six teeth changes six drawings at once and an undo
              changes them back, and neither is something a person watching one
              tooth will catch. Announced as well as shown, because with a tool
              held nothing on this screen has focus and nothing else would say a
              word about what just happened. */}
          {markError === null && markSaid !== null ? (
            <p role="status" aria-live="polite" className="text-meta text-ink-soft">
              {markSaid}
            </p>
          ) : null}

          <div className="overflow-x-auto pb-2">
            {/* Sized to its contents rather than the viewport, so the arches keep
                their proportions and the page scrolls instead of the chart
                squashing — a compressed odontogram is an unreadable one.

                `select-none` because a run of teeth is marked by dragging
                across them, and a drag over text is a *selection* to every
                browser there is: the first version of the stroke highlighted
                half the page in blue on its way along the arch. Nothing here is
                text anybody copies — the numbers are labels on a drawing. */}
            <div className="w-max select-none">
              <div className="flex justify-between px-1 pb-1">
                <span className="text-meta font-bold text-ink-faint">{t('right')}</span>
                <span className="text-meta font-bold text-ink-faint">{t('left')}</span>
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
              <p className="mb-2 text-meta font-bold text-ink-faint uppercase">{t('legend')}</p>
              <ul className="grid grid-cols-4 gap-x-3 gap-y-2 @min-[40rem]:grid-cols-8">
                {TOOTH_STATUSES.map((option) => (
                  <li key={option} className="flex flex-col items-center gap-0.5 text-center">
                    <span aria-hidden className="h-16 w-9">
                      <ToothGlyph
                        toothNum={LEGEND_TOOTH}
                        findings={
                          option === DEFAULT_TOOTH_STATUS
                            ? []
                            : [
                                {
                                  status: option,
                                  surfaces:
                                    option === 'CARIES' || option === 'FILLED' ? 'O' : '',
                                },
                              ]
                        }
                      />
                    </span>
                    <span className="text-caption leading-tight font-semibold text-ink">
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
              onRedo={redo}
              canRedo={redoStack.length > 0}
            />
          )}
        </div>

        <ChartFindings
          view={view}
          records={records}
          findingsOf={findingsOf}
          trend={perioTrend}
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
                      <span className="block text-body">
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
                        '-mb-px border-b-2 px-3 py-2 text-body font-bold',
                        dialogTab === option
                          ? 'border-brand-dark text-brand-deep'
                          : 'border-transparent text-ink-soft hover:text-ink',
                      )}
                    >
                      {t(`view_${option}`)}
                    </button>
                  ))}
                </div>

                {/* Outstanding treatment, above both examinations rather than
                    inside either. What is planned for a tooth is a fact about
                    the tooth, not about which examination happens to be open —
                    and the perio tab is exactly where somebody re-probing a
                    pocket wants to know a crown is already on the list. */}
                {plannedFor(selected).length > 0 ? (
                  <section className="border-b border-line bg-brand-soft/40 px-5 py-3.5">
                    <h3 className="field-label">{t('planned')}</h3>
                    <ul className="mt-1.5 space-y-1.5">
                      {plannedFor(selected).map((step) => (
                        <li key={step.id} className="flex items-start gap-2.5 text-[0.95rem]">
                          {/* The same hollow ring the tooth carries, so the mark
                              on the chart and the line explaining it are
                              recognisably one thing. */}
                          <span
                            aria-hidden
                            className="mt-1.5 size-2.5 shrink-0 rounded-full border-2 border-brand-dark"
                          />
                          <span className="min-w-0">
                            <span className="font-semibold text-ink">{step.title}</span>
                            {step.booked ? (
                              <span className="ml-1.5 text-ink-soft">
                                {t('plannedBooked', { date: step.booked })}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {files?.[selected]?.length ? (
                  <section className="border-b border-line px-5 py-3.5">
                    <h3 className="field-label">{t('toothFiles')}</h3>
                    <ul className="mt-1.5 space-y-1">
                      {files[selected].map((file) => (
                        <li key={file.id} className="flex items-center gap-2.5 text-[0.95rem]">
                          <Paperclip size={15} aria-hidden className="shrink-0 text-ink-faint" />
                          <span className="truncate text-ink">{file.fileName}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {dialogTab === 'PERIO' && perioBefore?.[selected] ? (
                  <PerioTrend now={perioOf(selected)} before={perioBefore[selected]} />
                ) : null}

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

                      <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-5 py-4">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => dialogRef.current?.close()}
                        >
                          {tc('cancel')}
                        </button>

                        {/* The sweep. Same form and same action as `Save` — the
                            only difference is a flag set on the way in, which
                            the effect above reads when the save lands. Sharing
                            the submit means the two buttons can never disagree
                            about what gets written.

                            Hidden on the last tooth of the run rather than
                            disabled: there is nothing after it, and a control
                            that is present but dead invites the press it then
                            refuses. */}
                        {SWEEP_ORDER.indexOf(selected) >= 0 &&
                        SWEEP_ORDER.indexOf(selected) < SWEEP_ORDER.length - 1 ? (
                          <SubmitButton
                            variant="secondary"
                            label={t('perioSaveNext', {
                              num: label(SWEEP_ORDER[SWEEP_ORDER.indexOf(selected) + 1]),
                            })}
                            pendingLabel={tc('saving')}
                            onClick={() => {
                              sweeping.current = true;
                            }}
                          />
                        ) : null}

                        <SubmitButton label={tc('save')} pendingLabel={tc('saving')} />
                      </footer>
                    </form>
                  )
                ) : readOnly ? (
                  <>
                    <div className="space-y-4 px-5 py-5">
                      <div>
                        <p className="field-label">{t('condition')}</p>
                        {openFindings.length === 0 ? (
                          <p className="text-body font-semibold text-ink">
                            {t(`status_${DEFAULT_TOOTH_STATUS}`)}
                          </p>
                        ) : (
                          <ul className="space-y-1.5">
                            {openFindings.map((finding) => (
                              <li key={finding.status}>
                                <FindingLine toothNum={selected} finding={finding} />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <p className="field-label">{t('notes')}</p>
                        <p
                          className={cn(
                            'text-body whitespace-pre-line',
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

                      {/* What is already on the tooth, before anything is
                          chosen below.

                          The picker underneath shows what each option *would*
                          do, which is the wrong shape for the question asked
                          first: what is on this tooth already, when was it
                          found and by whom. A dentist deciding whether to
                          re-drill a filling wants its age, and a tooth that has
                          carried three findings for two years has three answers
                          — none of which a row of radio buttons can give. */}
                      {openFindings.length > 0 ? (
                        <div>
                          <p className="field-label">{t('recorded')}</p>
                          <ul className="space-y-1.5">
                            {openFindings.map((finding) => (
                              <li key={finding.status}>
                                <FindingLine toothNum={selected} finding={finding} />
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

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
                                'text-center text-caption leading-tight font-semibold hover:border-ink',
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
                                  findings={previewFor(option)}
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
                                  'text-meta font-semibold hover:border-ink',
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
/**
 * This tooth's last reading, and which way it has gone.
 *
 * The whole argument for keeping periodontal history is in this strip: a probe
 * reading means almost nothing on its own and nearly everything against the one
 * before it. Deeper is disease progressing; the same is a defect being held;
 * shallower is treatment working, which is the one thing a hygienist never got
 * to see on this chart before.
 *
 * **Deepest pocket and worst attachment loss, not the six sites.** Six numbers
 * beside six numbers is a puzzle set at the chairside, and the decision being
 * made — refer, treat, or watch — turns on the worst reading rather than on
 * which corner it was at. The six are still on screen directly below this.
 *
 * Direction is carried by a word and an arrow rather than by colour alone, and
 * the arrow is the *clinical* direction rather than the arithmetic one: a
 * shallower pocket is a bigger number going down and is good news, so it is
 * drawn in the same green the rest of the app uses for good news.
 */
function PerioTrend({ now, before }: { now: PerioSummary; before: PerioBefore }) {
  const t = useTranslations('teeth');

  const rows: Array<{ label: string; was: number | null; nowValue: number | null }> = [
    { label: t('perioDeepest'), was: before.deepest, nowValue: now.deepest },
    { label: t('perioAttachment'), was: before.worstAttachment, nowValue: now.worstAttachment },
  ];

  return (
    <section className="border-b border-line bg-paper px-5 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="field-label">{t('perioSince', { date: before.on })}</h3>
        {/* This tooth's own pocket depths, every examination of them. */}
        <span className="text-ink-soft">
          <TrendLine values={before.series} max={POCKET_DEEP} />
        </span>
      </div>

      <dl className="mt-1.5 space-y-1">
        {rows.map((row) => {
          // Nothing to compare is not the same as no change, so a pair with a
          // missing half is left as a reading rather than given a direction.
          const delta =
            row.was === null || row.nowValue === null ? null : row.nowValue - row.was;

          return (
            <div key={row.label} className="flex items-baseline gap-2 text-[0.95rem]">
              <dt className="text-ink-soft">{row.label}</dt>
              <dd className="flex items-baseline gap-1.5 font-semibold tabular-nums text-ink">
                <span className="text-ink-faint">{row.was === null ? '—' : `${row.was}mm`}</span>
                <ArrowRight size={13} aria-hidden className="self-center text-ink-faint" />
                <span>{row.nowValue === null ? '—' : `${row.nowValue}mm`}</span>
                {delta !== null && delta !== 0 ? (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-caption font-bold',
                      delta > 0 ? 'bg-danger-soft text-danger' : 'bg-ok-soft text-ok',
                    )}
                  >
                    {delta > 0 ? `+${delta}` : delta}
                    <span className="sr-only">
                      {' '}
                      {t(delta > 0 ? 'perioWorse' : 'perioBetter')}
                    </span>
                  </span>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function PerioLegend() {
  const t = useTranslations('teeth');

  const bands: { key: string; className: string }[] = [
    { key: 'perioBandHealthy', className: 'bg-ok-soft text-ok' },
    { key: 'perioBandWatch', className: 'bg-warn-soft text-warn' },
    { key: 'perioBandDiseased', className: 'bg-danger-soft text-danger' },
  ];

  return (
    <div className="rounded-lg border border-line bg-paper px-4 py-3">
      <p className="mb-2 text-meta font-bold text-ink-faint uppercase">{t('legend')}</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-2">
        {bands.map((band) => (
          <li key={band.key} className="flex items-center gap-2">
            <span className={cn('rounded px-2 py-0.5 text-meta font-bold', band.className)}>
              {t(`${band.key}Range`)}
            </span>
            <span className="text-meta text-ink">{t(band.key)}</span>
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span className="rounded px-2 py-0.5 text-meta font-bold text-ink underline decoration-danger decoration-2 underline-offset-[2px]">
            4
          </span>
          <span className="text-meta text-ink">{t('perioBleeding')}</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="rounded bg-warn-soft px-2 py-0.5 text-meta font-bold text-warn">
            MII
          </span>
          <span className="text-meta text-ink">{t('mobility')}</span>
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
    return <p className="text-body text-ink-faint">{t('perioNone')}</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="field-label">{t('perioDepths')}</p>
        <div className="mt-1 flex items-center gap-3">
          <PerioStrip toothNum={toothNum} summary={summary} className="scale-125 origin-left" />
          <p className="text-body text-ink-soft">
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
          <span className="text-body font-semibold text-ink">
            {summary.bleedingCount > 0
              ? t('perioBleedingCount', { count: summary.bleedingCount })
              : tc('none')}
          </span>
        </p>
        <p>
          <span className="field-label">{t('mobility')}</span>
          <span className="text-body font-semibold text-ink">
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
  findingsOf,
  trend,
  numberLabel,
  onSelect,
  onPoint,
}: {
  view: ChartView;
  records: ToothRecordMap;
  /** The whole mouth's periodontal history, oldest first. */
  trend?: PerioMouthPoint[];
  /** The tooth as the screen knows it — one mark ahead of `records` while a
   *  click is in flight. */
  findingsOf: (toothNum: number) => ToothFindings;
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
    const findings = findingsOf(toothNum);
    return {
      toothNum,
      list: findings,
      status: headlineStatus(findings),
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

  /**
   * The mouth as one number, adult teeth and milk teeth separately.
   *
   * DMFT is what makes two charts comparable — to the same mouth two years
   * apart, to a sibling, to a population — and every figure in it was already
   * on this screen, spread across thirty-two drawings where nothing could add
   * it up. Written in the two cases dentistry writes it in, upper for the
   * permanent dentition and lower for the primary one, which is not a
   * typographic flourish: they are different scores over different denominators
   * and a child in mixed dentition has both.
   *
   * The milk score is drawn only where there are milk teeth charted. Every
   * adult chart would otherwise carry a permanent `dmft 0` describing twenty
   * teeth that are not there.
   */
  const dmft = cariesIndex(PERMANENT_TEETH, findingsOf);
  const dmftPrimary = cariesIndex(PRIMARY_TEETH, findingsOf);
  const primaryCharted = PRIMARY_TEETH.some((toothNum) => findingsOf(toothNum).length > 0);

  // Not sticky any more: it sits under the chart rather than beside it, and a
  // panel that pins itself to the top of a column it is the only thing in just
  // floats away from the arch it belongs to.
  return (
    <aside className="overflow-hidden rounded-lg border border-line bg-paper">
      <div className="border-b border-line px-4 py-3">
        <p className="flex items-center gap-2 text-meta font-bold text-ink-faint uppercase">
          {perio ? <Activity size={17} aria-hidden /> : <Stethoscope size={17} aria-hidden />}
          {t(perio ? 'perioFindings' : 'findings')}
        </p>

        {perio ? (
          <>
            <p className="mt-1 font-semibold text-ink-soft">
              {t('perioSummary', { count: overview.teethProbed })}
            </p>
            {trend && trend.length > 1 ? (
              // The mouth rather than the tooth. Bleeding is the number a
              // hygiene recall interval is actually set from, and a single
              // percentage says nothing about whether the last course of
              // treatment worked.
              <p className="mt-2 flex items-center gap-2 text-caption text-ink-soft">
                <span className="font-semibold">{t('perioBleeding')}</span>
                <span className="text-ink-faint">
                  <TrendLine
                    values={trend.map((point) => point.bleedingPercent ?? 0)}
                    max={30}
                  />
                </span>
                <span className="tabular-nums">
                  {t('perioTrendSince', { date: trend[0].on })}
                </span>
              </p>
            ) : null}

            {overview.teethProbed > 0 ? (
              <ul className="mt-2.5 flex flex-wrap gap-1.5">
                {overview.deepest !== null ? (
                  <li
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 text-caption font-bold',
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
                      'flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-caption font-bold',
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
                      'rounded-full border px-2.5 py-0.5 text-caption font-bold',
                      TOOTH_STATUS_STYLE[status].swatch,
                    )}
                  >
                    {t(`status_${status}`)}
                    <span className="ml-1.5 tabular-nums">{count}</span>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <CariesScore label="DMFT" index={dmft} />
              {primaryCharted ? <CariesScore label="dmft" index={dmftPrimary} /> : null}
            </div>
          </>
        )}
      </div>

      {findings.length === 0 ? (
        <p className="px-4 py-6 text-center text-body text-ink-faint">
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
                    <ToothGlyph toothNum={finding.toothNum} findings={finding.list} />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-body leading-tight font-bold text-ink tabular-nums">
                        {numberLabel(finding.toothNum)}
                      </span>
                      {perio ? (
                        <>
                          {finding.perio.deepest !== null ? (
                            <span
                              className={cn(
                                'rounded-full border px-2 py-0.5 text-caption font-bold tabular-nums',
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
                                'rounded-full border px-2 py-0.5 text-caption font-bold',
                                finding.perio.mobility >= 2
                                  ? 'border-danger bg-danger-soft text-danger'
                                  : 'border-warn bg-warn-soft text-warn',
                              )}
                            >
                              M{MOBILITY_LABEL[finding.perio.mobility]}
                            </span>
                          ) : null}
                          {finding.perio.bleedingCount > 0 ? (
                            <span className="flex items-center gap-1 rounded-full border border-danger bg-danger-soft px-2 py-0.5 text-caption font-bold text-danger">
                              <Droplet size={12} aria-hidden />
                              <span className="tabular-nums">{finding.perio.bleedingCount}</span>
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span
                          className={cn(
                            'rounded-full border px-2 py-0.5 text-caption font-bold',
                            TOOTH_STATUS_STYLE[finding.status].swatch,
                          )}
                        >
                          {t(`status_${finding.status}`)}
                        </span>
                      )}
                    </span>

                    <span className="mt-0.5 block text-meta leading-snug text-ink-soft">
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
                        {/* Every finding on the tooth, each with its own faces
                            and its own provenance.

                            This used to be one line: the union of every face any
                            finding claimed, and one date taken from the
                            periodontal row. Both were wrong in the same way. A
                            molar with an old filling on the mesial and fresh
                            decay on the distal read as "MD", which is the one
                            thing it is not — it is two findings, and which is
                            which is the whole reason the tooth is being looked
                            at again. And the date belonged to whenever anybody
                            last probed the gum, so most flagged teeth carried no
                            date at all while a few carried somebody else's. */}
                        {finding.list.map((one) => {
                          const faces = parseSurfaces(one.surfaces);
                          return (
                            <span
                              key={one.status}
                              className="mt-1 block text-meta leading-snug text-ink"
                            >
                              <span className="font-semibold">{t(`status_${one.status}`)}</span>
                              {faces.length > 0 ? (
                                <>
                                  <span className="ml-1.5 font-bold tracking-wide">
                                    {faces.join('')}
                                  </span>
                                  <span className="text-ink-soft">
                                    {' — '}
                                    {faces
                                      .map((surface) =>
                                        surface === 'O'
                                          ? t(
                                              isAnterior(finding.toothNum)
                                                ? 'surface_I'
                                                : 'surface_O',
                                            )
                                          : t(`surface_${surface}`),
                                      )
                                      .join(', ')}
                                  </span>
                                </>
                              ) : null}
                              <Provenance finding={one} />
                            </span>
                          );
                        })}

                        {finding.notes ? (
                          <span className="mt-1 block line-clamp-3 text-meta leading-snug whitespace-pre-line text-ink">
                            {finding.notes}
                          </span>
                        ) : null}

                        {/* The tooth's own last-charted date, which is the note
                            and the periodontal row rather than the findings —
                            they carry their own above. Shown only where it says
                            something they do not. */}
                        {finding.notes && finding.chartedOn ? (
                          <span className="mt-1 block text-caption text-ink-faint">
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
 * A run of readings as a line, about the size of a word.
 *
 * The pair of numbers above it says better or worse than last time. The line
 * says *which story this is*, and they are not the same question: 3, 4, 5, 6 is
 * a tooth being lost over four recalls while every single visit reported "one
 * millimetre deeper", and 6, 6, 6, 6 is a stable defect that reported "no
 * change" every time and needs maintaining rather than referring. A chart that
 * can only compare with last time cannot tell those apart, and it is the
 * difference between watching a tooth and losing it.
 *
 * Scaled from zero rather than from the lowest reading. Normalising to the data
 * would draw a mouth that has been 3, 3, 4 as a cliff, and the shape is the
 * whole content here.
 *
 * Hidden from assistive technology: the readings themselves are beside it in
 * text, and a line has nothing to say that they do not.
 */
function TrendLine({ values, max }: { values: readonly number[]; max: number }) {
  // One point is not a trend, it is a reading — and it is already on screen.
  if (values.length < 2) return null;

  const w = 62;
  const h = 16;
  const top = Math.max(max, ...values) || 1;
  const at = (value: number, index: number): [number, number] => [
    (index / (values.length - 1)) * w,
    h - (value / top) * h,
  ];

  const last = at(values[values.length - 1], values.length - 1);

  return (
    <svg
      aria-hidden
      viewBox={`-1.5 -1.5 ${w + 3} ${h + 3}`}
      className="h-4 w-[62px] shrink-0 overflow-visible"
    >
      <polyline
        points={values.map((value, index) => at(value, index).join(',')).join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* Where it has got to, which is the end a reader looks at first. */}
      <circle cx={last[0]} cy={last[1]} r="2.2" fill="currentColor" />
    </svg>
  );
}

/** One finding written out: what it is, which faces it is on, and where it came
 *  from. The dialog states the tooth twice — once as the record that exists and
 *  once as the choice being made — and this is the first of those. */
function FindingLine({ toothNum, finding }: { toothNum: number; finding: ToothCondition }) {
  const t = useTranslations('teeth');
  const faces = parseSurfaces(finding.surfaces);

  return (
    <>
      <span className="text-body font-semibold text-ink">{t(`status_${finding.status}`)}</span>
      {faces.length > 0 ? (
        <span className="ml-1.5 text-body text-ink-soft">
          <span className="font-bold tracking-wide text-ink">{faces.join('')}</span>
          {' — '}
          {faces
            .map((surface) =>
              surface === 'O'
                ? t(isAnterior(toothNum) ? 'surface_I' : 'surface_O')
                : t(`surface_${surface}`),
            )
            .join(', ')}
        </span>
      ) : null}
      <Provenance finding={finding} />
    </>
  );
}

/**
 * When a finding was made, and by whom.
 *
 * Drawn only from what is actually known. A finding recorded before the chart
 * kept either — and every finding in the practice's history is one of those —
 * gets no line rather than a line with a blank in it, because a missing date
 * reads as history where an empty one reads as a fault.
 *
 * The date is the day the finding was *first* made and survives every later
 * amendment to the same finding; see `ToothFinding.recordedAt`. That is the
 * whole value of it: decay found two years ago and decay found this morning are
 * the same red on the drawing and two entirely different conversations.
 */
function Provenance({ finding }: { finding: ToothCondition }) {
  const t = useTranslations('teeth');

  if (!finding.on && !finding.by) return null;

  return (
    <span className="block text-caption text-ink-faint">
      {finding.on ? t('foundOn', { date: finding.on }) : null}
      {finding.on && finding.by ? ' · ' : null}
      {finding.by ? t('foundBy', { name: finding.by }) : null}
    </span>
  );
}

/**
 * The caries index, with its own workings beside it.
 *
 * The score alone is a number nobody can check — and this one carries a known
 * overstatement, because no chart in this app records *why* a tooth came out, so
 * M counts every absent tooth rather than only the carious ones (`cariesIndex`
 * makes the argument). Printing D, M and F next to the total is what lets a
 * reader see where it came from and discount the part they know about, which is
 * the difference between a number that is trusted and one that is quoted.
 *
 * Nothing is drawn for a mouth with no eligible teeth: a score of 0 over 0 teeth
 * is not a healthy mouth, it is an empty chart, and it must not read as the
 * former.
 */
function CariesScore({ label, index }: { label: string; index: CariesIndex }) {
  const t = useTranslations('teeth');

  if (index.counted === 0) return null;

  return (
    <p className="flex items-baseline gap-1.5" title={t('dmftHint')}>
      <span className="text-caption font-bold tracking-wide text-ink-faint uppercase">{label}</span>
      <span className="text-body font-bold text-ink tabular-nums">{index.total}</span>
      <span className="text-caption text-ink-soft tabular-nums">
        {t('dmftParts', { d: index.decayed, m: index.missing, f: index.filled })}
      </span>
    </p>
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
  findingsOf: (toothNum: number) => ToothFindings;
  perioOf: (toothNum: number) => PerioSummary;
  hasNote: (toothNum: number) => boolean;
  /** How much outstanding treatment is planned on this tooth. */
  plannedCount: (toothNum: number) => number;
  readOnly: boolean;
  /** Whether a condition is held, so a click writes rather than opens. */
  marking: boolean;
  /** Crown down, root up — and the number sits beneath the target. */
  upper?: boolean;
  primary?: boolean;
  onSelect: (toothNum: number, surface?: ToothSurface | null) => void;
  /** Begin a stroke on this tooth, and extend one onto it. Both are no-ops
   *  without a tool held. */
  onPaintStart: (toothNum: number, surface: ToothSurface | null) => void;
  onPaintOver: (toothNum: number) => void;
  /** The one tooth in the arch that the tab key reaches, and how the arrows
   *  move it. See `focusTooth`. */
  tabStop: number;
  onFocusTooth: (toothNum: number) => void;
  onArrow: (toothNum: number, dx: number, dy: number) => void;
  /** The id the arrow keys focus this tooth by. */
  idOf: (toothNum: number) => string;
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
  findingsOf,
  perioOf,
  hasNote,
  plannedCount,
  readOnly,
  marking,
  upper = false,
  primary = false,
  onSelect,
  onPaintStart,
  onPaintOver,
  tabStop,
  onFocusTooth,
  onArrow,
  idOf,
  highlight = null,
  numberLabel,
  toothLabel,
  surfaceLabel,
}: ToothCellProps) {
  const findings = findingsOf(toothNum);
  const status = headlineStatus(findings);
  const style = TOOTH_STATUS_STYLE[status];
  const perio = perioOf(toothNum);

  const glyph = (
    <button
      type="button"
      id={idOf(toothNum)}
      onClick={() => onSelect(toothNum)}
      // One tab stop for the whole arch, and the arrows move within it. Fifty-two
      // stops is not navigation, it is a wall — and it is why this chart was, to
      // anybody not using a mouse, a thing to get past rather than to use.
      tabIndex={tabStop === toothNum ? 0 : -1}
      onFocus={() => onFocusTooth(toothNum)}
      onKeyDown={(event) => {
        const move: Record<string, [number, number]> = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        };
        const step = move[event.key];
        if (!step) return;
        event.preventDefault();
        onArrow(toothNum, step[0], step[1]);
      }}
      // The stroke is on the pointer rather than the click, because a click is
      // a press *and* a release on one target and a stroke is neither.
      onPointerDown={() => onPaintStart(toothNum, null)}
      onPointerEnter={() => onPaintOver(toothNum)}
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
      <ToothGlyph toothNum={toothNum} findings={findings} />
      {hasNote(toothNum) ? (
        <span aria-hidden className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-ink-faint" />
      ) : null}
      {/* Planned work, opposite the note dot.

          A hollow ring rather than a filled one, and that is the whole design:
          every other mark on this chart says what *is*, and a filled shape here
          would read as one more finding. Planned work has not happened, so it is
          drawn as an outline — the same instinct that puts existing work in one
          colour and intended work in another on a paper chart, in the one
          channel this drawing had left.

          Not a count. A tooth with three planned steps is not three times as
          planned as one with a single step, and the dialog is one click away
          with the list in it. The accessible name carries the number. */}
      {plannedCount(toothNum) > 0 ? (
        <span
          aria-hidden
          className="absolute top-0.5 left-0.5 size-2.5 rounded-full border-2 border-brand-dark bg-surface"
        />
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
      <div
        className="mx-auto h-11 w-11"
        // A stroke started on a face carries that face across the run: dragging
        // from the occlusal of 16 to 18 seals three occlusal surfaces, which is
        // what somebody who started on one meant.
        onPointerEnter={() => onPaintOver(toothNum)}
      >
        <SurfaceTarget
          toothNum={toothNum}
          readOnly={readOnly}
          fillOf={(surface) => surfaceFill(findings, surface)}
          labelOf={(surface) => surfaceLabel(toothNum, surface)}
          onSurfaceClick={(surface) => onSelect(toothNum, surface)}
          onSurfacePointerDown={(surface) => onPaintStart(toothNum, surface)}
        />
      </div>
    );

  // The status letter rides with the number so the condition never depends on
  // colour alone — the same reason the legend carries one.
  const number = (
    <span
      className={cn(
        'block text-center text-meta leading-5 font-bold tabular-nums',
        status === 'HEALTHY' ? 'text-ink-faint' : 'text-ink',
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
