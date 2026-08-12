import { CalendarCheck, ClipboardList, ListChecks, TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import {
  AppointmentStatus,
  TreatmentPlanStatus,
  TreatmentStepStatus,
} from '@/generated/prisma/enums';
import { requirePermission } from '@/lib/auth/guard';
import { today } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * A plan is stalled once this long has passed with nothing done and nothing
 * booked. Two months is roughly the point at which a patient stops thinking of
 * themselves as mid-treatment.
 */
const STALLED_DAYS = 60;

type Filter = 'open' | 'stalled' | 'completed';
const FILTERS: Filter[] = ['open', 'stalled', 'completed'];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'plans' });
  return { title: t('allTitle') };
}

/**
 * Every course of treatment the practice has going, across all patients.
 *
 * A treatment plan exists so that a half-finished course stays visible instead
 * of being remembered by one person — but until now the only way to see one was
 * to already be looking at the patient it belonged to, which means the plans
 * that get forgotten are exactly the ones nobody opens. This is the screen that
 * asks the question the feature was built to answer: what did we start and never
 * finish?
 */
export default async function PlansPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission('plan.view');

  const t = await getTranslations('plans');
  const format = await getFormatter();

  const { filter: rawFilter } = await searchParams;
  const filter: Filter = FILTERS.includes(rawFilter as Filter) ? (rawFilter as Filter) : 'open';

  const now = today();

  const plans = await prisma.treatmentPlan.findMany({
    where: {
      status:
        filter === 'completed' ? TreatmentPlanStatus.COMPLETED : TreatmentPlanStatus.ACTIVE,
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      steps: {
        orderBy: { position: 'asc' },
        include: { appointment: { select: { date: true, startTime: true, status: true } } },
      },
    },
  });

  const rows = plans.map((plan) => {
    const relevant = plan.steps.filter((s) => s.status !== TreatmentStepStatus.SKIPPED);
    const done = plan.steps.filter((s) => s.status === TreatmentStepStatus.DONE);

    // The soonest slot any outstanding step is booked into. A plan with one of
    // these is not stalled however long it has been quiet — it is simply waiting
    // for a date that has not arrived.
    const next = plan.steps
      .filter(
        (s) =>
          s.status === TreatmentStepStatus.PENDING &&
          s.appointment !== null &&
          s.appointment.date >= now &&
          (s.appointment.status === AppointmentStatus.SCHEDULED ||
            s.appointment.status === AppointmentStatus.ARRIVED),
      )
      .sort((a, b) => a.appointment!.date.getTime() - b.appointment!.date.getTime())[0];

    // When something last actually happened. A plan created and never touched
    // counts from its own creation, so it cannot hide by having no history.
    const lastActivity = done.reduce<Date>(
      (latest, step) =>
        step.completedAt && step.completedAt > latest ? step.completedAt : latest,
      plan.createdAt,
    );
    const quietDays = Math.floor((now.getTime() - lastActivity.getTime()) / 86_400_000);

    const stalled =
      plan.status === TreatmentPlanStatus.ACTIVE && !next && quietDays >= STALLED_DAYS;

    return { plan, relevant: relevant.length, done: done.length, next, quietDays, stalled };
  });

  const stalledCount = rows.filter((row) => row.stalled).length;

  const visible = (filter === 'stalled' ? rows.filter((row) => row.stalled) : rows).sort(
    (a, b) => {
      // Worst first: stalled before merely open, then longest-quiet first. A
      // list that opens on the thing least likely to be chased is the point.
      if (a.stalled !== b.stalled) return a.stalled ? -1 : 1;
      return b.quietDays - a.quietDays;
    },
  );

  return (
    <>
      <PageHeader title={t('allTitle')} subtitle={t('allSubtitle')} />

      <nav className="mb-4 flex flex-wrap gap-2" aria-label={t('status')}>
        {FILTERS.map((option) => (
          <Link
            key={option}
            href={option === 'open' ? '/plans' : `/plans?filter=${option}`}
            aria-current={option === filter ? 'page' : undefined}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-[0.92rem] font-semibold no-underline transition-colors',
              option === filter
                ? 'border-brand bg-brand-soft text-brand-deep'
                : 'border-line-strong text-ink-soft hover:border-ink hover:text-ink',
            )}
          >
            {t(`filter_${option}`)}
            {option === 'stalled' && stalledCount > 0 ? ` (${stalledCount})` : ''}
          </Link>
        ))}
      </nav>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ListChecks size={40} aria-hidden />}
            title={filter === 'stalled' ? t('noneStalled') : t('allEmpty')}
          />
        </Card>
      ) : (
        <ul className="card divide-y-2 divide-line">
          {visible.map(({ plan, relevant, done, next, quietDays, stalled }) => {
            const percent = relevant === 0 ? 0 : Math.round((done / relevant) * 100);

            return (
              <li key={plan.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-[1.1rem] font-bold text-ink">{plan.title}</span>
                      {stalled ? (
                        <Badge tone="warn">
                          <TriangleAlert size={14} aria-hidden />
                          {t('stalled')}
                        </Badge>
                      ) : null}
                    </p>

                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.95rem] text-ink-soft">
                      {/* The plan is the thing being listed, but the patient is
                          what you act on — so their record is one tap away. */}
                      <Link
                        href={`/patients/${plan.patient.id}?tab=plans`}
                        className="font-semibold text-ink"
                      >
                        {plan.patient.lastName} {plan.patient.firstName}
                      </Link>

                      {next ? (
                        <span className="flex items-center gap-1.5 font-semibold text-brand-deep tabular-nums">
                          <CalendarCheck size={15} aria-hidden />
                          {t('nextOn', {
                            date: format.dateTime(next.appointment!.date, {
                              day: 'numeric',
                              month: 'short',
                              timeZone: 'UTC',
                            }),
                            time: next.appointment!.startTime,
                          })}
                        </span>
                      ) : plan.status === TreatmentPlanStatus.ACTIVE ? (
                        <span className={cn('font-semibold', stalled ? 'text-warn' : 'text-ink-faint')}>
                          {t('quietFor', { days: quietDays })}
                        </span>
                      ) : null}
                    </p>
                  </div>

                  <div className="flex min-w-40 flex-1 basis-40 items-center gap-3">
                    <div
                      className="h-2.5 flex-1 overflow-hidden rounded-full bg-paper"
                      role="progressbar"
                      aria-valuenow={percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={t('progress', { done, total: relevant })}
                    >
                      <div
                        className={cn(
                          'h-full rounded-full transition-[width]',
                          stalled ? 'bg-warn' : 'bg-brand',
                        )}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-[0.92rem] font-bold text-ink-soft tabular-nums">
                      {t('progress', { done, total: relevant })}
                    </span>
                  </div>
                </div>

                {/* The outstanding work itself, so the list answers "what is
                    left" without a second navigation. */}
                {plan.status === TreatmentPlanStatus.ACTIVE ? (
                  <p className="mt-2 flex flex-wrap items-center gap-1.5">
                    <ClipboardList size={15} aria-hidden className="text-ink-faint" />
                    {plan.steps
                      .filter((step) => step.status === TreatmentStepStatus.PENDING)
                      .slice(0, 6)
                      .map((step) => (
                        <Badge key={step.id} tone={step.appointment ? 'brand' : 'neutral'}>
                          {step.title}
                        </Badge>
                      ))}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
