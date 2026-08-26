import { Check, Download, FileText, FlaskConical, Plus, Printer, Trash2, Undo2 } from 'lucide-react';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { FollowUpFormDialog } from '@/components/follow-ups/FollowUpFormDialog';
import { ToothSpan } from '@/components/works/ToothSpan';
import { WorkFormDialog } from '@/components/works/WorkFormDialog';
import { ActionForm } from '@/components/ui/ActionForm';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar } from '@/components/ui/FilterBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { deleteWork, markWorkReceived } from '@/lib/actions/works';
import { requirePermission } from '@/lib/auth/guard';
import { paddedDateFormat, toDateKey, today } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { getAssignableStaff } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { getProcedureOptions } from '@/lib/work-procedures';
import {
  daysLate,
  elementsOf,
  filterWorks,
  monthsPresent,
  NO_LAB,
  resolveWorkMonth,
  totalElements,
  toWorkFilterStatus,
  workScope,
  workStatus,
  type WorkStatus,
} from '@/lib/works';

export const dynamic = 'force-dynamic';

/** How each state of a case reads in the register's own column. */
const STATUS_TONES: Record<WorkStatus, BadgeTone> = {
  overdue: 'danger',
  dueToday: 'warn',
  dueSoon: 'warn',
  received: 'ok',
  open: 'neutral',
};

/** Padding and alignment shared by every cell in the register. */
const CELL = 'px-3 py-3 align-top';

/**
 * The rule that opens a case. Every cell on a case's first row carries it, so
 * collapsing draws one line across the table rather than nine stubs.
 */
const CASE_TOP = 'border-t-2 border-line';

/** The hairline between two pieces of work inside one case. */
const LINE_TOP = 'border-t border-line';

const HEAD_BASE =
  'bg-surface px-3 py-3 text-left align-bottom text-[0.82rem] font-bold tracking-wide text-ink-faint uppercase';

/**
 * The headings stay put while the month scrolls under them. `inset` shadow
 * rather than a border, because a collapsed border does not travel with a
 * sticky cell — it is painted by the table, which is what scrolls away.
 */
const HEAD = cn(
  HEAD_BASE,
  'md:sticky md:top-0 md:z-10 md:shadow-[inset_0_-2px_0_var(--color-line-strong)]',
);

/** Pinned in both directions: it is the last column and it is the first row. */
const HEAD_ACTIONS = cn(
  HEAD_BASE,
  'md:sticky md:top-0 md:right-0 md:z-20',
  'md:shadow-[inset_0_-2px_0_var(--color-line-strong),inset_1px_0_0_var(--color-line)]',
);

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
 * One wide table, the way the practice already keeps it on paper: a case per
 * row-group with the lab's serial, who it is for, a number to ring, and the
 * work itself — one row per piece, because a case is hardly ever one thing.
 *
 * The pieces are real table rows rather than a grid inside a cell, and the case
 * columns `rowSpan` across them. That is the whole difference: a grid quoted
 * twice, once in the heading and once in the body, is two grids that size their
 * own columns to their own contents and drift apart on the first long procedure
 * name. Letting the table lay out the table costs nothing and cannot drift.
 *
 * What the register is *for* is the element column and the line under the
 * table. A laboratory bills by the element and sometimes bills for more than it
 * was sent; this is the practice's own count, and the monthly total at the foot
 * is the figure the invoice gets held against. That is also why the default view
 * is this month rather than everything: the month is the unit the bill arrives
 * in.
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
  searchParams: Promise<{
    q?: string;
    lab?: string;
    month?: string;
    status?: string;
  }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('work.view');
  const canEdit = user.permissions.includes('work.edit');
  const canDelete = user.permissions.includes('work.delete');
  // A separate question from `work.edit`: the front desk chases cases it may not
  // rewrite, and chasing is exactly what the board is for.
  const canFollowUp = user.permissions.includes('followup.edit');
  const showActions = canEdit || canDelete || canFollowUp;

  const t = await getTranslations('works');
  const tc = await getTranslations('common');
  // The four corners of the mouth in words, for the readers who cannot see the
  // bracket the span is drawn in.
  const tt = await getTranslations('teeth');
  const format = await getFormatter();

  const { q, lab, month, status } = await searchParams;
  const query = (q ?? '').trim();
  const labFilter = lab ?? '';
  const statusFilter = toWorkFilterStatus(status);

  const day = today();
  const dayKey = toDateKey(day);

  // Four questions about the register as a whole, none of which needs the
  // register itself. They come first because the month the page opens on is one
  // of the answers, and the rows cannot be asked for until it is known.
  const [days, labRows, lateCount, totalCount, staff, procedures] = await Promise.all([
    // Every day the register has anything on, one column wide, newest first —
    // which is what `monthsPresent` folds into months. Days rather than a
    // `date_trunc` group, so this stays a query Prisma can write on any
    // database; there are at most three hundred and sixty-five a year.
    prisma.work.findMany({
      select: { sentAt: true },
      distinct: ['sentAt'],
      orderBy: { sentAt: 'desc' },
    }),
    // Every laboratory the register has ever named, for the filter.
    prisma.workLine.findMany({ select: { lab: true }, distinct: ['lab'] }),
    // What the practice is still waiting on, across the whole register rather
    // than the month on screen — the count is the reason to press the filter,
    // so it must not be scoped by a filter nobody has pressed yet. Counted by
    // the index on (receivedAt, dueAt) rather than by reading the rows.
    prisma.work.count({ where: { receivedAt: null, dueAt: { lt: day } } }),
    prisma.work.count(),
    canFollowUp ? getAssignableStaff() : Promise.resolve([]),
    // What the edit dialog's `punimi` field offers. Only fetched for somebody
    // who can open that dialog.
    canEdit ? getProcedureOptions() : Promise.resolve([]),
  ]);

  const months = monthsPresent(days);
  const monthFilter = resolveWorkMonth(months, month, statusFilter);

  const labs = [...new Set(labRows.map((line) => line.lab?.trim()).filter(Boolean))].sort(
    (a, b) => a!.localeCompare(b!),
  ) as string[];

  const filters = { query, lab: labFilter, month: monthFilter, status: statusFilter };

  const scoped = await prisma.work.findMany({
    // The coarse half of the filter, done where the rows are. See `workScope`:
    // it is allowed to be wider than `filterWorks` and never narrower, so what
    // comes back is a superset of what the screen shows.
    where: workScope(filters, day),
    // Newest first: the row somebody is looking for is nearly always the one
    // written this week. `number` breaks the tie so two cases sent on one day
    // keep the order they were written in — it is still the register's own
    // sequence, it just no longer has a column of its own.
    orderBy: [{ sentAt: 'desc' }, { number: 'desc' }],
    include: { lines: { orderBy: { position: 'asc' } } },
  });

  // The fine half: the search box, and the laboratory. Both stay here because
  // `matches()` folds accents and `ILIKE` does not — typing *puron* has to find
  // *Purón* — and because a lab is named on the lines, not on the case.
  const works = filterWorks(scoped, filters, day);

  // Whether anything is actually narrowed. The month is always set and so is
  // never evidence on its own — the register opening where it always opens is
  // not a filter, and a Clear button that clears nothing is worse than none.
  // Widening to every month *is* a choice, hence the comparison rather than a
  // truth test.
  const isFiltered = Boolean(
    query || labFilter || statusFilter || monthFilter !== (months[0] ?? null),
  );
  const elementTotal = totalElements(works);

  const monthLabel = (key: string) =>
    format.dateTime(new Date(`${key}-01T00:00:00.000Z`), {
      month: 'long',
      year: 'numeric',
    });

  // The year is only worth its width when the view can hold more than one. On a
  // month it is the same four digits down the whole column; across every month
  // it is the difference between last August and this one.
  const dateStyle = monthFilter
    ? ({ day: '2-digit', month: '2-digit' } as const)
    : ({ day: '2-digit', month: '2-digit', year: '2-digit' } as const);

  // Padded rather than left to the locale's own pattern — the reasoning is on
  // `paddedDateFormat`. The register's PDF calls the same function, so a date
  // that lines up in this column lines up in that one.
  const shortDate = paddedDateFormat(locale, dateStyle);

  // The export carries whatever the screen is showing — a filtered register is a
  // deliberate selection, and exporting the whole thing instead would silently
  // hand back rows the person just narrowed away.
  const exportQuery = new URLSearchParams();
  if (query) exportQuery.set('q', query);
  if (labFilter) exportQuery.set('lab', labFilter);
  if (statusFilter) exportQuery.set('status', statusFilter);
  exportQuery.set('month', monthFilter ?? 'all');
  // The route sits outside the `[locale]` segment and so has no language of its
  // own — without this the column headings would always come out in Albanian.
  exportQuery.set('locale', locale);
  const exportHref = `/api/works/export?${exportQuery}`;
  // The same selection, on paper. Only `format` differs, so the two buttons
  // cannot come to disagree about what it is they are handing over.
  const pdfHref = `${exportHref}&format=pdf`;

  const newLink = canEdit ? (
    <Link href="/works/new" className="btn btn-primary">
      <Plus size={20} aria-hidden />
      {t('new')}
    </Link>
  ) : null;

  const columnCount = 8 + (showActions ? 1 : 0);

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
            {totalCount > 0 ? (
              <>
                {/* Two files, one selection. The spreadsheet is for the practice
                    — sorted, filtered, summed against the invoice. The sheet is
                    for handing over: it carries the letterhead, so it is a
                    document from this practice rather than a table from some
                    software, and it looks the same on the laboratory's screen as
                    it did on this one. */}
                <a href={exportHref} className="btn btn-secondary" download data-print-hide>
                  <Download size={20} aria-hidden />
                  {t('export')}
                </a>
                <a href={pdfHref} className="btn btn-secondary" download data-print-hide>
                  <FileText size={20} aria-hidden />
                  {t('exportPdf')}
                </a>
              </>
            ) : null}
            {newLink}
          </>
        }
      />

      {totalCount > 0 ? (
        <FilterBar
          basePath="/works"
          label={tc('filters')}
          filtered={isFiltered}
          values={{
            q: query,
            lab: labFilter,
            month: monthFilter ?? 'all',
            status: statusFilter,
          }}
          search={{
            name: 'q',
            label: tc('search'),
            placeholder: t('searchPlaceholder'),
          }}
          selects={[
            {
              name: 'status',
              label: t('status'),
              anyLabel: t('anyStatus'),
              options: [
                // Late leads, and says how many: it is the only one of these
                // that is a problem rather than a view.
                {
                  value: 'late',
                  label: t('statusLateCount', { count: lateCount }),
                },
                { value: 'out', label: t('statusOut') },
                { value: 'back', label: t('statusBack') },
              ],
            },
            {
              name: 'month',
              label: t('month'),
              // Every month the register has is a real option, including the one
              // on screen. Leaving the current month out and titling the empty
              // option after it looked the same and was not: the empty option
              // posts "no month", which resolves to the newest one — so pressing
              // Filter from a June search quietly moved the register to August.
              anyValue: 'all',
              anyLabel: t('allMonths'),
              options: months.map((key) => ({
                value: key,
                label: monthLabel(key),
              })),
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
          summary={t('showing', {
            count: works.length,
            total: totalCount,
          })}
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
        // The scroll lives in a box of its own rather than in the page, so the
        // sideways bar is at the bottom of the *view* and not under the last row
        // of a forty-case month, where nobody would ever find it. It is also
        // what gives the headings and the total something to stick to.
        <div className="register-scroll card md:max-h-[calc(100vh-15rem)] md:overflow-auto">
          <table className="register w-full border-collapse text-left md:min-w-[52rem]">
            <caption className="sr-only">
              {monthFilter ? `${t('title')} — ${monthLabel(monthFilter)}` : t('title')}
            </caption>

            {/* Widths as hints, not law: the dates, the count and the buttons
                know how wide they need to be, and everything left over goes to
                the two columns that hold words. */}
            <colgroup>
              <col className="w-[4.5rem]" />
              <col className="w-[8rem]" />
              <col className="w-[5rem]" />
              <col className="w-[14rem]" />
              <col className="w-[7rem]" />
              <col className="w-[3.5rem]" />
              <col />
              <col className="w-[7rem]" />
              {showActions ? <col className="w-[7.5rem]" /> : null}
            </colgroup>

            <thead>
              <tr>
                <th scope="col" data-cell="sent" className={cn(HEAD, 'md:pl-5')}>
                  {t('sentAt')}
                </th>
                <th scope="col" data-cell="due" className={HEAD}>
                  {t('dueAt')}
                </th>
                <th scope="col" data-cell="serial" className={HEAD}>
                  {t('labSerial')}
                </th>
                <th scope="col" data-cell="patient" className={HEAD}>
                  {t('patientName')}
                </th>
                <th scope="col" data-cell="teeth" className={HEAD}>
                  {t('teeth')}
                </th>
                {/* The docket's own abbreviation. The column is three characters
                    wide and the word is nine; the full one is still read out. */}
                <th scope="col" data-cell="elements" className={cn(HEAD, 'text-right')}>
                  <span aria-hidden>{t('elementsShort')}</span>
                  <span className="sr-only">{t('elements')}</span>
                </th>
                <th scope="col" data-cell="procedure" className={HEAD}>
                  {t('procedure')}
                </th>
                <th scope="col" data-cell="lab" className={HEAD}>
                  {t('lab')}
                </th>
                {showActions ? (
                  <th scope="col" data-cell="actions" className={HEAD_ACTIONS} data-print-hide>
                    <span className="sr-only">{tc('actions')}</span>
                  </th>
                ) : null}
              </tr>
            </thead>

            {/* A row group per case, which is what a case is. It is also what
                lets the phone turn one into a card — see `.register` in
                globals.css. */}
            {works.map((work) => {
              const state = workStatus(work, day);
              const hasTotal = work.lines.length > 1;
              const rowSpan = Math.max(1, work.lines.length) + (hasTotal ? 1 : 0);
              const overdue = state === 'overdue';

              // The pinned column has to paint its own background, or the row
              // would scroll out from underneath it.
              const pinned = cn(
                'md:sticky md:right-0 md:shadow-[inset_1px_0_0_var(--color-line)]',
                overdue ? 'bg-danger-soft' : 'bg-surface',
              );

              // The span belongs to the line now. `diagnosis` is what a case
              // written before the chart existed has instead, so it only speaks
              // when the lines have nothing to say — printing both prints the
              // same bridge twice, in two notations that need not agree.
              const legacySpan = work.lines.some((line) => line.teeth) ? null : work.diagnosis;
              const phone = work.phone.trim();

              const lineCells = (line: (typeof work.lines)[number], edge: string) => (
                <>
                  <td data-cell="teeth" data-label={t('teeth')} className={cn(CELL, edge)}>
                    {line.teeth ? (
                      <ToothSpan
                        value={line.teeth}
                        quadrantLabel={(quadrant) => tt(`quadrant_${quadrant}`)}
                        className="text-[0.95rem]"
                      />
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                  <td
                    data-cell="elements"
                    data-label={t('elements')}
                    className={cn(
                      CELL,
                      edge,
                      'text-right text-[1rem] font-bold text-ink tabular-nums',
                    )}
                  >
                    {line.elements}
                  </td>
                  <td
                    data-cell="procedure"
                    className={cn(CELL, edge, 'text-[0.98rem] font-semibold break-words text-ink')}
                  >
                    {line.procedure}
                  </td>
                  <td
                    data-cell="lab"
                    data-label={t('lab')}
                    className={cn(CELL, edge, 'text-[0.95rem] break-words text-ink-soft')}
                  >
                    {line.lab || '—'}
                  </td>
                </>
              );

              return (
                // A late case is tinted rather than badged alone: on a table
                // this wide the status column is a long way from the name, and
                // the row is what the eye actually scans.
                <tbody key={work.id} className={cn(overdue && 'bg-danger-soft')}>
                  <tr>
                    <td
                      rowSpan={rowSpan}
                      data-cell="sent"
                      data-label={t('sentAt')}
                      className={cn(
                        CELL,
                        CASE_TOP,
                        'text-[0.95rem] text-ink-soft tabular-nums md:pl-5',
                      )}
                    >
                      {shortDate(work.sentAt)}
                    </td>

                    {/* When it is due back, and what that means today. The one
                        column the paper register never had, and the one the
                        practice is actually rung about. */}
                    <td
                      rowSpan={rowSpan}
                      data-cell="due"
                      data-label={t('dueAt')}
                      className={cn(CELL, CASE_TOP, 'text-[0.95rem] tabular-nums')}
                    >
                      {work.receivedAt ? (
                        <>
                          <span className="block text-ink-soft">{shortDate(work.receivedAt)}</span>
                          <Badge tone={STATUS_TONES.received}>{t('statusBack')}</Badge>
                        </>
                      ) : work.dueAt ? (
                        <>
                          <span className="block text-ink-soft">{shortDate(work.dueAt)}</span>
                          {/* Only when there is something to say. A case due in
                              three weeks gets its date and no colour — a
                              register where every open row wears a badge has no
                              badges. */}
                          {state === 'overdue' ? (
                            <Badge tone={STATUS_TONES.overdue}>
                              {t('lateByDays', { days: daysLate(work, day) })}
                            </Badge>
                          ) : state === 'dueToday' ? (
                            <Badge tone={STATUS_TONES.dueToday}>{t('statusDueToday')}</Badge>
                          ) : state === 'dueSoon' ? (
                            <Badge tone={STATUS_TONES.dueSoon}>{t('statusDueSoon')}</Badge>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>

                    <td
                      rowSpan={rowSpan}
                      data-cell="serial"
                      data-label={t('labSerial')}
                      className={cn(
                        CELL,
                        CASE_TOP,
                        'text-[1rem] font-semibold text-ink tabular-nums',
                      )}
                    >
                      {work.labSerial || <span className="text-ink-faint">—</span>}
                    </td>

                    <td
                      rowSpan={rowSpan}
                      data-cell="patient"
                      className={cn(CELL, CASE_TOP, 'text-[1rem] text-ink')}
                    >
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {/* The link is there when the case was written against a
                            record; the text is the register's own copy either
                            way. */}
                        {work.patientId ? (
                          <Link href={`/patients/${work.patientId}`} className="font-semibold">
                            {work.patientName}
                          </Link>
                        ) : (
                          <span className="font-semibold">{work.patientName}</span>
                        )}
                        {/* Beside the name, not beside the date: urgent is a
                            property of the case, and against the due column it
                            read as a badge on a promise that may not exist. */}
                        {work.urgent ? <Badge tone="alert">{t('urgent')}</Badge> : null}
                      </span>

                      {phone ? (
                        <a
                          href={`tel:${phone.replace(/\s/g, '')}`}
                          className="mt-0.5 block text-[0.95rem] text-ink-soft tabular-nums"
                        >
                          {work.phone}
                        </a>
                      ) : null}

                      {legacySpan ? (
                        <span className="mt-0.5 block text-[0.92rem] text-ink-soft tabular-nums">
                          {legacySpan}
                        </span>
                      ) : null}

                      {work.notes ? (
                        <span className="mt-0.5 block text-[0.88rem] text-ink-faint italic">
                          {work.notes}
                        </span>
                      ) : null}
                    </td>

                    {work.lines.length > 0 ? (
                      lineCells(work.lines[0], CASE_TOP)
                    ) : (
                      <td
                        colSpan={4}
                        data-cell="no-lines"
                        className={cn(CELL, CASE_TOP, 'text-[0.95rem] text-ink-faint')}
                      >
                        —
                      </td>
                    )}

                    {showActions ? (
                      <td
                        rowSpan={rowSpan}
                        data-cell="actions"
                        className={cn(CELL, CASE_TOP, pinned)}
                        data-print-hide
                      >
                        <div className="flex items-center justify-end gap-2">
                          {/* The one whole verb of the four, and the only one
                              left out on the row: a box arrives from the
                              laboratory and somebody marks it. The chase list is
                              worth exactly as much as this button is easy to
                              press — behind a menu it would be two clicks a
                              case, all day. The rest are weekly at most, and
                              four buttons in a column this narrow wrapped onto
                              two lines and read as four equal demands. */}
                          {canEdit ? (
                            <ActionForm action={markWorkReceived} values={{ id: work.id }}>
                              <button
                                type="submit"
                                className={cn(
                                  'btn btn-sm',
                                  work.receivedAt ? 'btn-ghost' : 'btn-secondary',
                                )}
                                title={work.receivedAt ? t('markOut') : t('markBack')}
                              >
                                {work.receivedAt ? (
                                  <Undo2 size={17} aria-hidden />
                                ) : (
                                  <Check size={17} aria-hidden />
                                )}
                                <span className="sr-only">
                                  {work.receivedAt ? t('markOut') : t('markBack')}
                                </span>
                              </button>
                            </ActionForm>
                          ) : null}

                          <ActionMenu label={tc('moreActions')} floating>
                            {/* First in the menu, and the one item here that is
                                needed while the case is being *written* rather
                                than chased: the box does not leave the building
                                without a slip in it. Everything below is
                                housekeeping on a case already sent. */}
                            <Link
                              href={`/works/${work.id}/print`}
                              className="menu-item"
                              role="menuitem"
                            >
                              <Printer size={17} aria-hidden />
                              {t('docketPrint')}
                            </Link>

                            {/* The same slip as a file. A plain anchor rather
                                than `Link`: it is a download from a route that
                                sits outside the `[locale]` segment, so it takes
                                the language as a parameter and must not be
                                prefetched as though it were a page. */}
                            <a
                              href={`/api/works/${work.id}/docket?locale=${locale}`}
                              className="menu-item"
                              role="menuitem"
                              download
                            >
                              <FileText size={17} aria-hidden />
                              {t('docketDownload')}
                            </a>

                            {/* Only the case, never the patient behind it: a
                                line about a crown should open the register at
                                that crown, and `followUpLink` reads the patient
                                first. */}
                            {canFollowUp ? (
                              <FollowUpFormDialog
                                staff={staff}
                                today={dayKey}
                                link={{ workId: work.id }}
                                triggerClassName="menu-item"
                              />
                            ) : null}

                            {canEdit ? (
                              <div className={canFollowUp ? 'border-t border-line' : undefined}>
                                <WorkFormDialog
                                  labs={labs}
                                  procedures={procedures}
                                  triggerClassName="menu-item"
                                  work={{
                                    id: work.id,
                                    labSerial: work.labSerial ?? '',
                                    patientId: work.patientId ?? '',
                                    patientName: work.patientName,
                                    phone: work.phone,
                                    diagnosis: work.diagnosis ?? '',
                                    notes: work.notes ?? '',
                                    sentAt: toDateKey(work.sentAt),
                                    dueAt: work.dueAt ? toDateKey(work.dueAt) : '',
                                    receivedAt: work.receivedAt ? toDateKey(work.receivedAt) : '',
                                    urgent: work.urgent,
                                    lines: work.lines.map((line) => ({
                                      elements: line.elements,
                                      procedure: line.procedure,
                                      lab: line.lab ?? '',
                                      teeth: line.teeth ?? '',
                                    })),
                                  }}
                                />
                              </div>
                            ) : null}

                            {canDelete ? (
                              <ActionForm
                                action={deleteWork}
                                values={{ id: work.id }}
                                confirmMessage={tc('confirmDelete')}
                                className={
                                  canEdit || canFollowUp ? 'block border-t border-line' : 'block'
                                }
                              >
                                <button
                                  type="submit"
                                  role="menuitem"
                                  className="menu-item menu-item-danger"
                                >
                                  <Trash2 size={19} aria-hidden className="shrink-0" />
                                  {tc('delete')}
                                </button>
                              </ActionForm>
                            ) : null}
                          </ActionMenu>
                        </div>
                      </td>
                    ) : null}
                  </tr>

                  {work.lines.slice(1).map((line) => (
                    <tr key={line.id}>{lineCells(line, LINE_TOP)}</tr>
                  ))}

                  {/* Only once there is something to add up. On a single-line
                      case the line is already the total. */}
                  {hasTotal ? (
                    <tr>
                      <td
                        data-cell="total-label"
                        className={cn(
                          CELL,
                          LINE_TOP,
                          'text-right text-[0.82rem] font-semibold tracking-wide text-ink-faint uppercase',
                        )}
                      >
                        {t('elementsTotal')}
                      </td>
                      <td
                        data-cell="total"
                        className={cn(
                          CELL,
                          LINE_TOP,
                          'text-right text-[1rem] font-bold text-ink tabular-nums',
                        )}
                      >
                        {elementsOf(work)}
                      </td>
                      <td colSpan={2} data-cell="filler" className={cn(CELL, LINE_TOP)} />
                    </tr>
                  ) : null}
                </tbody>
              );
            })}

            {/* The month's bill, in one number. This is the line the invoice is
                held against, so it stays under the table — and stays on screen,
                because a total you have to scroll to the end of August to read
                is a total nobody checks. */}
            <tfoot>
              <tr>
                <td
                  colSpan={columnCount}
                  className={cn(
                    'border-t-2 border-line-strong bg-surface-soft px-5 py-3',
                    'md:sticky md:bottom-0 md:z-10 md:shadow-[inset_0_2px_0_var(--color-line-strong)]',
                  )}
                >
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
