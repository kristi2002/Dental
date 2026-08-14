import { CalendarCheck, ClipboardList, ListChecks, TriangleAlert, User } from 'lucide-react';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { TreatmentPlanStatus, TreatmentStepStatus } from '@/generated/prisma/enums';
import { requirePermission } from '@/lib/auth/guard';
import { today } from '@/lib/dates';
import { summarisePlan, worstFirst } from '@/lib/plan-progress';
import { prisma } from '@/lib/prisma';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Filter = 'open' | 'stalled' | 'completed';
const FILTERS: Filter[] = ['open', 'stalled', 'completed'];

/**
 * How many outstanding steps are named on a row before the rest become a count.
 * Six is about as many as reads as a glance rather than a list.
 */
const MAX_CHIPS = 6;

/**
 * Finished plans are history and grow without bound, so the archive tab is
 * capped — and says so, rather than quietly showing a slice as if it were all.
 */
const COMPLETED_LIMIT = 60;

const PLAN_INCLUDE = {
  patient: { select: { id: true, firstName: true, lastName: true } },
  steps: {
    orderBy: { position: 'asc' },
    include: { appointment: { select: { date: true, startTime: true, status: true } } },
  },
} as const;

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

  // The open plans are loaded whichever tab is showing, because they are what
  // the two counts on the other tabs are counts *of* — the stalled badge used to
  // read zero while the finished tab was open, which is the one moment it most
  // needs to still be shouting.
  const [active, completed, completedCount] = await Promise.all([
    prisma.treatmentPlan.findMany({
      where: { status: TreatmentPlanStatus.ACTIVE },
      include: PLAN_INCLUDE,
    }),
    filter === 'completed'
      ? prisma.treatmentPlan.findMany({
          where: { status: TreatmentPlanStatus.COMPLETED },
          orderBy: { updatedAt: 'desc' },
          take: COMPLETED_LIMIT,
          include: PLAN_INCLUDE,
        })
      : Promise.resolve([]),
    prisma.treatmentPlan.count({ where: { status: TreatmentPlanStatus.COMPLETED } }),
  ]);

  const summarise = (plans: typeof active) =>
    plans.map((plan) => ({ plan, ...summarisePlan(plan, now) }));

  const openRows = summarise(active);
  const stalledCount = openRows.filter((row) => row.stalled).length;

  const counts: Record<Filter, number> = {
    open: openRows.length,
    stalled: stalledCount,
    completed: completedCount,
  };

  // Finished plans are read newest-first — the archive answers "what did we wrap
  // up", not "what is being neglected", and nothing in it can be stalled.
  const visible =
    filter === 'completed'
      ? summarise(completed)
      : (filter === 'stalled' ? openRows.filter((row) => row.stalled) : openRows).sort(worstFirst);

  return (
    <>
      <PageHeader
        title={t('allTitle')}
        subtitle={t('allSubtitle')}
        trail={[{ label: t('allTitle') }]}
      />

      <nav className="mb-4 flex flex-wrap gap-2" aria-label={t('status')}>
        {FILTERS.map((option) => (
          <Link
            key={option}
            href={option === 'open' ? '/plans' : `/plans?filter=${option}`}
            aria-current={option === filter ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2 rounded-full border py-1.5 pr-2.5 pl-3.5',
              'text-[0.92rem] font-semibold no-underline transition-colors',
              option === filter
                ? 'border-brand bg-brand-soft text-brand-deep'
                : 'border-line-strong text-ink-soft hover:border-ink hover:text-ink',
              // The stalled tab is the one with a consequence, so its count is
              // coloured even when the tab is not the one being read.
              option === 'stalled' && option !== filter && counts.stalled > 0
                ? 'border-warn text-warn'
                : '',
            )}
          >
            {t(`filter_${option}`)}
            <span
              className={cn(
                'rounded-full px-1.5 py-px text-[0.82rem] font-bold tabular-nums',
                option === filter
                  ? 'bg-brand text-white'
                  : option === 'stalled' && counts.stalled > 0
                    ? 'bg-warn-soft text-warn'
                    : 'bg-paper text-ink-faint',
              )}
            >
              {counts[option]}
            </span>
          </Link>
        ))}
      </nav>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ListChecks size={40} aria-hidden />}
            title={
              filter === 'stalled'
                ? t('noneStalled')
                : filter === 'completed'
                  ? t('noneCompleted')
                  : t('allEmpty')
            }
          />
        </Card>
      ) : (
        <ul className="card divide-y-2 divide-line">
          {visible.map(({ plan, relevant, done, percent, next, quietDays, stalled }) => (
            <li
              key={plan.id}
              className={cn(
                'relative px-5 py-4 transition-colors first:rounded-t-[var(--radius-card)]',
                'last:rounded-b-[var(--radius-card)] hover:bg-surface-soft',
                // Worst-first is the sort order; this is what makes it visible
                // without reading a word. A badge alone puts the whole burden of
                // triage on someone actually reading each row.
                stalled ? 'border-l-4 border-l-warn bg-warn-soft/40' : '',
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-x-5 gap-y-3">
                <div className="min-w-0 flex-1 basis-72">
                  {/* The plan is what the row is about, so the plan is the link —
                      and it lands on the tab the work is actually done from. */}
                  <p className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/patients/${plan.patient.id}?tab=plans`}
                      className="text-[1.1rem] font-bold text-ink no-underline hover:text-brand-deep hover:underline"
                    >
                      {plan.title}
                    </Link>
                    {stalled ? (
                      <Badge tone="warn">
                        <TriangleAlert size={14} aria-hidden />
                        {t('stalled')}
                      </Badge>
                    ) : null}
                  </p>

                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.95rem] text-ink-soft">
                    <span className="flex items-center gap-1.5 font-semibold text-ink">
                      <User size={15} aria-hidden className="text-ink-faint" />
                      {plan.patient.lastName} {plan.patient.firstName}
                    </span>

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
                      <span
                        className={cn('font-semibold', stalled ? 'text-warn' : 'text-ink-faint')}
                      >
                        {t('quietFor', { days: quietDays })}
                      </span>
                    ) : null}
                  </p>
                </div>

                <div className="flex min-w-44 flex-1 basis-44 items-center gap-3">
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
                <PendingSteps
                  steps={plan.steps}
                  moreLabel={(count) => t('andMore', { count })}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {/* Said out loud rather than left as a silent slice: a capped list that
          looks complete is worse than one that admits its edge. */}
      {filter === 'completed' && completedCount > COMPLETED_LIMIT ? (
        <p className="mt-3 text-[0.92rem] text-ink-faint">
          {t('showingRecent', { count: COMPLETED_LIMIT, total: completedCount })}
        </p>
      ) : null}
    </>
  );
}

/**
 * What is left on this plan, as chips. Anything past the cap is counted rather
 * than dropped — "and four more" is information; showing six of ten and saying
 * nothing is a wrong answer.
 */
function PendingSteps({
  steps,
  moreLabel,
}: {
  steps: Array<{ id: string; title: string; status: TreatmentStepStatus; appointmentId?: string | null }>;
  moreLabel: (count: number) => string;
}) {
  const pending = steps.filter((step) => step.status === TreatmentStepStatus.PENDING);
  if (pending.length === 0) return null;

  const shown = pending.slice(0, MAX_CHIPS);
  const hidden = pending.length - shown.length;

  return (
    <p className="mt-2.5 flex flex-wrap items-center gap-1.5">
      <ClipboardList size={15} aria-hidden className="text-ink-faint" />
      {shown.map((step) => (
        <Badge key={step.id} tone={step.appointmentId ? 'brand' : 'neutral'}>
          {step.title}
        </Badge>
      ))}
      {hidden > 0 ? (
        <span className="text-[0.88rem] font-semibold text-ink-faint">{moreLabel(hidden)}</span>
      ) : null}
    </p>
  );
}
