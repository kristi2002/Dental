import {
  Ban,
  CalendarCheck,
  Check,
  ClipboardList,
  History,
  Printer,
  RotateCcw,
  SkipForward,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ServiceOption } from '@/components/appointments/AppointmentFormDialog';
import { ActionForm } from '@/components/ui/ActionForm';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Badge } from '@/components/ui/Badge';
import { TreatmentPlanStatus, TreatmentStepStatus } from '@/generated/prisma/enums';
import { Link } from '@/i18n/navigation';
import { deletePlan, setPlanStatus, setStepStatus } from '@/lib/actions/plans';
import { toDateKey } from '@/lib/dates';
import { toothLabel, type ToothNumbering } from '@/lib/teeth';
import { cn, initials } from '@/lib/utils';
import { PlanFormDialog } from './PlanFormDialog';
import { StepFormDialog } from './StepFormDialog';

/**
 * How many of the *remaining* steps are named before the rest become a count.
 * The next one is spelled out above them, so five here reads as a glance.
 */
const MAX_CHIPS = 5;

/** A slot, as this row needs to print and link to it. */
export type PlanRowSlot = { date: Date; startTime: string };

export type PlanRowStep = {
  id: string;
  title: string;
  toothNum: number | null;
  status: TreatmentStepStatus;
  /**
   * A slot is already bound to this step. `TreatmentStep.appointmentId` is
   * unique, so a second booking would have nothing to bind itself to — the
   * button has to disappear on the strength of the link existing, not on the
   * strength of the slot still being a promise.
   */
  linked: boolean;
  /** That slot, when it is still ahead and still standing. */
  booked: PlanRowSlot | null;
};

export type PlanRowView = {
  id: string;
  title: string;
  notes: string;
  status: TreatmentPlanStatus;
  patient: { id: string; firstName: string; lastName: string };
  steps: PlanRowStep[];
  done: number;
  relevant: number;
  percent: number;
  quietDays: number;
  stalled: boolean;
  /**
   * When the plan was last touched. It is what the archive tabs are sorted by,
   * and until it was printed "the sixty most recent" was a claim the reader had
   * no way of checking — every closed row looked the same age.
   */
  updatedAt: Date;
  /** The soonest slot any outstanding step is booked into. */
  nextBooked: PlanRowSlot | null;
};

/**
 * One course of treatment on the practice-wide list, and everything that can be
 * done to it from there.
 *
 * The list used to be a report: it found the plan nobody had chased in four
 * months and then offered a link to the screen where something could be done
 * about it. So the triage happened here and the work happened two navigations
 * away, which is a reliable way of turning "I'll do that now" into "I'll do that
 * later". The verbs the row exists to provoke — tick the step off, put it in the
 * diary, add what was missed, stop chasing it — now happen on the row itself.
 *
 * They are not all out on the card, though. Laid out as six buttons in a line
 * they made the one thing anybody presses all day look exactly as important as
 * printing, and every card ended in a hedge of unlabelled icons. What is left in
 * the open is what the plan is *for*; the rest is behind the menu at the end,
 * the same arrangement an appointment row uses.
 */
export function PlanRow({
  plan,
  canEdit,
  canDelete,
  services,
  numbering,
  bookStep,
}: {
  plan: PlanRowView;
  canEdit: boolean;
  canDelete: boolean;
  /** The catalogue, so a step added from here is picked rather than typed. */
  services: ServiceOption[];
  numbering: ToothNumbering;
  /**
   * Renders the booking dialog for one step. Passed in for the same reason the
   * patient tab passes it: booking needs the diary's providers and chairs, and
   * a plan list should not have to load them to reach a button.
   */
  bookStep?: (step: PlanRowStep) => React.ReactNode;
}) {
  const t = useTranslations('plans');
  const tc = useTranslations('common');
  const tt = useTranslations('teeth');
  const format = useFormatter();

  const isActive = plan.status === TreatmentPlanStatus.ACTIVE;
  const pending = plan.steps.filter((step) => step.status === TreatmentStepStatus.PENDING);

  // A plan is a sequence, so "what is left" has a front. Everything the row
  // offers to do points at this one step; the rest stay chips.
  //
  // Only while the plan is running, though: a cancelled one gets no buttons, and
  // if the front step were still held back for a strip that is never drawn, the
  // work it was abandoned partway through would disappear off the row entirely —
  // which is the one thing the cancelled tab is read to find out.
  const next = isActive ? (pending[0] ?? null) : null;
  const rest = next ? pending.slice(1) : pending;
  const shown = rest.slice(0, MAX_CHIPS);
  const hidden = rest.length - shown.length;

  const slotLabel = (slot: PlanRowSlot) =>
    t('nextOn', {
      date: format.dateTime(slot.date, { day: 'numeric', month: 'short', timeZone: 'UTC' }),
      time: slot.startTime,
    });

  const tooth = (toothNum: number) => tt('tooth', { num: toothLabel(toothNum, numbering) });

  return (
    <li
      className={cn(
        // A card of its own rather than a band between two hairlines. A plan is
        // half a dozen facts and a row of buttons, so the rows were reading as
        // one long wall in which the boundary between "this plan" and "the next
        // one" was the faintest line on the page.
        //
        // `shadow-lift` rather than the standard card shadow: this screen *is* a
        // stack of cards, which is the case that token exists for.
        //
        // `@container`, so the card lays itself out against its own width. It is
        // the full page here and could be a column later, and either way a
        // viewport breakpoint would be answering the wrong question. That also
        // puts the card in a stacking context of its own, which would leave an
        // open actions menu painted under the card below — so the card holding
        // the open menu is lifted over its neighbours.
        '@container relative rounded-[var(--radius-card)] border px-5 py-4',
        'shadow-lift transition-shadow transition-colors hover:shadow-pop',
        'has-[[aria-expanded=true]]:z-20',
        // Worst-first is the sort order; this is what makes it visible without
        // reading a word. A tinted card in the app's own warning colours, rather
        // than a thick bar down one edge — nothing else in the app marks a
        // record that way, and a stripe is a fifth thing saying what the badge,
        // the tint and the sort order already say.
        plan.stalled
          ? 'border-warn/35 bg-warn-soft/50'
          : 'border-line bg-surface hover:border-line-strong',
      )}
    >
      <div className="grid gap-x-5 gap-y-3.5 @[46rem]:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="flex min-w-0 items-start gap-3.5">
          {/* Who it is for, before what it is. The list is read down the left
              edge looking for a name, and a disc of initials is what the rest of
              the app gives that job — the patients list, the staff list and the
              activity trail all mark a person this way. */}
          <span
            aria-hidden
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border',
              'text-[0.95rem] font-bold',
              plan.stalled
                ? 'border-warn/30 bg-surface text-warn'
                : 'border-line-strong bg-paper text-ink-soft',
            )}
          >
            {initials(plan.patient.firstName, plan.patient.lastName)}
          </span>

          <div className="min-w-0">
            {/* A heading, not a paragraph: this is the one thing the card is
                about, and a screen reader should be able to jump between plans
                the way the eye does. It lands on the tab the work is actually
                done from. */}
            <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <Link
                href={`/patients/${plan.patient.id}?tab=plans`}
                className="text-[1.1rem] font-bold text-ink no-underline hover:text-brand-deep hover:underline"
              >
                {plan.title}
              </Link>
              {plan.stalled ? (
                <Badge tone="warn">
                  <TriangleAlert size={14} aria-hidden />
                  {t('stalled')}
                </Badge>
              ) : null}
              {/* Only said out loud on the archive tabs, where a row's status is
                  the reason it is being read rather than a given. */}
              {plan.status === TreatmentPlanStatus.COMPLETED ? (
                <Badge tone="ok">
                  <Check size={14} aria-hidden />
                  {t('status_COMPLETED')}
                </Badge>
              ) : null}
              {plan.status === TreatmentPlanStatus.CANCELLED ? (
                <Badge>
                  <Ban size={14} aria-hidden />
                  {t('status_CANCELLED')}
                </Badge>
              ) : null}
            </h2>

            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.95rem] text-ink-soft">
              {/* The patient's own record, not their plans tab: from here the
                  question is usually "who is this and when were they last in". */}
              <Link
                href={`/patients/${plan.patient.id}`}
                className="font-semibold text-ink no-underline hover:text-brand-deep hover:underline"
              >
                {plan.patient.lastName} {plan.patient.firstName}
              </Link>

              {plan.nextBooked ? (
                // Into the diary on that day, rather than merely naming it. The
                // two screens describe the same appointment and only one of them
                // can be changed.
                <Link
                  href={`/appointments?view=day&date=${toDateKey(plan.nextBooked.date)}`}
                  className="flex items-center gap-1.5 font-semibold text-brand-deep no-underline tabular-nums hover:underline"
                >
                  <CalendarCheck size={15} aria-hidden />
                  {slotLabel(plan.nextBooked)}
                </Link>
              ) : isActive ? (
                <span className={cn('font-semibold', plan.stalled ? 'text-warn' : 'text-ink-faint')}>
                  {t('quietFor', { days: plan.quietDays })}
                </span>
              ) : (
                // Closed plans are read newest-first and every one of them wore
                // the same face, so the sort order was invisible and "the sixty
                // most recent" was a claim with nothing behind it.
                <span className="flex items-center gap-1.5 text-ink-faint tabular-nums">
                  <History size={15} aria-hidden />
                  {t('lastUpdated', {
                    date: format.dateTime(plan.updatedAt, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    }),
                  })}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* A rail of its own on a wide card rather than a stretchy column beside
            the title, so every plan's bar starts and ends in the same place and
            the list can be read down as a chart.

            Once it has that rail the count drops underneath rather than sitting
            beside the bar and eating half of it — in Albanian "2 nga 4 të kryera"
            left the bar shorter than the words describing it. */}
        <div
          className={cn(
            'flex items-center gap-3',
            '@[46rem]:col-start-2 @[46rem]:row-start-1 @[46rem]:self-center',
            '@[46rem]:flex-col @[46rem]:items-end @[46rem]:gap-1.5',
          )}
        >
          <div
            className="h-2.5 w-full min-w-0 flex-1 overflow-hidden rounded-full bg-line @[46rem]:flex-none"
            role="progressbar"
            aria-valuenow={plan.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('progress', { done: plan.done, total: plan.relevant })}
          >
            {/* Coloured by what the plan *is*, never by how neglected it is: the
                card around it already carries that, and a bar that changes
                meaning between rows is a bar nobody can read at a glance. */}
            <div
              className={cn(
                'h-full rounded-full transition-[width]',
                plan.status === TreatmentPlanStatus.COMPLETED
                  ? 'bg-ok'
                  : plan.status === TreatmentPlanStatus.CANCELLED
                    ? 'bg-line-strong'
                    : 'bg-brand',
              )}
              style={{ width: `${plan.percent}%` }}
            />
          </div>
          <span className="shrink-0 text-[0.92rem] font-bold text-ink-soft tabular-nums">
            {t('progress', { done: plan.done, total: plan.relevant })}
          </span>
        </div>

        {/* The one step the whole row is about. `next` is null on the archive
            tabs — what a cancelled plan left undone is history, and history does
            not come with buttons. */}
        {next ? (
          <div
            className={cn(
              'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5',
              '@[46rem]:col-span-2',
              // Recessed against whatever the card is: paper inside a white
              // card, white inside a tinted one. A panel the same colour as the
              // thing it sits on is a border pretending to be a panel.
              plan.stalled ? 'border-warn/25 bg-surface' : 'border-line bg-paper',
            )}
          >
            <span className="text-[0.75rem] font-bold tracking-wide text-ink-faint uppercase">
              {t('nextStep')}
            </span>
            <span className="min-w-0 flex-1 basis-48 text-[1.02rem] font-semibold text-ink">
              {next.title}
              {next.toothNum ? (
                <span className="ml-2 text-[0.9rem] font-normal text-ink-soft">
                  {tooth(next.toothNum)}
                </span>
              ) : null}
            </span>

            {next.booked ? (
              <span className="flex items-center gap-1.5 text-[0.92rem] font-semibold text-brand-deep tabular-nums">
                <CalendarCheck size={15} aria-hidden />
                {slotLabel(next.booked)}
              </span>
            ) : null}

            {canEdit ? (
              <div className="flex items-center gap-1.5">
                {bookStep && !next.linked ? bookStep(next) : null}

                <ActionForm
                  action={setStepStatus}
                  values={{ id: next.id, status: TreatmentStepStatus.DONE }}
                >
                  <button type="submit" className="btn btn-secondary btn-sm">
                    <Check size={16} aria-hidden />
                    {t('markDone')}
                  </button>
                </ActionForm>

                <ActionForm
                  action={setStepStatus}
                  values={{ id: next.id, status: TreatmentStepStatus.SKIPPED }}
                >
                  <button type="submit" className="btn btn-ghost btn-sm" title={t('skip')}>
                    <SkipForward size={16} aria-hidden />
                    <span className="sr-only">{t('skip')}</span>
                  </button>
                </ActionForm>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 @[46rem]:col-span-2">
          {/* What is left after the next one, so the row answers "how much more"
              without a second navigation. Anything past the cap is counted rather
              than dropped — "and four more" is information; showing five of nine
              and saying nothing is a wrong answer. */}
          {shown.length > 0 ? (
            <p className="flex min-w-0 flex-wrap items-center gap-1.5">
              <ClipboardList size={15} aria-hidden className="text-ink-faint" />
              {shown.map((step) => (
                <Badge key={step.id} tone={step.linked ? 'brand' : 'neutral'}>
                  {step.title}
                  {step.toothNum ? (
                    <span className="font-normal opacity-80">{tooth(step.toothNum)}</span>
                  ) : null}
                </Badge>
              ))}
              {hidden > 0 ? (
                // `ink-soft`, not `faint`: this is the tail of the same list
                // the chips beside it are, and faint grey lands at 4.5:1 on a
                // stalled card's tint by a hair's breadth.
                <span className="text-[0.88rem] font-semibold text-ink-soft">
                  {t('andMore', { count: hidden })}
                </span>
              ) : null}
            </p>
          ) : null}

          {/* `ml-auto` rather than `justify-between`, which would swing the whole
              cluster left on the rows that have no chips beside it. */}
          <div className="ml-auto flex items-center gap-1.5">
            {/* Adding to a finished plan reopens it — see `saveStep` — which is
                what makes this the right verb for "we missed one", and why it is
                the one thing besides the menu left out on the card. */}
            {canEdit ? (
              <StepFormDialog
                planId={plan.id}
                services={services}
                numbering={numbering}
                triggerClassName="btn btn-secondary btn-sm"
              />
            ) : null}

            <ActionMenu label={tc('moreActions')}>
              {canEdit ? (
                <PlanFormDialog
                  patientId={plan.patient.id}
                  variant="menu"
                  plan={{
                    id: plan.id,
                    title: plan.title,
                    notes: plan.notes,
                    status: plan.status,
                  }}
                />
              ) : null}

              {canEdit && plan.status === TreatmentPlanStatus.CANCELLED ? (
                <ActionForm
                  action={setPlanStatus}
                  values={{ id: plan.id, status: TreatmentPlanStatus.ACTIVE }}
                  className="block"
                >
                  <button type="submit" role="menuitem" className="menu-item">
                    <RotateCcw size={19} aria-hidden className="shrink-0" />
                    {t('reopenPlan')}
                  </button>
                </ActionForm>
              ) : canEdit && isActive ? (
                // The way off a stalled list that is not a lie: ticking off work
                // nobody did, or deleting the record that it was ever planned,
                // were the only two exits this page had.
                <ActionForm
                  action={setPlanStatus}
                  values={{ id: plan.id, status: TreatmentPlanStatus.CANCELLED }}
                  confirmMessage={t('confirmCancelPlan')}
                  className="block"
                >
                  <button type="submit" role="menuitem" className="menu-item">
                    <Ban size={19} aria-hidden className="shrink-0" />
                    {t('cancelPlan')}
                  </button>
                </ActionForm>
              ) : null}

              <Link href={`/plans/${plan.id}/print`} role="menuitem" className="menu-item">
                <Printer size={19} aria-hidden className="shrink-0" />
                {t('print')}
              </Link>

              {canDelete ? (
                <ActionForm
                  action={deletePlan}
                  values={{ id: plan.id }}
                  confirmMessage={tc('confirmDelete')}
                  className="block border-t border-line"
                >
                  <button type="submit" role="menuitem" className="menu-item menu-item-danger">
                    <Trash2 size={19} aria-hidden className="shrink-0" />
                    {tc('delete')}
                  </button>
                </ActionForm>
              ) : null}
            </ActionMenu>
          </div>
        </div>
      </div>
    </li>
  );
}
