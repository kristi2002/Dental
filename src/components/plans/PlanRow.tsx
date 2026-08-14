import {
  Ban,
  CalendarCheck,
  Check,
  ClipboardList,
  RotateCcw,
  SkipForward,
  Trash2,
  TriangleAlert,
  User,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ServiceOption } from '@/components/appointments/AppointmentFormDialog';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { TreatmentPlanStatus, TreatmentStepStatus } from '@/generated/prisma/enums';
import { Link } from '@/i18n/navigation';
import { deletePlan, setPlanStatus, setStepStatus } from '@/lib/actions/plans';
import { toDateKey } from '@/lib/dates';
import { toothLabel, type ToothNumbering } from '@/lib/teeth';
import { cn } from '@/lib/utils';
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
        'card relative px-5 py-5 transition-shadow hover:shadow-pop',
        // Worst-first is the sort order; this is what makes it visible without
        // reading a word. A badge alone puts the whole burden of triage on
        // somebody actually reading each row.
        plan.stalled ? 'border-l-4 border-l-warn bg-warn-soft/40' : '',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
        <div className="min-w-0 flex-1 basis-72">
          {/* The plan is what the row is about, so the plan is the link — and it
              lands on the tab the work is actually done from. */}
          <p className="flex flex-wrap items-center gap-2">
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
          </p>

          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.95rem] text-ink-soft">
            {/* The patient's own record, not their plans tab: from here the
                question is usually "who is this and when were they last in". */}
            <Link
              href={`/patients/${plan.patient.id}`}
              className="flex items-center gap-1.5 font-semibold text-ink no-underline hover:text-brand-deep hover:underline"
            >
              <User size={15} aria-hidden className="text-ink-faint" />
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
              <span
                className={cn('font-semibold', plan.stalled ? 'text-warn' : 'text-ink-faint')}
              >
                {t('quietFor', { days: plan.quietDays })}
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex min-w-44 flex-1 basis-44 items-center gap-3">
          <div
            className="h-2.5 flex-1 overflow-hidden rounded-full bg-paper"
            role="progressbar"
            aria-valuenow={plan.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('progress', { done: plan.done, total: plan.relevant })}
          >
            <div
              className={cn(
                'h-full rounded-full transition-[width]',
                plan.stalled
                  ? 'bg-warn'
                  : plan.status === TreatmentPlanStatus.COMPLETED
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
      </div>

      {/* The one step the whole row is about. `next` is null on the archive
          tabs — what a cancelled plan left undone is history, and history does
          not come with buttons. */}
      {next ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line-strong bg-surface px-3 py-2.5">
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
            <div className="flex items-center gap-1">
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

      <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2">
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
              <span className="text-[0.88rem] font-semibold text-ink-faint">
                {t('andMore', { count: hidden })}
              </span>
            ) : null}
          </p>
        ) : null}

        {canEdit || canDelete ? (
          // `ml-auto` rather than `justify-between`, which would swing the whole
          // cluster left on the rows that have no chips beside it.
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {canEdit ? (
              <>
                {/* Adding to a finished plan reopens it — see `saveStep` — which
                    is what makes this the right verb for "we missed one". */}
                <StepFormDialog planId={plan.id} services={services} numbering={numbering} />

                <PlanFormDialog
                  patientId={plan.patient.id}
                  plan={{
                    id: plan.id,
                    title: plan.title,
                    notes: plan.notes,
                    status: plan.status,
                  }}
                />

                {plan.status === TreatmentPlanStatus.CANCELLED ? (
                  <ActionForm
                    action={setPlanStatus}
                    values={{ id: plan.id, status: TreatmentPlanStatus.ACTIVE }}
                  >
                    <button type="submit" className="btn btn-ghost btn-sm">
                      <RotateCcw size={16} aria-hidden />
                      {t('reopenPlan')}
                    </button>
                  </ActionForm>
                ) : isActive ? (
                  // The way off a stalled list that is not a lie: ticking off
                  // work nobody did, or deleting the record that it was ever
                  // planned, were the only two exits this page had.
                  <ActionForm
                    action={setPlanStatus}
                    values={{ id: plan.id, status: TreatmentPlanStatus.CANCELLED }}
                    confirmMessage={t('confirmCancelPlan')}
                  >
                    <button
                      type="submit"
                      className="btn btn-ghost btn-sm"
                      title={t('cancelPlan')}
                    >
                      <Ban size={16} aria-hidden />
                      <span className="sr-only">{t('cancelPlan')}</span>
                    </button>
                  </ActionForm>
                ) : null}
              </>
            ) : null}

            {canDelete ? (
              <ActionForm
                action={deletePlan}
                values={{ id: plan.id }}
                confirmMessage={tc('confirmDelete')}
              >
                <button
                  type="submit"
                  className="btn btn-ghost btn-sm text-danger"
                  title={tc('delete')}
                >
                  <Trash2 size={16} aria-hidden />
                  <span className="sr-only">{tc('delete')}</span>
                </button>
              </ActionForm>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
