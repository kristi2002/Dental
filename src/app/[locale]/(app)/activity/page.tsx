import { ChevronLeft, ChevronRight, ScrollText } from 'lucide-react';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { RoleBadge } from '@/components/auth/RoleBadge';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar } from '@/components/ui/FilterBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { auditDestination } from '@/lib/audit-links';
import { requirePermission } from '@/lib/auth/guard';
import { parseDateKey } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { patientAuditIds } from '@/lib/queries';
import { initials } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * A screenful of history, and — unlike before — not the whole of what can be
 * reached. This was the entire query: the newest hundred entries, with no way
 * to see the hundred-and-first. The trail is kept for good (see
 * `src/lib/audit-retention.ts`), so a page that could only ever show the last
 * couple of days was storing years of evidence and answering questions about
 * this morning.
 */
const PAGE_SIZE = 100;


/**
 * What the trail can be narrowed to, in the order the filter prints them.
 *
 * **Every kind `recordAudit` writes belongs here.** It used to hold fourteen of
 * the twenty-six, and the twelve left out were not a decision — they were the
 * ones added after this array was written. The effect is that a screen whose
 * whole job is answering "what happened to this" could not answer it about the
 * works register, the practice's settings, or the mail, and nothing said so: the
 * rows were all there in the list, simply not reachable by the filter above it.
 *
 * `tests/audit-links.test.ts` now holds this against the entities the actions
 * actually record, so a twenty-seventh breaks a test rather than quietly
 * becoming the thirteenth thing nobody can filter for.
 *
 * Grouped rather than alphabetical, because the filter is read as a list of
 * places rather than searched as an index: the patient and their care, then the
 * catalogue and the cupboard, then the practice's own correspondence and
 * housekeeping.
 */
const ENTITIES = [
  // The patient, and what was done for them.
  'patient',
  'appointment',
  'visit',
  'tooth',
  'alert',
  'plan',
  'document',
  'prescription',
  'work',
  // What the practice keeps.
  'stock',
  'stockCategory',
  'supplier',
  'service',
  'serviceCategory',
  'workProcedure',
  'lab',
  // Who it speaks to, and about what.
  'contact',
  'message',
  'recall',
  'waitlist',
  'appointmentRequest',
  'followup',
  // Running the place.
  'staff',
  'settings',
  'backup',
  'job',
  'session',
] as const;

const ACTION_TONES: Record<string, BadgeTone> = {
  create: 'ok',
  update: 'brand',
  delete: 'danger',
  // Reads are the quiet majority of the trail once views are recorded, so they
  // stay grey — the eye should still land on what was changed or taken out.
  view: 'neutral',
  export: 'warn',
  login: 'neutral',
  logout: 'neutral',
  denied: 'warn',
  // A sign-in that was refused: a wrong PIN, a deactivated account, or an
  // account that does not exist. Same weight as `denied` — somebody tried
  // something they could not do, and the trail is the one reader who cares.
  failed: 'warn',
  confirmed: 'ok',
  declined: 'warn',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'activity' });
  return { title: t('title') };
}

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    entity?: string;
    from?: string;
    to?: string;
    actor?: string;
    /** One exact record, by the id the trail filed the line under. */
    id?: string;
    /** One person, widened to every record of theirs. See `patientAuditIds`. */
    patient?: string;
    page?: string;
  }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission('audit.view');

  const { entity, from, to, actor, id, patient, page: rawPage } = await searchParams;
  const filter = ENTITIES.includes(entity as (typeof ENTITIES)[number]) ? entity : undefined;

  // Two ways of naming a subject, kept apart rather than folded into one clever
  // parameter. `id` is "this exact record", which works for anything the trail
  // files a line against. `patient` is "everything that ever happened to this
  // person", which is a wider question — their appointments and visits are filed
  // under their own ids, so it has to be expanded before it can be asked (see
  // `patientAuditIds`). One parameter doing both would mean the page guessing
  // which was meant from the shape of a uuid.
  const subject = patient
    ? await prisma.patient.findUnique({
        where: { id: patient },
        select: { id: true, firstName: true, lastName: true },
      })
    : null;

  const subjectIds = subject ? await patientAuditIds(subject.id) : null;

  const t = await getTranslations('activity');
  const tc = await getTranslations('common');
  const format = await getFormatter();

  const fromDay = parseDateKey(from);
  const toDay = parseDateKey(to);

  // Everyone who has ever written to the trail, not only the people still
  // working here. Filtering an audit log by actor is most useful about somebody
  // who has left, and `getAssignableStaff` deliberately returns only active
  // accounts — so this asks its own question rather than borrowing that one.
  const staff = await prisma.staffUser.findMany({
    orderBy: [{ active: 'desc' }, { firstName: 'asc' }],
    select: { id: true, firstName: true, lastName: true, active: true },
  });
  const actorId = staff.some((person) => person.id === actor) ? actor : undefined;

  const where = {
    ...(filter ? { entity: filter } : {}),
    ...(actorId ? { actorId } : {}),
    // The wider view wins when both are given: asking for one person's whole
    // history and one exact record at once is a contradiction, and the subject
    // is the one the reader arrived here for.
    ...(subjectIds ? { entityId: { in: subjectIds } } : id ? { entityId: id } : {}),
    // `to` is inclusive, so the bound is the start of the following day — a
    // range of 3 March to 3 March has to mean that whole day, which is what
    // somebody typing the same date twice is asking for.
    ...(fromDay || toDay
      ? {
          createdAt: {
            ...(fromDay ? { gte: fromDay } : {}),
            ...(toDay ? { lt: new Date(toDay.getTime() + 86_400_000) } : {}),
          },
        }
      : {}),
  };

  const pageNumber = Math.max(1, Number.parseInt(rawPage ?? '1', 10) || 1);

  const [total, entries] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (pageNumber - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Where each line points, for the lines that point anywhere — and only after
  // checking the record is still there. The trail outlives what it describes, so
  // a decade-old line about a deleted patient would otherwise be a link to a
  // 404. One query per kind for the whole page, not one per row.
  const destinations = entries.map((entry) => auditDestination(entry.entity, entry.entityId));
  const wanted = (kind: 'patient' | 'stock') => [
    ...new Set(destinations.filter((d) => d?.kind === kind).map((d) => d!.id)),
  ];

  const [livePatients, liveStock] = await Promise.all([
    prisma.patient.findMany({ where: { id: { in: wanted('patient') } }, select: { id: true } }),
    prisma.stockItem.findMany({ where: { id: { in: wanted('stock') } }, select: { id: true } }),
  ]);
  const alive = new Set([
    ...livePatients.map((row) => `patient:${row.id}`),
    ...liveStock.map((row) => `stock:${row.id}`),
  ]);

  const hrefFor = (nextPage: number) => {
    const search = new URLSearchParams();
    if (filter) search.set('entity', filter);
    if (from) search.set('from', from);
    if (to) search.set('to', to);
    if (actorId) search.set('actor', actorId);
    if (subject) search.set('patient', subject.id);
    else if (id) search.set('id', id);
    if (nextPage > 1) search.set('page', String(nextPage));
    const suffix = search.toString();
    return suffix ? `/activity?${suffix}` : '/activity';
  };

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} trail={[{ label: t('title') }]} />

      {/* Said plainly, because every other control on this page narrows and this
          one *replaces* the subject — a reader who does not notice would take a
          list of one person's history for the whole practice's. */}
      {subject ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand/30 bg-brand-soft px-4 py-3">
          <p className="font-semibold text-brand-deep">
            {t('subjectPatient', { name: `${subject.lastName} ${subject.firstName}` })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/patients/${subject.id}`} className="btn btn-secondary btn-sm">
              {t('openRecord')}
            </Link>
            <Link href="/activity" className="btn btn-ghost btn-sm">
              {tc('clearFilters')}
            </Link>
          </div>
        </div>
      ) : null}

      <FilterBar
        basePath="/activity"
        label={t('filterLabel')}
        // `page` is deliberately absent: it is a position in a result set, not a
        // filter on one, and carrying it across a change of filter lands the
        // reader on page nine of a list that now has two.
        values={{
          entity: filter ?? '',
          from: from ?? '',
          to: to ?? '',
          actor: actorId ?? '',
          // Carried, not rendered: the subject is chosen by arriving here from a
          // record, and submitting the filter form must not drop it.
          ...(subject ? { patient: subject.id } : id ? { id } : {}),
        }}
        chips={{
          name: 'entity',
          label: t('filterLabel'),
          options: [
            { value: '', label: tc('all') },
            ...ENTITIES.map((value) => ({ value, label: t(`entity_${value}`) })),
          ],
        }}
        dates={{
          fromName: 'from',
          toName: 'to',
          label: t('rangeLabel'),
          fromLabel: t('from'),
          toLabel: t('to'),
        }}
        selects={[
          {
            name: 'actor',
            label: t('actor'),
            anyLabel: t('anyActor'),
            options: staff.map((person) => ({
              value: person.id,
              // A disabled account still wrote what it wrote, and saying so is
              // what stops the name reading like a current member of staff.
              label: person.active
                ? `${person.firstName} ${person.lastName}`
                : `${person.firstName} ${person.lastName} — ${t('inactiveActor')}`,
            })),
          },
        ]}
        submitLabel={tc('filter')}
        clearLabel={tc('clearFilters')}
        summary={t('matches', { count: total })}
      />

      <Card>
        <CardHeader
          // The total, not the length of this page — the old header counted the
          // rows it had fetched, which was always "100" on any practice with
          // more than a hundred entries and told the reader nothing.
          title={t('recent', { count: total })}
          icon={<ScrollText size={22} aria-hidden />}
        />

        {entries.length === 0 ? (
          <EmptyState icon={<ScrollText size={40} aria-hidden />} title={t('empty')} />
        ) : (
          <ul className="divide-y border-line">
            {entries.map((entry, index) => {
              const [firstName = '', lastName = ''] = entry.actorName.split(' ');

              // Only when the line names a record unambiguously *and* that
              // record is still there — see `auditDestination` for the three
              // entity names that carry two kinds of id and so never link.
              const destination = destinations[index];
              const linked =
                destination && alive.has(`${destination.kind}:${destination.id}`)
                  ? destination
                  : null;

              return (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-3.5 last:border-b-0"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span
                      aria-hidden
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-paper text-[0.82rem] font-bold text-ink-soft"
                    >
                      {initials(firstName, lastName || firstName)}
                    </span>

                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <Badge tone={ACTION_TONES[entry.action] ?? 'neutral'}>
                          {t(`action_${entry.action}`)}
                        </Badge>
                        <span className="text-[1rem] font-semibold text-ink">
                          {t(`entity_${entry.entity}`)}
                        </span>
                        {linked ? (
                          <Link
                            href={linked.href}
                            className="min-w-0 truncate text-[1rem] font-semibold text-brand-deep underline-offset-2 hover:underline"
                          >
                            {entry.summary}
                          </Link>
                        ) : (
                          <span className="min-w-0 truncate text-[1rem] text-ink-soft">
                            {entry.summary}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[0.9rem] text-ink-soft">
                        {entry.actorName}
                        {/* No role means the patient acted, not a member of staff. */}
                        {entry.actorRole ? (
                          <RoleBadge role={entry.actorRole} />
                        ) : (
                          <Badge tone="neutral">{t('actorPatient')}</Badge>
                        )}
                      </p>
                    </div>
                  </div>

                  <time
                    dateTime={entry.createdAt.toISOString()}
                    className="shrink-0 text-[0.9rem] whitespace-nowrap text-ink-faint"
                  >
                    {format.dateTime(entry.createdAt, {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* The half that made the trail readable rather than merely stored. The
          dates above are how somebody reaches 2021; this is how they walk the
          week around whatever they found. */}
      {pages > 1 ? (
        <nav
          aria-label={tc('search')}
          className="mt-6 flex items-center justify-between gap-3"
        >
          {pageNumber > 1 ? (
            <Link href={hrefFor(pageNumber - 1)} className="btn btn-secondary">
              <ChevronLeft size={18} aria-hidden />
              {tc('back')}
            </Link>
          ) : (
            <span />
          )}

          <span className="text-[0.95rem] font-semibold text-ink-soft tabular-nums">
            {t('pageOf', { page: pageNumber, pages })}
          </span>

          {pageNumber < pages ? (
            <Link href={hrefFor(pageNumber + 1)} className="btn btn-secondary">
              {tc('open')}
              <ChevronRight size={18} aria-hidden />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
