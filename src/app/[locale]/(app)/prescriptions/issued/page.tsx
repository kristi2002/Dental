import { ArrowLeft, ChevronLeft, ChevronRight, Pill, ScrollText } from 'lucide-react';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar } from '@/components/ui/FilterBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { fold, patientSearchClauses, phoneKey } from '@/lib/patient-search';

export const dynamic = 'force-dynamic';

/** A page of a list that only ever grows. */
const PAGE_SIZE = 40;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'prescriptions' });
  return { title: t('issuedTitle') };
}

/**
 * Every prescription the practice has actually written.
 *
 * The gap this closes is a labelling one as much as a missing screen.
 * `/prescriptions` is the **template** catalogue — the standard wording kept for
 * the few things a dentist prescribes every week — and the navigation item
 * called *Prescriptions* opened it. An issued `Prescription` was reachable at
 * `/prescriptions/<id>` and the only route to that id was through the patient
 * who received it, so "what did we prescribe this month", "who else got that
 * antibiotic" and "reprint Tuesday's script for the patient whose name I
 * half-remember" were all unanswerable from anywhere.
 *
 * Paged, and searched by patient rather than by drug. The body is free text by
 * design (see `Prescription.body`), so a drug search would be a `LIKE` over
 * prose that would quietly miss "Amoxicillin 875" when somebody typed
 * "amoksicilinë" — and the question actually asked at the desk is about a
 * person. Searching the text as well would promise something the data cannot
 * keep.
 */
export default async function IssuedPrescriptionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission('prescription.view');

  const t = await getTranslations('prescriptions');
  const tc = await getTranslations('common');
  // `pageOf` lives in the patients namespace, where the app's other pager is.
  const tpat = await getTranslations('patients');
  const format = await getFormatter();

  const { q, page: rawPage } = await searchParams;
  const query = (q ?? '').trim();
  const page = Math.max(1, Number.parseInt(rawPage ?? '1', 10) || 1);

  // The same clauses every other patient search in the app uses, rather than a
  // second spelling of them: `searchKey` is the folded column an Albanian *ë*
  // survives, with the raw ones beside it so a restored database still searches.
  const where = query
    ? { patient: { OR: patientSearchClauses(query, fold(query), phoneKey(query)) } }
    : {};

  const [rows, total] = await Promise.all([
    prisma.prescription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        body: true,
        createdAt: true,
        patient: { select: { id: true, firstName: true, lastName: true } },
        issuedBy: { select: { firstName: true, lastName: true } },
        template: { select: { name: true } },
      },
    }),
    prisma.prescription.count({ where }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (n: number) => {
    const search = new URLSearchParams();
    if (query) search.set('q', query);
    if (n > 1) search.set('page', String(n));
    const suffix = search.toString();
    return suffix ? `/prescriptions/issued?${suffix}` : '/prescriptions/issued';
  };

  return (
    <>
      <PageHeader
        title={t('issuedTitle')}
        subtitle={t('issuedSubtitle', { count: total })}
        trail={[{ href: '/prescriptions', label: t('templatesTitle') }, { label: t('issuedTitle') }]}
        actions={
          <Link href="/prescriptions" className="btn btn-secondary">
            <ArrowLeft size={18} aria-hidden />
            {t('templatesTitle')}
          </Link>
        }
      />

      {/* Nothing to narrow until there is something to narrow. */}
      {total > 0 || query ? (
        <FilterBar
          basePath="/prescriptions/issued"
          label={tc('filters')}
          filtered={Boolean(query)}
          values={{ q: query }}
          search={{
            name: 'q',
            label: t('issuedSearch'),
            placeholder: t('issuedSearchPlaceholder'),
          }}
          submitLabel={tc('filter')}
          clearLabel={tc('clearFilters')}
        />
      ) : null}

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<ScrollText size={40} aria-hidden />}
            title={query ? t('issuedNoMatch') : t('issuedEmpty')}
          />
        </div>
      ) : (
        <ul className="card divide-y-2 divide-line">
          {rows.map((row) => (
            <li key={row.id} className="px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="flex flex-wrap items-center gap-2">
                  {/* The patient first: this list is read by somebody holding a
                      name, never by somebody holding a prescription id. */}
                  <Link
                    href={`/patients/${row.patient.id}?tab=prescriptions`}
                    className="text-[1.06rem] font-bold text-ink"
                  >
                    {row.patient.lastName} {row.patient.firstName}
                  </Link>
                  {row.template?.name ? <Badge>{row.template.name}</Badge> : null}
                </p>

                <p className="text-[0.92rem] text-ink-soft">
                  {format.dateTime(row.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                  {row.issuedBy
                    ? ` · ${row.issuedBy.firstName} ${row.issuedBy.lastName}`
                    : ''}
                </p>
              </div>

              {/* The wording as issued, not the template's — a later edit to the
                  standard text must not rewrite what somebody walked out with. */}
              <p className="mt-1 line-clamp-3 text-[0.95rem] whitespace-pre-line text-ink-soft">
                {row.body}
              </p>

              <p className="mt-2">
                <Link href={`/prescriptions/${row.id}`} className="btn btn-secondary btn-sm">
                  <Pill size={16} aria-hidden />
                  {t('issuedOpen')}
                </Link>
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* Plain previous/next, exactly as the patients list pages: this is read
          backwards in time and the way anybody finds one prescription is the
          search box above it, so paging is the fallback. */}
      {pages > 1 ? (
        <nav aria-label={tc('search')} className="mt-6 flex items-center justify-between gap-3">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="btn btn-secondary">
              <ChevronLeft size={18} aria-hidden />
              {tc('back')}
            </Link>
          ) : (
            <span />
          )}

          <span className="text-[0.95rem] font-semibold text-ink-soft tabular-nums">
            {tpat('pageOf', { page, pages })}
          </span>

          {page < pages ? (
            <Link href={pageHref(page + 1)} className="btn btn-secondary">
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
