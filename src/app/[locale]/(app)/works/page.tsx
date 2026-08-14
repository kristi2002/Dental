import { Download, FlaskConical, Plus, Trash2 } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { WorkFormDialog } from '@/components/works/WorkFormDialog';
import { ActionForm } from '@/components/ui/ActionForm';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar } from '@/components/ui/FilterBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { deleteWork } from '@/lib/actions/works';
import { requirePermission } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { cn, matches } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Sentinel for "no laboratory written on this line" — never a real lab name. */
const NO_LAB = '__none__';

/**
 * The three sub-columns inside the works cell, so the heading and every line
 * underneath it stand in the same places. One template, quoted twice.
 */
const LINE_GRID = 'grid grid-cols-[minmax(4.5rem,auto)_minmax(0,1fr)_minmax(4.5rem,auto)] gap-x-3';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'works' });
  return { title: t('title') };
}

/**
 * The works register.
 *
 * One wide table, the way the practice already keeps it on paper: a row per case
 * with the lab's serial, our number, who it is for, a number to ring, the
 * diagnosis — and the work itself as rows stacked inside its own column, because
 * a case is hardly ever one thing.
 *
 * Everything is on one screen on purpose. This is a register: it gets read
 * across, scanned down and exported whole, and a paged one answers none of
 * those. Filtering happens in memory rather than in the query for the reason the
 * catalogue does the same — `matches()` folds accents and `ILIKE` does not, so
 * typing *puron* has to find *Purón*.
 */
export default async function WorksPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; lab?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('work.view');
  const canEdit = user.permissions.includes('work.edit');
  const canDelete = user.permissions.includes('work.delete');

  const t = await getTranslations('works');
  const tc = await getTranslations('common');

  const allWorks = await prisma.work.findMany({
    // Newest first: the row somebody is looking for is nearly always the one
    // written this week.
    orderBy: { number: 'desc' },
    include: { lines: { orderBy: { position: 'asc' } } },
  });

  const { q, lab } = await searchParams;
  const query = (q ?? '').trim();
  const labFilter = lab ?? '';

  // Every laboratory the register has ever named, for the filter.
  const labs = [
    ...new Set(
      allWorks.flatMap((work) => work.lines.map((line) => line.lab?.trim()).filter(Boolean)),
    ),
  ].sort((a, b) => a!.localeCompare(b!)) as string[];

  const works = allWorks.filter((work) => {
    if (labFilter === NO_LAB) {
      if (work.lines.some((line) => line.lab?.trim())) return false;
    } else if (labFilter && !work.lines.some((line) => line.lab?.trim() === labFilter)) {
      return false;
    }

    if (!query) return true;

    // Everything printed on the row is searchable, including the work itself —
    // "who did we send a zirconia bridge for" is the question this answers.
    const haystack = [
      String(work.number),
      work.labSerial ?? '',
      work.patientName,
      work.phone,
      work.diagnosis ?? '',
      work.notes ?? '',
      ...work.lines.flatMap((line) => [line.elements, line.procedure, line.lab ?? '']),
    ];
    return haystack.some((field) => field && matches(field, query));
  });

  const isFiltered = Boolean(query || labFilter);

  // The export carries whatever the screen is showing — a filtered register is a
  // deliberate selection, and exporting the whole thing instead would silently
  // hand back rows the person just narrowed away.
  const exportQuery = new URLSearchParams();
  if (query) exportQuery.set('q', query);
  if (labFilter) exportQuery.set('lab', labFilter);
  // The route sits outside the `[locale]` segment and so has no language of its
  // own — without this the column headings would always come out in Albanian.
  exportQuery.set('locale', locale);
  const exportHref = `/api/works/export?${exportQuery}`;

  const newLink = canEdit ? (
    <Link href="/works/new" className="btn btn-primary">
      <Plus size={20} aria-hidden />
      {t('new')}
    </Link>
  ) : null;

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        trail={[{ label: t('title') }]}
        actions={
          <>
            {/* A plain link, not a form: the file is a GET of what is on screen,
                so it can be bookmarked and it works with JavaScript off. */}
            {allWorks.length > 0 ? (
              <a href={exportHref} className="btn btn-secondary" download data-print-hide>
                <Download size={20} aria-hidden />
                {t('export')}
              </a>
            ) : null}
            {newLink}
          </>
        }
      />

      {allWorks.length > 0 ? (
        <FilterBar
          basePath="/works"
          label={tc('filters')}
          values={{ q: query, lab: labFilter }}
          search={{ name: 'q', label: tc('search'), placeholder: t('searchPlaceholder') }}
          selects={
            labs.length > 0
              ? [
                  {
                    name: 'lab',
                    label: t('lab'),
                    anyLabel: t('anyLab'),
                    options: [
                      ...labs.map((name) => ({ value: name, label: name })),
                      { value: NO_LAB, label: t('noLab') },
                    ],
                  },
                ]
              : []
          }
          submitLabel={tc('filter')}
          clearLabel={tc('clearFilters')}
          summary={t('showing', { count: works.length, total: allWorks.length })}
        />
      ) : null}

      {works.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<FlaskConical size={40} aria-hidden />}
            title={isFiltered ? t('emptyFiltered') : t('empty')}
            action={isFiltered ? null : newLink}
          />
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[64rem] border-collapse text-left">
            <caption className="sr-only">{t('title')}</caption>
            <thead>
              <tr className="border-b-2 border-line">
                {[t('labSerial'), t('number'), t('patientName'), t('phone'), t('diagnosis')].map(
                  (heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="px-3 py-3 align-bottom text-[0.82rem] font-bold tracking-wide text-ink-faint uppercase first:pl-5"
                    >
                      {heading}
                    </th>
                  ),
                )}

                {/* One column holding three. The sub-headings sit on the same
                    grid as the lines below them, so the cell reads as the small
                    table it is rather than as three words above a paragraph. */}
                <th scope="col" className="px-3 py-3 align-bottom">
                  <span className="block text-[0.82rem] font-bold tracking-wide text-ink uppercase">
                    {t('lines')}
                  </span>
                  <span
                    className={cn(
                      LINE_GRID,
                      'mt-1 text-[0.72rem] font-semibold tracking-wide text-ink-faint uppercase',
                    )}
                  >
                    <span>{t('elements')}</span>
                    <span>{t('procedure')}</span>
                    <span>{t('lab')}</span>
                  </span>
                </th>

                {canEdit || canDelete ? (
                  <th scope="col" className="px-3 py-3 pr-5 align-bottom" data-print-hide>
                    <span className="sr-only">{tc('actions')}</span>
                  </th>
                ) : null}
              </tr>
            </thead>

            <tbody>
              {works.map((work) => (
                <tr key={work.id} className="border-b border-line align-top last:border-b-0">
                  <td className="px-3 py-3 pl-5 text-[1rem] font-semibold text-ink tabular-nums">
                    {work.labSerial || <span className="text-ink-faint">—</span>}
                  </td>

                  <td className="px-3 py-3 text-[1rem] font-bold text-ink tabular-nums">
                    {work.number}
                  </td>

                  <td className="px-3 py-3 text-[1rem] text-ink">
                    {/* The link is there when the case was written against a
                        record; the text is the register's own copy either way. */}
                    {work.patientId ? (
                      <Link href={`/patients/${work.patientId}`} className="font-semibold">
                        {work.patientName}
                      </Link>
                    ) : (
                      <span className="font-semibold">{work.patientName}</span>
                    )}
                  </td>

                  <td className="px-3 py-3 text-[1rem] text-ink-soft tabular-nums">
                    <a href={`tel:${work.phone.replace(/\s/g, '')}`}>{work.phone}</a>
                  </td>

                  <td className="max-w-56 px-3 py-3 text-[0.98rem] text-ink-soft">
                    {work.diagnosis || <span className="text-ink-faint">—</span>}
                    {work.notes ? (
                      <span className="mt-1 block text-[0.88rem] text-ink-faint italic">
                        {work.notes}
                      </span>
                    ) : null}
                  </td>

                  <td className="px-3 py-3">
                    {work.lines.length === 0 ? (
                      <span className="text-[0.95rem] text-ink-faint">—</span>
                    ) : (
                      <ul className="divide-y divide-line">
                        {work.lines.map((line) => (
                          <li key={line.id} className={cn(LINE_GRID, 'py-1 first:pt-0 last:pb-0')}>
                            <span className="text-[0.95rem] text-ink-soft tabular-nums">
                              {line.elements || '—'}
                            </span>
                            <span className="text-[0.98rem] font-semibold text-ink">
                              {line.procedure}
                            </span>
                            <span className="text-[0.95rem] text-ink-soft">{line.lab || '—'}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>

                  {canEdit || canDelete ? (
                    <td className="px-3 py-3 pr-5" data-print-hide>
                      <div className="flex items-center justify-end gap-2">
                        {canEdit ? (
                          <WorkFormDialog
                            work={{
                              id: work.id,
                              labSerial: work.labSerial ?? '',
                              patientId: work.patientId ?? '',
                              patientName: work.patientName,
                              phone: work.phone,
                              diagnosis: work.diagnosis ?? '',
                              notes: work.notes ?? '',
                              lines: work.lines.map((line) => ({
                                elements: line.elements,
                                procedure: line.procedure,
                                lab: line.lab ?? '',
                              })),
                            }}
                          />
                        ) : null}
                        {canDelete ? (
                          <ActionForm
                            action={deleteWork}
                            values={{ id: work.id }}
                            confirmMessage={tc('confirmDelete')}
                          >
                            <button
                              type="submit"
                              className="btn btn-danger btn-sm"
                              title={tc('delete')}
                            >
                              <Trash2 size={17} aria-hidden />
                              <span className="sr-only">{tc('delete')}</span>
                            </button>
                          </ActionForm>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
