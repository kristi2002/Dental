'use client';

import {
  Ban,
  CalendarCheck,
  Copy,
  CalendarClock,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  History,
  PhoneCall,
  Printer,
  RotateCcw,
  SkipForward,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import type {
  OperatoryOption,
  ServiceOption,
  StaffOption,
} from '@/components/appointments/AppointmentFormDialog';
import { useDateNames } from '@/components/shared/DateNamesProvider';
import { ReportingActionForm } from '@/components/ui/ActionForm';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Badge } from '@/components/ui/Badge';
import { TreatmentPlanStatus, TreatmentStepStatus } from '@/generated/prisma/enums';
import { Link } from '@/i18n/navigation';
import { deletePlan, duplicatePlan, setPlanStatus, setStepStatus } from '@/lib/actions/plans';
import { toDateKey } from '@/lib/dates';
import { toothLabel, type ToothNumbering } from '@/lib/teeth';
import { cn, initials } from '@/lib/utils';
import { ChaseDialog } from './ChaseDialog';
import { PlanFormDialog } from './PlanFormDialog';
import { SeriesBookingDialog } from './SeriesBookingDialog';
import { StepFormDialog } from './StepFormDialog';
import { StepList, type StepView } from './StepList';

/**
 * How many of the *remaining* steps are named before the rest become a count.
 * The next one is spelled out above them, so five here reads as a glance.
 */
const MAX_CHIPS = 5;

/** A slot, as this row needs to print and link to it. */
export type PlanRowSlot = { date: Date; startTime: string };

export type PlanRowStep = StepView;

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
  /** Parked until a day that has not arrived. See `chasePlan`. */
  snoozed: boolean;
  followUpOn: Date | null;
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
 * And beyond the next step, too. The row acted on `pending[0]` and nothing else,
 * so ticking off step three out of order, correcting a title, or putting the
 * sequence right still meant leaving the screen — which is the same two
 * navigations wearing a different hat. Opening the row hands over the whole
 * plan, on the same `StepList` the patient's own record uses.
 */
export function PlanRow({
  plan,
  canEdit,
  canDelete,
  canBook,
  services,
  staff = [],
  operatories = [],
  numbering,
  bookSlots,
}: {
  plan: PlanRowView;
  canEdit: boolean;
  canDelete: boolean;
  canBook?: boolean;
  /** The catalogue, so a step added from here is picked rather than typed. */
  services: ServiceOption[];
  staff?: StaffOption[];
  operatories?: OperatoryOption[];
  numbering: ToothNumbering;
  /**
   * The booking dialog for each step, by step id, rendered on the server for the
   * same reason the patient tab passes them: booking needs the diary's providers
   * and chairs, and a plan list should not load them to reach a button.
   */
  bookSlots?: Record<string, ReactNode>;
}) {
  const t = useTranslations('plans');
  const tc = useTranslations('common');
  const tt = useTranslations('teeth');
  // Month names, which the browser may not have in the practice's own
  // language. See `lib/date-names.ts`.
  const dates = useDateNames();

  const [open, setOpen] = useState(false);

  const isActive = plan.status === TreatmentPlanStatus.ACTIVE;
  const pending = plan.steps.filter((step) => step.status === TreatmentStepStatus.PENDING);

  // A plan is a sequence, so "what is left" has a front. Everything the collapsed
  // row offers to do points at this one step; the rest stay chips until it is
  // opened.
  //
  // Only while the plan is running, though: a cancelled one gets no buttons, and
  // if the front step were still held back for a strip that is never drawn, the
  // work it was abandoned partway through would disappear off the row entirely —
  // which is the one thing the cancelled tab is read to find out.
  const next = isActive ? (pending[0] ?? null) : null;
  const rest = next ? pending.slice(1) : pending;
  const shown = rest.slice(0, MAX_CHIPS);
  const hidden = rest.length - shown.length;
  const bookable = pending.filter((step) => !step.linked).length;

  const slotLabel = (slot: PlanRowSlot) =>
    t('nextOn', {
      date: dates.date(slot.date, 'dayMonthShort'),
      time: slot.startTime,
    });

  const dayLabel = (day: Date) => dates.date(day, 'dayMonthShort');

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
        //
        // A parked plan is the opposite errand and gets the opposite treatment:
        // it recedes onto the page's own paper, because somebody has already
        // dealt with it and the promise they made is the reason it is quiet.
        plan.stalled
          ? 'border-warn/35 bg-warn-soft/50'
          : plan.snoozed
            ? 'border-line bg-paper/60 hover:border-line-strong'
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
                the way the eye does. It lands on the plan's own page rather than
                at the top of a tab holding every plan this patient has ever had.
                It used to point at `/patients/<id>?tab=plans#plan-<id>`, which
                was the closest thing to an address a plan had before it had
                one. */}
            <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <Link
                href={`/plans/${plan.id}`}
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
              {plan.snoozed && plan.followUpOn ? (
                <Badge>
                  <CalendarClock size={14} aria-hidden />
                  {t('chasingOn', { date: dayLabel(plan.followUpOn) })}
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
                    date: dates.date(plan.updatedAt, 'dayMonthShortYear'),
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

        {/* The one step the whole row is about, while the row is shut. `next` is
            null on the archive tabs — what a cancelled plan left undone is history,
            and history does not come with buttons. */}
        {next && !open ? (
          <div
            className={cn(
              'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2.5',
              '@[46rem]:col-span-2',
              // Recessed against whatever the card is: paper inside a white card,
              // white inside a tinted one. A panel the same colour as the thing it
              // sits on is a border pretending to be a panel.
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
                {!next.linked ? bookSlots?.[next.id] : null}

                <ReportingActionForm
                  action={setStepStatus}
                  values={{ id: next.id, status: TreatmentStepStatus.DONE }}
                >
                  <button type="submit" className="btn btn-secondary btn-sm">
                    <Check size={16} aria-hidden />
                    {t('markDone')}
                  </button>
                </ReportingActionForm>

                <ReportingActionForm
                  action={setStepStatus}
                  values={{ id: next.id, status: TreatmentStepStatus.SKIPPED }}
                >
                  <button type="submit" className="btn btn-ghost btn-sm" title={t('skip')}>
                    <SkipForward size={16} aria-hidden />
                    <span className="sr-only">{t('skip')}</span>
                  </button>
                </ReportingActionForm>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Every step, with everything that can be done to any of them. This is
            what the row was missing: triage found the plan and then had nowhere to
            put "the third one is done and the fifth was never needed". */}
        {open ? (
          <div className="@[46rem]:col-span-2">
            <StepList
              planId={plan.id}
              steps={plan.steps}
              canEdit={canEdit}
              canDelete={canDelete}
              services={services}
              numbering={numbering}
              bookSlots={bookSlots}
              compact
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 @[46rem]:col-span-2">
          {/* What is left after the next one, so the row answers "how much more"
              without a second navigation. Anything past the cap is counted rather
              than dropped — "and four more" is information; showing five of nine
              and saying nothing is a wrong answer. */}
          {shown.length > 0 && !open ? (
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
                <span className="text-[0.88rem] font-semibold text-ink-soft">
                  {t('andMore', { count: hidden })}
                </span>
              ) : null}
            </p>
          ) : null}

          {/* `ml-auto` rather than `justify-between`, which would swing the whole
              cluster left on the rows that have no chips beside it. */}
          <div className="ml-auto flex flex-wrap items-center gap-1">
            {plan.steps.length > 0 ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
              >
                {open ? (
                  <ChevronDown size={16} aria-hidden />
                ) : (
                  <ChevronRight size={16} aria-hidden />
                )}
                {open ? t('hideSteps') : t('showSteps', { count: plan.steps.length })}
              </button>
            ) : null}

            {canEdit ? (
              <>
                {/* Adding to a finished plan reopens it — see `saveStep` — which
                    is what makes this the right verb for "we missed one". */}
                <StepFormDialog
                  planId={plan.id}
                  services={services}
                  numbering={numbering}
                  triggerClassName="btn btn-secondary btn-sm"
                />

                {/* The whole outstanding run, in one pass through one form. */}
                {canBook && isActive && bookable > 1 ? (
                  <SeriesBookingDialog
                    planId={plan.id}
                    pending={bookable}
                    staff={staff}
                    operatories={operatories}
                    triggerClassName="btn btn-ghost btn-sm"
                    trigger={
                      <>
                        <CalendarPlus size={16} aria-hidden />
                        {t('bookSeries')}
                      </>
                    }
                  />
                ) : null}

                {/* The exit this list never had. Stalled asks "has anybody done
                    anything", and ringing a patient is not something anybody can
                    do to a plan — so the only ways to quieten a row were to tick
                    off treatment nobody gave or to abandon a course the patient
                    still means to finish. */}
                {isActive ? (
                  <ChaseDialog
                    planId={plan.id}
                    followUpOn={plan.followUpOn}
                    triggerClassName="btn btn-ghost btn-sm"
                    trigger={
                      <>
                        <PhoneCall size={16} aria-hidden />
                        {plan.snoozed ? t('chaseAgain') : t('chase')}
                      </>
                    }
                  />
                ) : null}
              </>
            ) : null}

            <ActionMenu label={tc('moreActions')} triggerClassName="btn btn-ghost btn-sm">
              <Link href={`/plans/${plan.id}/print`} className="menu-item" role="menuitem">
                <Printer size={18} aria-hidden className="shrink-0" />
                {t('print')}
              </Link>

              {canEdit ? (
                <div className="border-t border-line">
                  <PlanFormDialog
                    patientId={plan.patient.id}
                    triggerClassName="menu-item"
                    plan={{ id: plan.id, title: plan.title, notes: plan.notes }}
                  />
                </div>
              ) : null}

              {/* The same course again, for the same patient — perio maintenance
                  comes round every year and was retyped every year. The copy is
                  the intention, not the history: every step comes back
                  outstanding and unbooked. */}
              {canEdit ? (
                <ReportingActionForm
                  action={duplicatePlan}
                  values={{ sourceId: plan.id, patientId: plan.patient.id }}
                  className="block border-t border-line"
                >
                  <button type="submit" role="menuitem" className="menu-item">
                    <Copy size={18} aria-hidden className="shrink-0" />
                    {t('copyPlan')}
                  </button>
                </ReportingActionForm>
              ) : null}

              {canEdit && plan.status === TreatmentPlanStatus.CANCELLED ? (
                <ReportingActionForm
                  action={setPlanStatus}
                  values={{ id: plan.id, status: TreatmentPlanStatus.ACTIVE }}
                  className="block border-t border-line"
                >
                  <button type="submit" role="menuitem" className="menu-item">
                    <RotateCcw size={18} aria-hidden className="shrink-0" />
                    {t('reopenPlan')}
                  </button>
                </ReportingActionForm>
              ) : null}

              {canEdit && isActive ? (
                // The way off a stalled list that is not a lie: ticking off work
                // nobody did, or deleting the record that it was ever planned,
                // were the only two exits this page had.
                <ReportingActionForm
                  action={setPlanStatus}
                  values={{ id: plan.id, status: TreatmentPlanStatus.CANCELLED }}
                  confirmMessage={t('confirmCancelPlan')}
                  className="block border-t border-line"
                >
                  <button type="submit" role="menuitem" className="menu-item">
                    <Ban size={18} aria-hidden className="shrink-0" />
                    {t('cancelPlan')}
                  </button>
                </ReportingActionForm>
              ) : null}

              {canDelete ? (
                <ReportingActionForm
                  action={deletePlan}
                  values={{ id: plan.id }}
                  confirmMessage={tc('confirmDelete')}
                  className="block border-t border-line"
                >
                  <button type="submit" role="menuitem" className="menu-item menu-item-danger">
                    <Trash2 size={18} aria-hidden className="shrink-0" />
                    {tc('delete')}
                  </button>
                </ReportingActionForm>
              ) : null}
            </ActionMenu>
          </div>
        </div>
      </div>
    </li>
  );
}
