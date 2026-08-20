import { CalendarClock, Check, Printer, TriangleAlert, X } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { AppointmentFormDialog } from '@/components/appointments/AppointmentFormDialog';
import { ChaseDialog } from '@/components/plans/ChaseDialog';
import { PlanFormDialog } from '@/components/plans/PlanFormDialog';
import { SeriesBookingDialog } from '@/components/plans/SeriesBookingDialog';
import { StepList, type StepView } from '@/components/plans/StepList';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { TreatmentPlanStatus, TreatmentStepStatus } from '@/generated/prisma/enums';
import { Link } from '@/i18n/navigation';
import { recordView, requirePermission } from '@/lib/auth/guard';
import { today, toDateKey } from '@/lib/dates';
import { isPromisedSlot, summarisePlan } from '@/lib/plan-progress';
import { prisma } from '@/lib/prisma';
import {
  getClinicProfile,
  getOperatoryOptions,
  getProviderOptions,
  getServiceOptions,
} from '@/lib/queries';
import { can } from '@/lib/auth/session';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const plan = await prisma.treatmentPlan.findUnique({
    where: { id },
    select: { title: true },
  });
  const t = await getTranslations({ locale, namespace: 'plans' });
  return { title: plan ? plan.title : t('allTitle') };
}

/**
 * One course of treatment, on a page of its own.
 *
 * A plan had two homes and no address. It lived as a section inside the
 * patient's plans tab — reached by a link carrying `?tab=plans#plan-<id>`, which
 * lands you in a list of every plan that patient has ever had and then scrolls —
 * and as a row on `/plans` that expands in place. Both are the right thing where
 * they are: the tab is how you read a patient, the list is how you work a
 * queue. Neither is a thing you can send somebody.
 *
 * So the gap was not a missing feature but a missing *noun*. `/plans/[id]/print`
 * existed and `/plans/[id]` did not, which is the giveaway: the plan was
 * addressable enough to print and not addressable enough to open. A course of
 * treatment is six visits over four months, discussed at the desk and chased by
 * phone; it needs a URL somebody can paste into a follow-up, keep in a tab, or
 * come back to after lunch without navigating a patient record to find it.
 *
 * Everything here is the same components the other two screens use — the same
 * `StepList`, the same dialogs, the same actions. This page adds no behaviour of
 * its own on purpose: a third implementation of "which step comes next" is the
 * kind of disagreement nobody reports and everybody stops trusting.
 */
export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('plan.view');

  const t = await getTranslations('plans');
  const format = await getFormatter();

  const canEdit = user.permissions.includes('plan.edit');
  const canDelete = user.permissions.includes('patient.delete');
  const canBook = await can('appointment.edit');

  const plan = await prisma.treatmentPlan.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      steps: {
        orderBy: { position: 'asc' },
        include: { appointment: { select: { date: true, startTime: true, status: true } } },
      },
    },
  });

  if (!plan) notFound();

  // Opening a plan is reading a patient's clinical record, and the trail is
  // supposed to be able to answer who looked at one. `recordView` folds repeats
  // by the same person into one line per half hour.
  await recordView(user, {
    entity: 'plan',
    entityId: plan.id,
    summary: `Opened plan ${plan.title} for ${plan.patient.lastName} ${plan.patient.firstName}`,
  });

  const now = today();
  const summary = summarisePlan(plan, now);

  // Only for the people who can press something. A read-only account has no use
  // for the catalogue or the diary's chairs and no reason to be sent either.
  const [services, staff, operatories, profile] = await Promise.all([
    canEdit || canBook ? getServiceOptions() : Promise.resolve([]),
    canBook ? getProviderOptions() : Promise.resolve([]),
    canBook ? getOperatoryOptions() : Promise.resolve([]),
    getClinicProfile(),
  ]);

  const steps: StepView[] = plan.steps.map((step) => ({
    id: step.id,
    title: step.title,
    toothNum: step.toothNum,
    notes: step.notes ?? '',
    status: step.status,
    serviceId: step.serviceId,
    linked: step.appointmentId !== null,
    booked: isPromisedSlot(step.appointment, now)
      ? { date: step.appointment.date, startTime: step.appointment.startTime }
      : null,
  }));

  const patientName = `${plan.patient.lastName} ${plan.patient.firstName}`;
  const isActive = plan.status === TreatmentPlanStatus.ACTIVE;
  const pending = steps.filter((step) => step.status === TreatmentStepStatus.PENDING);
  const bookable = pending.filter((step) => !step.linked).length;

  /**
   * The booking dialog for each step that could take one, built here on the
   * server for the reason the other two screens build theirs:
   * `AppointmentFormDialog` needs the catalogue, the providers and the chairs,
   * `StepList` is a client component, and a function cannot cross that boundary.
   */
  const bookSlots: Record<string, React.ReactNode> = {};
  if (canBook && isActive) {
    for (const step of pending) {
      if (step.linked) continue;
      bookSlots[step.id] = (
        <AppointmentFormDialog
          // See the practice-wide list: a server-built element lands in the
          // step row's button list without a key of its own.
          key={step.id}
          services={services}
          staff={staff}
          operatories={operatories}
          defaultPatient={{ id: plan.patient.id, name: patientName }}
          defaultDate={toDateKey(today())}
          planStepId={step.id}
          triggerClassName="btn btn-secondary btn-sm"
          triggerLabel={t('bookStep')}
        />
      );
    }
  }

  const dayLabel = (date: Date) =>
    format.dateTime(date, { day: 'numeric', month: 'short' });

  return (
    <>
      <PageHeader
        title={plan.title}
        subtitle={patientName}
        trail={[{ href: '/plans', label: t('allTitle') }, { label: plan.title }]}
        actions={
          <>
            {canEdit && isActive && bookable > 0 ? (
              <SeriesBookingDialog
                planId={plan.id}
                pending={bookable}
                staff={staff}
                operatories={operatories}
                triggerClassName="btn btn-secondary"
                trigger={
                  <>
                    <CalendarClock size={20} aria-hidden />
                    {t('bookSeries')}
                  </>
                }
              />
            ) : null}
            {canEdit && isActive ? (
              <ChaseDialog
                planId={plan.id}
                followUpOn={summary.followUpOn}
                triggerClassName="btn btn-secondary"
                trigger={
                  <>
                    <CalendarClock size={20} aria-hidden />
                    {summary.followUpOn ? t('chaseAgain') : t('chase')}
                  </>
                }
              />
            ) : null}
            {canEdit ? (
              <PlanFormDialog
                patientId={plan.patient.id}
                plan={{ id: plan.id, title: plan.title, notes: plan.notes ?? '' }}
                triggerClassName="btn btn-secondary"
              />
            ) : null}
            <Link href={`/plans/${plan.id}/print`} className="btn btn-secondary">
              <Printer size={20} aria-hidden />
              {t('print')}
            </Link>
          </>
        }
      />

      <div className="grid gap-5">
        <Card>
          <CardBody>
            <div className="flex flex-wrap items-center gap-2">
              {plan.status === TreatmentPlanStatus.COMPLETED ? (
                <Badge tone="ok">
                  <Check size={14} aria-hidden />
                  {t('status_COMPLETED')}
                </Badge>
              ) : plan.status === TreatmentPlanStatus.CANCELLED ? (
                <Badge>
                  <X size={14} aria-hidden />
                  {t('status_CANCELLED')}
                </Badge>
              ) : (
                <Badge tone="brand">{t('status_ACTIVE')}</Badge>
              )}
              {summary.stalled ? (
                <Badge tone="warn">
                  <TriangleAlert size={14} aria-hidden />
                  {t('stalled')}
                </Badge>
              ) : null}
              {summary.snoozed && summary.followUpOn ? (
                <Badge>
                  <CalendarClock size={14} aria-hidden />
                  {t('chasingOn', { date: dayLabel(summary.followUpOn) })}
                </Badge>
              ) : null}
              <Link
                href={`/patients/${plan.patient.id}`}
                className="text-[1rem] font-semibold text-brand-deep"
              >
                {t('forPatient')}: {patientName}
              </Link>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div
                className="h-2.5 min-w-44 flex-1 overflow-hidden rounded-full bg-paper"
                role="progressbar"
                aria-valuenow={summary.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t('progress', { done: summary.done, total: summary.relevant })}
              >
                <div
                  className={cn(
                    'h-full rounded-full transition-[width]',
                    summary.stalled
                      ? 'bg-warn'
                      : plan.status === TreatmentPlanStatus.COMPLETED
                        ? 'bg-ok'
                        : plan.status === TreatmentPlanStatus.CANCELLED
                          ? 'bg-line-strong'
                          : 'bg-brand',
                  )}
                  style={{ width: `${summary.percent}%` }}
                />
              </div>
              <span className="shrink-0 text-[0.95rem] font-bold text-ink-soft tabular-nums">
                {t('progress', { done: summary.done, total: summary.relevant })}
              </span>
            </div>

            <p className="mt-3 text-[1rem] text-ink-soft">
              {summary.next ? (
                <Link
                  href={`/appointments?view=day&date=${toDateKey(summary.next.appointment!.date)}`}
                  className="font-semibold"
                >
                  {t('nextOn', {
                    date: dayLabel(summary.next.appointment!.date),
                    time: summary.next.appointment!.startTime,
                  })}
                </Link>
              ) : (
                // What the stalled badge is measuring, said in words — a badge
                // tells you something is wrong, this tells you how long for.
                <span className={summary.stalled ? 'font-semibold text-warn' : undefined}>
                  {t('quietFor', { days: summary.quietDays })}
                </span>
              )}
            </p>

            {plan.notes ? (
              <p className="mt-4 whitespace-pre-wrap text-[1.02rem] text-ink-soft">{plan.notes}</p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('steps')} />
          <CardBody>
            {steps.length === 0 ? (
              <p className="text-[1.05rem] text-ink-soft">{t('noStepsYet')}</p>
            ) : (
              <StepList
                planId={plan.id}
                steps={steps}
                canEdit={canEdit && isActive}
                canDelete={canDelete && isActive}
                services={services}
                numbering={profile.toothNumbering}
                bookSlots={bookSlots}
              />
            )}
          </CardBody>
        </Card>
      </div>

      <p className="mt-5 text-[0.95rem] text-ink-faint">
        {t('startedOn', {
          date: format.dateTime(plan.createdAt, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }),
        })}
      </p>
    </>
  );
}
