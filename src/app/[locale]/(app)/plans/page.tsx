import { ListChecks, Search, X } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AppointmentFormDialog } from '@/components/appointments/AppointmentFormDialog';
import { PlanFormDialog } from '@/components/plans/PlanFormDialog';
import { PlanRow, type PlanRowStep, type PlanRowView } from '@/components/plans/PlanRow';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import type { Prisma } from '@/generated/prisma/client';
import { TreatmentPlanStatus } from '@/generated/prisma/enums';
import { requirePermission } from '@/lib/auth/guard';
import { toDateKey, today } from '@/lib/dates';
import { isPromisedSlot, summarisePlan, worstFirst } from '@/lib/plan-progress';
import { prisma } from '@/lib/prisma';
import {
  getClinicProfile,
  getOperatoryOptions,
  getProviderOptions,
  getServiceOptions,
} from '@/lib/queries';
import { cn, matches } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Filter = 'open' | 'stalled' | 'completed' | 'cancelled';
const FILTERS: Filter[] = ['open', 'stalled', 'completed', 'cancelled'];

/** The two tabs that hold history rather than work. */
const isArchive = (filter: Filter) => filter === 'completed' || filter === 'cancelled';

/**
 * Closed plans are history and grow without bound, so the archive tabs are
 * capped — and say so, rather than quietly showing a slice as if it were all.
 */
const ARCHIVE_LIMIT = 60;

/**
 * How deep a search goes into the archive. A search that only looked at the
 * sixty most recent finished plans would answer "no such plan" about one that is
 * sitting there, which is worse than not offering the search at all.
 */
const ARCHIVE_SEARCH_SCAN = 500;

const PLAN_INCLUDE = {
  patient: { select: { id: true, firstName: true, lastName: true } },
  steps: {
    orderBy: { position: 'asc' },
    include: { appointment: { select: { date: true, startTime: true, status: true } } },
  },
} as const;

type LoadedPlan = Prisma.TreatmentPlanGetPayload<{ include: typeof PLAN_INCLUDE }>;

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
 *
 * And then answers it with something to press. Every verb a plan has — tick the
 * step off, put it in the diary, add the one that was missed, stop chasing it
 * altogether — is on the row, because a triage list whose only affordance is a
 * link to somewhere else is a list that gets read and not worked.
 */
export default async function PlansPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('plan.view');
  const canEdit = user.permissions.includes('plan.edit');
  const canDelete = user.permissions.includes('patient.delete');
  const canBook = user.permissions.includes('appointment.edit');

  const t = await getTranslations('plans');
  const tc = await getTranslations('common');

  const { filter: rawFilter, q } = await searchParams;
  const filter: Filter = FILTERS.includes(rawFilter as Filter) ? (rawFilter as Filter) : 'open';
  const query = (q ?? '').trim();
  const searching = query.length > 0;

  const now = today();

  // The open plans are loaded whichever tab is showing, because they are what
  // the two counts on the other tabs are counts *of* — the stalled badge used to
  // read zero while the finished tab was open, which is the one moment it most
  // needs to still be shouting.
  //
  // The archives are loaded when their own tab is open, and additionally
  // whenever a search is running: a tab count that ignores the search is a count
  // of something nobody asked for.
  const archive = (status: TreatmentPlanStatus, wanted: boolean) =>
    wanted
      ? prisma.treatmentPlan.findMany({
          where: { status },
          orderBy: { updatedAt: 'desc' },
          take: searching ? ARCHIVE_SEARCH_SCAN : ARCHIVE_LIMIT,
          include: PLAN_INCLUDE,
        })
      : Promise.resolve<LoadedPlan[]>([]);

  const [active, completed, cancelled, completedTotal, cancelledTotal] = await Promise.all([
    prisma.treatmentPlan.findMany({
      where: { status: TreatmentPlanStatus.ACTIVE },
      include: PLAN_INCLUDE,
    }),
    archive(TreatmentPlanStatus.COMPLETED, filter === 'completed' || searching),
    archive(TreatmentPlanStatus.CANCELLED, filter === 'cancelled' || searching),
    prisma.treatmentPlan.count({ where: { status: TreatmentPlanStatus.COMPLETED } }),
    prisma.treatmentPlan.count({ where: { status: TreatmentPlanStatus.CANCELLED } }),
  ]);

  // Everything the row's own buttons need. Loaded only for the people who can
  // press them — a read-only account has no use for the catalogue or the diary's
  // chairs, and no reason to be sent either.
  const [services, staff, operatories, clinicProfile, titleRows] = await Promise.all([
    canEdit || canBook ? getServiceOptions() : Promise.resolve([]),
    canBook ? getProviderOptions() : Promise.resolve([]),
    canBook ? getOperatoryOptions() : Promise.resolve([]),
    getClinicProfile(),
    // Plan names the practice has already used, suggested on the next one so
    // "Upper right quadrant" does not become four differently worded plans.
    canEdit
      ? prisma.treatmentPlan.findMany({
          distinct: ['title'],
          orderBy: { title: 'asc' },
          take: 40,
          select: { title: true },
        })
      : Promise.resolve([]),
  ]);

  const planTitles = titleRows.map((row) => row.title);

  /**
   * One box, three things somebody might remember: whose plan it is, what the
   * plan was called, or the treatment itself. Accent-insensitive, because nobody
   * reaches for the diacritics when they are hunting for a row.
   */
  const hit = (plan: LoadedPlan) =>
    !searching ||
    matches(plan.title, query) ||
    matches(`${plan.patient.lastName} ${plan.patient.firstName}`, query) ||
    matches(`${plan.patient.firstName} ${plan.patient.lastName}`, query) ||
    plan.steps.some((step) => matches(step.title, query));

  const toRow = (plan: LoadedPlan): PlanRowView => {
    const summary = summarisePlan(plan, now);

    return {
      id: plan.id,
      title: plan.title,
      notes: plan.notes ?? '',
      status: plan.status,
      patient: plan.patient,
      done: summary.done,
      relevant: summary.relevant,
      percent: summary.percent,
      quietDays: summary.quietDays,
      stalled: summary.stalled,
      nextBooked: summary.next
        ? {
            date: summary.next.appointment!.date,
            startTime: summary.next.appointment!.startTime,
          }
        : null,
      steps: plan.steps.map(
        (step): PlanRowStep => ({
          id: step.id,
          title: step.title,
          toothNum: step.toothNum,
          status: step.status,
          linked: step.appointmentId !== null,
          booked: isPromisedSlot(step.appointment, now)
            ? { date: step.appointment.date, startTime: step.appointment.startTime }
            : null,
        }),
      ),
    };
  };

  const summarise = (plans: LoadedPlan[]) => plans.filter(hit).map(toRow);

  const openRows = summarise(active);
  const completedRows = summarise(completed);
  const cancelledRows = summarise(cancelled);

  const counts: Record<Filter, number> = {
    open: openRows.length,
    stalled: openRows.filter((row) => row.stalled).length,
    // Unsearched, the archives are known from a count query rather than from a
    // page of rows nobody asked to see.
    completed: searching ? completedRows.length : completedTotal,
    cancelled: searching ? cancelledRows.length : cancelledTotal,
  };

  // Closed plans are read newest-first — the archive answers "what did we wrap
  // up", not "what is being neglected", and nothing in it can be stalled.
  const visible = isArchive(filter)
    ? (filter === 'completed' ? completedRows : cancelledRows).slice(0, ARCHIVE_LIMIT)
    : (filter === 'stalled' ? openRows.filter((row) => row.stalled) : openRows).sort(worstFirst);

  /** Every link on this screen keeps the other half of the state it is not about. */
  const hrefFor = (option: Filter, text = query) => {
    const search = new URLSearchParams();
    if (option !== 'open') search.set('filter', option);
    if (text) search.set('q', text);
    const encoded = search.toString();
    return encoded ? `/plans?${encoded}` : '/plans';
  };

  const emptyTitle = searching
    ? t('noMatches', { query })
    : filter === 'stalled'
      ? t('noneStalled')
      : filter === 'completed'
        ? t('noneCompleted')
        : filter === 'cancelled'
          ? t('noneCancelled')
          : t('allEmpty');

  // A plan needs somebody to be for, and this screen does not know who — so the
  // dialog asks. Starting a course of treatment from the list of courses of
  // treatment is the obvious move that was not previously possible anywhere but
  // inside one patient's record.
  const newDialog = canEdit ? (
    <PlanFormDialog services={services} numbering={clinicProfile.toothNumbering} titles={planTitles} />
  ) : null;

  return (
    <>
      <PageHeader
        title={t('allTitle')}
        subtitle={t('allSubtitle')}
        actions={newDialog}
        trail={[{ label: t('allTitle') }]}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <nav className="flex flex-wrap gap-2" aria-label={t('status')}>
          {FILTERS.map((option) => (
            <Link
              key={option}
              href={hrefFor(option)}
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

        {/* A plain GET form, so a search is a real URL: it survives a reload, a
            bookmark and a link sent to a colleague, and the counts above it
            re-read the same query on the server. */}
        {/* `min-w-0 flex-1` on both the form and the box around the field, so the
            input gives way on a phone instead of pushing the page sideways; the
            fixed width comes back as soon as there is room for it. */}
        <form method="get" role="search" className="flex min-w-0 flex-1 items-center gap-2">
          {filter === 'open' ? null : <input type="hidden" name="filter" value={filter} />}
          <div className="relative min-w-0 flex-1 sm:flex-none">
            <Search
              size={17}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-faint"
            />
            <input
              type="search"
              name="q"
              defaultValue={query}
              aria-label={tc('search')}
              placeholder={t('searchPlaceholder')}
              className="field-input w-full py-1.5 pl-9 text-[0.95rem] sm:w-64"
            />
          </div>
          <button type="submit" className="btn btn-secondary btn-sm">
            {tc('search')}
          </button>
          {searching ? (
            <Link href={hrefFor(filter, '')} className="btn btn-ghost btn-sm">
              <X size={17} aria-hidden />
              {tc('clearFilters')}
            </Link>
          ) : null}
        </form>
      </div>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ListChecks size={40} aria-hidden />}
            title={emptyTitle}
            action={searching || filter !== 'open' ? null : newDialog}
          />
        </Card>
      ) : (
        <ul className="card divide-y-2 divide-line">
          {visible.map((plan) => (
            <PlanRow
              key={plan.id}
              plan={plan}
              canEdit={canEdit}
              canDelete={canDelete}
              services={services}
              numbering={clinicProfile.toothNumbering}
              // Booking a step is a diary action, so it needs the diary's own
              // collections — handed down as a render prop rather than making
              // the plan list depend on them from the inside.
              bookStep={
                canBook
                  ? (step) => (
                      <AppointmentFormDialog
                        services={services}
                        staff={staff}
                        operatories={operatories}
                        defaultPatient={{
                          id: plan.patient.id,
                          name: `${plan.patient.lastName} ${plan.patient.firstName}`,
                        }}
                        defaultDate={toDateKey(today())}
                        planStepId={step.id}
                        triggerClassName="btn btn-secondary btn-sm"
                        triggerLabel={t('bookStep')}
                      />
                    )
                  : undefined
              }
            />
          ))}
        </ul>
      )}

      {/* Said out loud rather than left as a silent slice: a capped list that
          looks complete is worse than one that admits its edge. Measured against
          the count, not against the rows loaded — the query already stopped at
          the cap, so the two are equal exactly when the list is truncated. */}
      {isArchive(filter) && counts[filter] > visible.length ? (
        <p className="mt-3 text-[0.92rem] text-ink-faint">
          {t('showingRecent', { count: visible.length, total: counts[filter] })}
        </p>
      ) : null}
    </>
  );
}
