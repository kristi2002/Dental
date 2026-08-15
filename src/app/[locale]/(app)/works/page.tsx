import { Download, FlaskConical, Plus, Trash2 } from 'lucide-react';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { WorkFormDialog } from '@/components/works/WorkFormDialog';
import { ActionForm } from '@/components/ui/ActionForm';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar } from '@/components/ui/FilterBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { deleteWork } from '@/lib/actions/works';
import { requirePermission } from '@/lib/auth/guard';
import { toDateKey, toMonthKey } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { cn, matches } from '@/lib/utils';
import { elementsOf, fromMonthKey, monthsPresent, totalElements } from '@/lib/works';

export const dynamic = 'force-dynamic';

/** Sentinel for "no laboratory written on this line" — never a real lab name. */
const NO_LAB = '__none__';

/**
 * The three sub-columns inside the works cell, so the heading and every line
 * underneath it stand in the same places. One template, quoted twice.
 */
const LINE_GRID = 'grid grid-cols-[3rem_minmax(0,1fr)_minmax(4.5rem,auto)] gap-x-3';

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
 * with the lab's serial, our number, who it is for, a number to ring, the span —
 * and the work itself as rows stacked inside its own column, because a case is
 * hardly ever one thing.
 *
 * What the register is *for* is the last column and the line under the table.
 * A laboratory bills by the element and sometimes bills for more than it was
 * sent; this is the practice's own count, and the monthly total at the foot is
 * the figure the invoice gets held against. That is also why the default view is
 * this month rather than everything: the month is the unit the bill arrives in.
 *
 * Filtering happens in memory rather than in the query for the reason the
 * catalogue does the same — `matches()` folds accents and `ILIKE` does not, so
 * typing *puron* has to find *Purón*.
 */
export default async function WorksPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; lab?: string; month?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('work.view');
  const canEdit = user.permissions.includes('work.edit');
  const canDelete = user.permissions.includes('work.delete');

  const t = await getTranslations('works');
  const tc = await getTranslations('common');
  const format = await getFormatter();

  const allWorks = await prisma.work.findMany({
    // Newest first: the row somebody is looking for is nearly always the one
    // written this week. `number` breaks the tie so two cases sent on one day
    // keep the order they were written in.
    orderBy: [{ sentAt: 'desc' }, { number: 'desc' }],
    include: { lines: { orderBy: { position: 'asc' } } },
  });

  const { q, lab, month } = await searchParams;
  const query = (q ?? '').trim();
  const labFilter = lab ?? '';

  const months = monthsPresent(allWorks);
  // `all` is a deliberate choice, `''` is nobody having chosen yet — and the
  // month a practice wants on arriving is the one it is billed for.
  const monthFilter =
    month === 'all' ? null : ((month && fromMonthKey(month) ? month : months[0]) ?? null);

  // Every laboratory the register has ever named, for the filter.
  const labs = [
    ...new Set(
      allWorks.flatMap((work) => work.lines.map((line) => line.lab?.trim()).filter(Boolean)),
    ),
  ].sort((a, b) => a!.localeCompare(b!)) as string[];

  const works = allWorks.filter((work) => {
    if (monthFilter && toMonthKey(work.sentAt) !== monthFilter) return false;

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
      ...work.lines.map((line) => line.procedure),
      ...work.lines.map((line) => line.lab ?? ''),
    ];
    return haystack.some((field) => field && matches(field, query));
  });

  const isFiltered = Boolean(query || labFilter || (monthFilter && monthFilter !== months[0]));
  const elementTotal = totalElements(works);

  const monthLabel = (key: string) =>
    format.dateTime(new Date(`${key}-01T00:00:00.000Z`), { month: 'long', year: 'numeric' });

  // The export carries whatever the screen is showing — a filtered register is a
  // deliberate selection, and exporting the whole thing instead would silently
  // hand back rows the person just narrowed away.
  const exportQuery = new URLSearchParams();
  if (query) exportQuery.set('q', query);
  if (labFilter) exportQuery.set('lab', labFilter);
  exportQuery.set('month', monthFilter ?? 'all');
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

  const columnCount = 6 + (canEdit || canDelete ? 1 : 0);

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
          values={{ q: query, lab: labFilter, month: monthFilter ?? 'all' }}
          search={{ name: 'q', label: tc('search'), placeholder: t('searchPlaceholder') }}
          selects={[
            {
              name: 'month',
              label: t('month'),
              // Not "any month" first: the register is kept and billed a month
              // at a time, so the whole run is the exception here.
              anyLabel: monthFilter ? monthLabel(monthFilter) : t('allMonths'),
              options: [
                ...months
                  .filter((key) => key !== monthFilter)
                  .map((key) => ({ value: key, label: monthLabel(key) })),
                ...(monthFilter ? [{ value: 'all', label: t('allMonths') }] : []),
              ],
            },
            ...(labs.length > 0
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
              : []),
          ]}
          submitLabel={tc('filter')}
          clearLabel={tc('clearFilters')}
          summary={t('showing', { count: works.length, total: allWorks.length })}
        />
      ) : null}

      {works.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<FlaskConical size={40} aria-hidden />}
            title={isFiltered || monthFilter ? t('emptyFiltered') : t('empty')}
            action={isFiltered || monthFilter ? null : newLink}
          />
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[64rem] border-collapse text-left">
            <caption className="sr-only">
              {monthFilter ? `${t('title')} — ${monthLabel(monthFilter)}` : t('title')}
            </caption>
            <thead>
              <tr className="border-b-2 border-line">
                {[t('sentAt'), t('labSerial'), t('number'), t('patientName'), t('phone')].map(
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
                    <span className="text-right">{t('elements')}</span>
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
                  <td className="px-3 py-3 pl-5 text-[0.95rem] text-ink-soft tabular-nums">
                    {format.dateTime(work.sentAt, { day: '2-digit', month: '2-digit' })}
                  </td>

                  <td className="px-3 py-3 text-[1rem] font-semibold text-ink tabular-nums">
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
                    {/* The span, under the name: it is a property of the case,
                        and giving it a column of its own on a table this wide
                        costs more than it is worth. */}
                    {work.diagnosis ? (
                      <span className="mt-0.5 block text-[0.92rem] text-ink-soft tabular-nums">
                        {work.diagnosis}
                      </span>
                    ) : null}
                  </td>

                  <td className="px-3 py-3 text-[1rem] text-ink-soft tabular-nums">
                    <a href={`tel:${work.phone.replace(/\s/g, '')}`}>{work.phone}</a>
                    {work.notes ? (
                      <span className="mt-0.5 block text-[0.88rem] text-ink-faint italic">
                        {work.notes}
                      </span>
                    ) : null}
                  </td>

                  <td className="px-3 py-3">
                    {work.lines.length === 0 ? (
                      <span className="text-[0.95rem] text-ink-faint">—</span>
                    ) : (
                      <>
                        <ul className="divide-y divide-line">
                          {work.lines.map((line) => (
                            <li key={line.id} className={cn(LINE_GRID, 'py-1 first:pt-0')}>
                              <span className="text-right text-[1rem] font-bold text-ink tabular-nums">
                                {line.elements}
                              </span>
                              <span className="text-[0.98rem] font-semibold text-ink">
                                {line.procedure}
                              </span>
                              <span className="text-[0.95rem] text-ink-soft">
                                {line.lab || '—'}
                              </span>
                            </li>
                          ))}
                        </ul>

                        {/* Only once there is something to add up. On a
                            single-line case the line is already the total. */}
                        {work.lines.length > 1 ? (
                          <p
                            className={cn(LINE_GRID, 'border-t-2 border-line pt-1')}
                          >
                            <span className="text-right text-[1rem] font-bold text-ink tabular-nums">
                              {elementsOf(work)}
                            </span>
                            <span className="text-[0.82rem] font-semibold tracking-wide text-ink-faint uppercase">
                              {t('elementsTotal')}
                            </span>
                          </p>
                        ) : null}
                      </>
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
                              sentAt: toDateKey(work.sentAt),
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

            {/* The month's bill, in one number. This is the line the invoice is
                held against, so it stays under the table rather than being left
                for whoever opens the export to select a column and add up. */}
            <tfoot>
              <tr className="border-t-2 border-line-strong bg-surface-soft">
                <td colSpan={columnCount} className="px-5 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                    <span className="text-[0.9rem] font-bold tracking-wide text-ink-faint uppercase">
                      {monthFilter ? monthLabel(monthFilter) : t('allMonths')} ·{' '}
                      {t('caseCount', { count: works.length })}
                    </span>
                    <span className="text-[1.05rem] font-semibold text-ink-soft">
                      {t('elementsTotal')}{' '}
                      <span className="text-[1.6rem] font-bold text-ink tabular-nums">
                        {elementTotal}
                      </span>
                    </span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
