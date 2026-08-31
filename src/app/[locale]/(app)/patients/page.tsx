import {
  Cake,
  ChevronLeft,
  ChevronRight,
  Download,
  Mail,
  Phone,
  Search,
  TriangleAlert,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ReliabilityBadge } from '@/components/patients/ReliabilityBadge';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { age } from '@/lib/dates';
import { hasAllergyNote } from '@/lib/medical';
import { ACTIVE_PATIENTS, fold, patientSearchClauses } from '@/lib/patient-search';
import { prisma } from '@/lib/prisma';
import { getReliabilityMap } from '@/lib/reliability';
import { initials } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** A screenful. Enough to scan, few enough that the page is never the bottleneck. */
const PAGE_SIZE = 48;

export default async function PatientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; page?: string; show?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('patient.view');
  const canEdit = user.permissions.includes('patient.edit');
  const canSeeMedical = user.permissions.includes('patient.medical.view');

  const t = await getTranslations('patients');
  const tc = await getTranslations('common');

  const { q, page: rawPage, show } = await searchParams;
  const query = (q ?? '').trim();
  const archived = show === 'archived';

  // The list used to load every patient, with two sub-counts and a reliability
  // score each, on every visit to the screen — invisible at forty people and the
  // slowest page in the app well before three thousand. A page is a page.
  const page = Math.max(1, Number.parseInt(rawPage ?? '1', 10) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  // Registering somebody is a screen of its own — see `/patients/new`.
  const addButton = (
    <Link href="/patients/new" className="btn btn-primary">
      <UserPlus size={20} aria-hidden />
      {t('new')}
    </Link>
  );

  // The export carries whatever the screen is showing — the search box and the
  // archived/active view both travel with it, for the reason the works register
  // does the same: a filtered list is a deliberate selection, and handing over
  // the whole directory instead would be a quiet and expensive surprise.
  //
  // Not paginated, unlike the screen. See the route.
  const exportQuery = new URLSearchParams();
  if (query) exportQuery.set('q', query);
  if (archived) exportQuery.set('show', 'archived');
  // No locale segment on an API route, so the column titles are asked for by
  // name — same handover as the works export.
  exportQuery.set('locale', locale);
  const exportHref = `/api/patients/export?${exportQuery}`;

  // One folded column, one comparison — the same answer the in-memory `matches()`
  // helper gives, so typing the same thing into any box in the app finds the
  // same people. Digits are matched against the phone directly, because folding
  // does not help a number and `searchKey` holds it as typed.
  const folded = fold(query);
  const digits = query.replace(/\D/g, '');
  const where = {
    // Archived people are their own view rather than a filter nobody finds:
    // "where did Arta go" has to have an answer on this screen.
    ...(archived ? { NOT: { archivedAt: null } } : ACTIVE_PATIENTS),
    ...(query ? { OR: patientSearchClauses(query, folded, digits) } : {}),
  };

  const [total, patients, archivedCount] = await Promise.all([
    prisma.patient.count({ where }),
    prisma.patient.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: { _count: { select: { visitRecords: true, appointments: true } } },
      skip,
      take: PAGE_SIZE,
    }),
    // Only to decide whether the archive is worth advertising — a practice that
    // has never archived anybody should not carry a link to an empty screen.
    prisma.patient.count({ where: { NOT: { archivedAt: null } } }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // One score per row on the page, not per row in the database.
  const reliability = await getReliabilityMap(patients.map((patient) => patient.id));

  const hrefFor = (nextPage: number) => {
    const search = new URLSearchParams();
    if (query) search.set('q', query);
    if (archived) search.set('show', 'archived');
    if (nextPage > 1) search.set('page', String(nextPage));
    const suffix = search.toString();
    return suffix ? `/patients?${suffix}` : '/patients';
  };

  return (
    <>
      <PageHeader
        title={archived ? t('archivedTitle') : t('title')}
        // The total, not the length of this page — "24 patients" under a list of
        // 24 that is actually page one of eighty is a lie the old list could not
        // tell because it always showed everybody.
        subtitle={t('count', { count: total })}
        actions={
          <>
            {/* Offered whenever the list can be read at all: `patient.view` is
                what puts these names on the screen, and a person who may read
                them one page at a time is not stopped from reading them by
                being handed the same names in a file. The medical column is the
                one thing that is gated, and it is not in the file — see
                `patients-export.ts`. */}
            {total > 0 ? (
              <a href={exportHref} className="btn btn-secondary" download data-print-hide>
                <Download size={20} aria-hidden />
                {t('export')}
              </a>
            ) : null}
            {/* Beside the export rather than behind a menu, and only on the
                active view: importing into the archive is not a thing anybody
                means. Both verbs live on the list they act on, which is the one
                place somebody holding a spreadsheet will look. */}
            {canEdit && !archived ? (
              <Link href="/patients/import" className="btn btn-secondary">
                <Upload size={20} aria-hidden />
                {t('import')}
              </Link>
            ) : null}
            {canEdit ? addButton : null}
          </>
        }
        trail={[{ label: t('title') }]}
      />

      {archivedCount > 0 ? (
        <nav aria-label={t('archivedTitle')} className="mb-4">
          <div className="segmented">
            <Link
              href={query ? `/patients?q=${encodeURIComponent(query)}` : '/patients'}
              aria-current={archived ? undefined : 'true'}
              className="segment"
            >
              {t('title')}
            </Link>
            <Link
              href={
                query
                  ? `/patients?show=archived&q=${encodeURIComponent(query)}`
                  : '/patients?show=archived'
              }
              aria-current={archived ? 'true' : undefined}
              className="segment"
            >
              {t('archivedTitle')} ({archivedCount})
            </Link>
          </div>
        </nav>
      ) : null}

      <form className="mb-6 flex gap-2" role="search">
        {archived ? <input type="hidden" name="show" value="archived" /> : null}
        <label className="sr-only" htmlFor="patient-search">
          {tc('search')}
        </label>
        <input
          id="patient-search"
          type="search"
          name="q"
          defaultValue={query}
          placeholder={t('searchPlaceholder')}
          className="field-input flex-1"
        />
        <button type="submit" className="btn btn-secondary">
          <Search size={20} aria-hidden />
          <span className="sr-only sm:not-sr-only">{tc('search')}</span>
        </button>
      </form>

      {patients.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Users size={40} aria-hidden />}
            title={query ? t('emptySearch', { query }) : t('empty')}
            action={query || !canEdit ? null : addButton}
          />
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {patients.map((patient) => (
            <li key={patient.id}>
              <Link
                href={`/patients/${patient.id}`}
                className="card flex h-full items-start gap-4 p-4 no-underline transition-colors hover:border-brand"
              >
                <span
                  aria-hidden
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line-strong bg-paper text-body font-bold text-ink-soft"
                >
                  {initials(patient.firstName, patient.lastName)}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lead font-bold text-ink">
                    {patient.lastName} {patient.firstName}
                  </span>

                  <span className="mt-1 flex items-center gap-1.5 text-body text-ink-soft">
                    <Phone size={15} aria-hidden />
                    <span className="truncate">{patient.phone || t('noPhone')}</span>
                  </span>

                  {patient.email ? (
                    <span className="mt-0.5 flex items-center gap-1.5 text-body text-ink-soft">
                      <Mail size={15} aria-hidden />
                      <span className="truncate">{patient.email}</span>
                    </span>
                  ) : null}

                  {patient.dateOfBirth ? (
                    <span className="mt-0.5 flex items-center gap-1.5 text-body text-ink-faint">
                      <Cake size={15} aria-hidden />
                      {t('age', { age: age(patient.dateOfBirth) })}
                    </span>
                  ) : null}

                  <span className="mt-2 flex flex-wrap gap-1.5">
                    <ReliabilityBadge reliability={reliability.get(patient.id)} />
                    {/* Even the existence of a note is clinical information — and
                        an allergy among them is worth spotting from the list,
                        before anyone opens the record. */}
                    {canSeeMedical && patient.medicalNotes ? (
                      hasAllergyNote(patient.medicalNotes) ? (
                        <Badge tone="alert">
                          <TriangleAlert size={14} aria-hidden />
                          {t('allergyBadge')}
                        </Badge>
                      ) : (
                        <Badge tone="warn">{t('medicalNotes')}</Badge>
                      )
                    ) : null}
                    {patient._count.visitRecords > 0 ? (
                      <Badge>
                        {t('tabHistory')}: {patient._count.visitRecords}
                      </Badge>
                    ) : null}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Plain previous/next rather than numbered pages: the list is alphabetical
          and the way anybody actually finds a person is the search box above it,
          so paging is the fallback and does not deserve a row of numbers. */}
      {pages > 1 ? (
        <nav
          aria-label={tc('search')}
          className="mt-6 flex items-center justify-between gap-3"
        >
          {page > 1 ? (
            <Link href={hrefFor(page - 1)} className="btn btn-secondary">
              <ChevronLeft size={18} aria-hidden />
              {tc('back')}
            </Link>
          ) : (
            <span />
          )}

          <span className="text-body font-semibold text-ink-soft tabular-nums">
            {t('pageOf', { page, pages })}
          </span>

          {page < pages ? (
            <Link href={hrefFor(page + 1)} className="btn btn-secondary">
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
