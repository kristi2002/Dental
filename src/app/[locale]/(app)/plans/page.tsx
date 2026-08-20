import { ListChecks, Search, X } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AppointmentFormDialog } from '@/components/appointments/AppointmentFormDialog';
import { PlanRow, type PlanRowStep, type PlanRowView } from '@/components/plans/PlanRow';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import type { Prisma } from '@/generated/prisma/client';
import { TreatmentPlanStatus, TreatmentStepStatus } from '@/generated/prisma/enums';
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
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Filter = 'open' | 'stalled' | 'completed' | 'cancelled';
const FILTERS: Filter[] = ['open', 'stalled', 'completed', 'cancelled'];

/** The two tabs that hold history rather than work. */
const isArchive = (filter: Filter) => filter === 'completed' || filter === 'cancelled';

/**
 * Closed plans are history and grow without bound, so the archive tabs are
 * capped — and say so, rather than quietly showing a slice as if it were all.
 * The open tabs are capped too now, for the same reason and at a higher number:
 * a practice with four thousand courses of treatment under way has a problem
 * this page cannot solve by rendering all of them.
 */
const ARCHIVE_LIMIT = 60;
const OPEN_LIMIT = 300;

const PLAN_INCLUDE = {
  patient: { select: { id: true, firstName: true, lastName: true } },
  steps: {
    orderBy: { position: 'asc' },
    include: { appointment: { select: { date: true, startTime: true, status: true } } },
  },
} as const;

type LoadedPlan = Prisma.TreatmentPlanGetPayload<{ include: typeof PLAN_INCLUDE }>;

/**
 * One box, three things somebody might remember: whose plan it is, what the plan
 * was called, or the treatment itself.
 *
 * Asked of the database rather than of an array. Every open plan in the practice
 * used to be loaded with all of its steps and then filtered in JavaScript, which
 * is a scan of the whole table to answer a question Postgres was already holding
 * an index for — and, unlike the archives beside it, was not even capped. The
 * cost of that is invisible for a year and then the page is the slow one.
 *
 * `mode: 'insensitive'` is case-folding, not accent-folding: Postgres will match
 * "MARIA" for "maria" but not "Kelmendi" for "Kelmëndi". The patient half of the
 * search therefore also goes through `searchKey`, which is the accent-stripped
 * column the patient list already searches on, so a plan is findable by its
 * owner exactly as its owner is.
 */
function planWhere(status: TreatmentPlanStatus, query: string): Prisma.TreatmentPlanWhereInput {
  if (!query) return { status };

  const folded = query.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();

  return {
    status,
    OR: [
      { title: { contains: query, mode: 'insensitive' } },
      { steps: { some: { title: { contains: query, mode: 'insensitive' } } } },
      { patient: { searchKey: { contains: folded } } },
      { patient: { firstName: { contains: query, mode: 'insensitive' } } },
      { patient: { lastName: { contains: query, mode: 'insensitive' } } },
    ],
  };
}

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
 * step off, put the whole run in the diary, add the one that was missed, record
 * the phone call, stop chasing it altogether — is on the row, because a triage
 * list whose only affordance is a link to somewhere else is a list that gets
 * read and not worked.
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
  // The archives are counted always and loaded only when they are being read:
  // a tab count is a `count` query, not a page of rows nobody asked to see.
  const archive = (status: TreatmentPlanStatus, wanted: boolean) =>
    wanted
      ? prisma.treatmentPlan.findMany({
          where: planWhere(status, query),
          orderBy: { updatedAt: 'desc' },
          take: ARCHIVE_LIMIT,
          include: PLAN_INCLUDE,
        })
      : Promise.resolve<LoadedPlan[]>([]);

  const [active, completed, cancelled, activeTotal, completedTotal, cancelledTotal] =
    await Promise.all([
      prisma.treatmentPlan.findMany({
        where: planWhere(TreatmentPlanStatus.ACTIVE, query),
        orderBy: { updatedAt: 'desc' },
        take: OPEN_LIMIT,
        include: PLAN_INCLUDE,
      }),
      archive(TreatmentPlanStatus.COMPLETED, filter === 'completed'),
      archive(TreatmentPlanStatus.CANCELLED, filter === 'cancelled'),
      // Counted rather than measured from the rows: the open list is capped now,
      // so `openRows.length` stops being the number of open plans exactly when
      // somebody most needs to be told that it has.
      prisma.treatmentPlan.count({ where: planWhere(TreatmentPlanStatus.ACTIVE, query) }),
      prisma.treatmentPlan.count({ where: planWhere(TreatmentPlanStatus.COMPLETED, query) }),
      prisma.treatmentPlan.count({ where: planWhere(TreatmentPlanStatus.CANCELLED, query) }),
    ]);

  // Everything the row's own buttons need. Loaded only for the people who can
  // press them — a read-only account has no use for the catalogue or the diary's
  // chairs, and no reason to be sent either.
  const [services, staff, operatories, clinicProfile] = await Promise.all([
    canEdit || canBook ? getServiceOptions() : Promise.resolve([]),
    canBook ? getProviderOptions() : Promise.resolve([]),
    canBook ? getOperatoryOptions() : Promise.resolve([]),
    getClinicProfile(),
  ]);

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
      snoozed: summary.snoozed,
      followUpOn: summary.followUpOn,
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
          notes: step.notes ?? '',
          status: step.status,
          serviceId: step.serviceId,
          linked: step.appointmentId !== null,
          booked: isPromisedSlot(step.appointment, now)
            ? { date: step.appointment.date, startTime: step.appointment.startTime }
            : null,
        }),
      ),
    };
  };

  const openRows = active.map(toRow);
  const completedRows = completed.map(toRow);
  const cancelledRows = cancelled.map(toRow);

  const counts: Record<Filter, number> = {
    open: activeTotal,
    // Stalled is derived per plan, so this one can only be counted from the rows
    // that were loaded. It is exact until the cap bites, and the line at the
    // foot of the page says when that is.
    stalled: openRows.filter((row) => row.stalled).length,
    completed: completedTotal,
    cancelled: cancelledTotal,
  };

  // Closed plans are read newest-first — the archive answers "what did we wrap
  // up", not "what is being neglected", and nothing in it can be stalled.
  const visible = isArchive(filter)
    ? filter === 'completed'
      ? completedRows
      : cancelledRows
    : (filter === 'stalled' ? openRows.filter((row) => row.stalled) : openRows).sort(worstFirst);

  /**
   * The booking dialog for every step that could take one, built once for the
   * whole page.
   *
   * `AppointmentFormDialog` is a client component that needs the patient list,
   * the catalogue, the providers and the chairs; `PlanRow` and `StepList` are
   * client components too, and a function cannot be handed across that boundary.
   * So the elements are made here, on the server, and the rows only choose which
   * of them to show.
   */
  const bookSlots: Record<string, React.ReactNode> = {};
  if (canBook) {
    for (const plan of visible) {
      for (const step of plan.steps) {
        if (step.status !== TreatmentStepStatus.PENDING || step.linked) continue;
        bookSlots[step.id] = (
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
        );
      }
    }
  }

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
  // form asks. Starting a course of treatment from the list of courses of
  // treatment is the obvious move that was not previously possible anywhere but
  // inside one patient's record.
  const newLink = canEdit ? (
    <Link href="/plans/new" className="btn btn-primary">
      <ListChecks size={18} aria-hidden />
      {t('new')}
    </Link>
  ) : null;

  return (
    <>
      <PageHeader
        title={t('allTitle')}
        subtitle={t('allSubtitle')}
        actions={newLink}
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
            action={searching || filter !== 'open' ? null : newLink}
          />
        </Card>
      ) : (
        // Each plan carries its own card — see `PlanRow`. A shared card with
        // dividers made two neighbouring plans look like one long entry.
        <ul className="space-y-4">
          {visible.map((plan) => (
            <PlanRow
              key={plan.id}
              plan={plan}
              canEdit={canEdit}
              canDelete={canDelete}
              canBook={canBook}
              services={services}
              staff={staff}
              operatories={operatories}
              numbering={clinicProfile.toothNumbering}
              bookSlots={bookSlots}
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

      {!isArchive(filter) && activeTotal > openRows.length ? (
        <p className="mt-3 text-[0.92rem] text-ink-faint">
          {t('showingRecent', { count: visible.length, total: activeTotal })}
        </p>
      ) : null}
    </>
  );
}
