import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { NextResponse } from 'next/server';
import { routing } from '@/i18n/routing';
import { recordAudit } from '@/lib/auth/guard';
import { getCurrentUser } from '@/lib/auth/session';
import { csvResponse } from '@/lib/csv';
import { paddedDateFormat, toDateKey, today } from '@/lib/dates';
import { pdfResponse } from '@/lib/pdf';
import { renderSheet } from '@/lib/pdf-sheet';
import { prisma } from '@/lib/prisma';
import { clinicDisplayName, getClinicProfile } from '@/lib/queries';
import { worksToSheet } from '@/lib/works-sheet';
import {
  filterWorks,
  fromMonthKey,
  monthsPresent,
  NO_LAB,
  resolveWorkMonth,
  totalElements,
  toWorkFilterStatus,
  worksToRows,
} from '@/lib/works';

/**
 * The works register, handed over.
 *
 * The one thing a register is for that a screen cannot do: give the whole thing
 * to somebody else. The filters travel with it, so what downloads is what was on
 * screen — see the note on `exportHref` in the page.
 *
 * It leaves in one of two shapes, and they are for two different people.
 *
 * The **spreadsheet** is for the practice. It is flattened to one row per piece
 * of work rather than per case, because a spreadsheet is sorted and filtered and
 * summed and none of that works on a cell holding four lines; the reasoning is
 * on `worksToRows`, which is also where that shape is tested.
 *
 * The **sheet** is for everyone else — the laboratory querying an invoice, the
 * accountant, the folder the practice keeps. It is the register as a document:
 * the case written once with its items under it, the practice's letterhead at
 * the top, and the element total ruled off at the foot. That letterhead is the
 * point of it. A CSV of patient names is a table that came out of some software;
 * the same month with the mark on it is a document from this practice, and it
 * arrives looking the same on every machine it is opened on.
 *
 * Both come out of the same query and the same `filterWorks`, so the two files
 * cannot come to disagree about which cases the month contains.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.permissions.includes('work.view')) {
    // 404 rather than 403, like the document route: whether this practice keeps
    // a works register is itself none of an unauthenticated caller's business.
    return new NextResponse(null, { status: 404 });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim();
  const labFilter = url.searchParams.get('lab') ?? '';
  const wantsPdf = url.searchParams.get('format') === 'pdf';

  // This route sits outside the `[locale]` segment, so there is no segment to
  // read the language from — the page passes it, and anything unrecognised falls
  // back rather than throwing.
  const requested = url.searchParams.get('locale');
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: 'works' });

  const works = await prisma.work.findMany({
    // Oldest first, unlike the screen: a register read in a spreadsheet or on
    // paper is read forwards, and row 1 should be the first case of the month.
    orderBy: [{ sentAt: 'asc' }, { number: 'asc' }],
    include: { lines: { orderBy: { position: 'asc' } } },
  });

  // Same rule as the page: a month unless the caller asked for the whole run,
  // defaulting to the newest month the register has anything in. The invoice
  // arrives monthly, so that is the file somebody means by "export".
  const statusFilter = toWorkFilterStatus(url.searchParams.get('status'));
  const monthFilter = resolveWorkMonth(
    monthsPresent(works),
    url.searchParams.get('month'),
    statusFilter,
  );

  const day = today();

  // The page's own filter, called rather than copied — the promise that the file
  // is what was on screen is only kept if there is one implementation of it.
  const filtered = filterWorks(
    works,
    { query, lab: labFilter, month: monthFilter, status: statusFilter },
    day,
  );

  // A file of patient names and phone numbers leaving the building is worth a
  // line in the trail, the same as a backup is. The element count goes in it
  // too: this file is what a billing dispute will be argued from, so the trail
  // should say what figure left the building, when, and in which shape — the
  // sheet is the one that gets forwarded to the laboratory.
  await recordAudit(user, {
    action: 'export',
    entity: 'work',
    summary: `${wantsPdf ? 'pdf' : 'csv'} · ${monthFilter ?? 'all'} · ${filtered.length} · ${totalElements(filtered)}`,
  });

  // Named for the month it holds, so a folder of these sorts itself.
  const stamp = monthFilter ?? toDateKey(new Date());

  if (wantsPdf) {
    const tc = await getTranslations({ locale, namespace: 'common' });
    const profile = await getClinicProfile();

    // The same widths the screen uses, and for the same reason: on one month the
    // year is the same four digits all the way down the column, and across every
    // month it is the difference between last August and this one.
    const shortDate = paddedDateFormat(
      locale,
      monthFilter
        ? { day: '2-digit', month: '2-digit' }
        : { day: '2-digit', month: '2-digit', year: '2-digit' },
    );
    const longDate = paddedDateFormat(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    /**
     * The line under the title: which slice of the register this is.
     *
     * The month is what the paper ledger writes there — *Muaji: Gusht* — and the
     * rest is here because the file promises to be what was on screen. A sheet
     * narrowed to one laboratory and handed to that laboratory has to say so on
     * its face; without it, a month that looks short reads as a month that was
     * quiet rather than one that was filtered.
     */
    function sheetMeta(): string {
      const parts: string[] = [];

      const start = fromMonthKey(monthFilter);
      parts.push(
        start
          ? `${t('month')}: ${new Intl.DateTimeFormat(locale, {
              month: 'long',
              year: 'numeric',
              timeZone: 'UTC',
            }).format(start)}`
          : t('allMonths'),
      );

      if (labFilter) {
        parts.push(labFilter === NO_LAB ? t('noLab') : `${t('lab')}: ${labFilter}`);
      }
      if (statusFilter === 'out') parts.push(t('statusOut'));
      if (statusFilter === 'back') parts.push(t('statusBack'));
      if (statusFilter === 'late') parts.push(t('statusLateCount', { count: filtered.length }));
      if (query) parts.push(`${tc('search')}: ${query}`);

      return parts.join('  ·  ');
    }

    const sheet = worksToSheet(
      filtered,
      {
        sentAt: t('sentAt'),
        dueAt: t('dueAt'),
        labSerial: t('labSerial'),
        patientName: t('patientName'),
        teeth: t('teeth'),
        elements: t('elements'),
        elementsShort: t('elementsShort'),
        procedure: t('procedure'),
        lab: t('lab'),
        urgent: t('urgent'),
        statusBack: t('statusBack'),
        lateBy: (days) => t('lateByDays', { days }),
        total: t('elementsTotal'),
        empty: t('emptyFiltered'),
      },
      shortDate,
      day,
    );

    const bytes = await renderSheet({
      letterhead: {
        // Blank on a practice that has filled in neither Settings nor the deploy
        // variable, and printed blank: a sheet that leaves the building with a
        // product's name where the practice's should be is worse than one with a
        // mark and no caption. See `clinicDisplayName`.
        name: clinicDisplayName(profile),
        contact: [profile.phone, profile.email, profile.address]
          .map((value) => value?.trim())
          .filter((value): value is string => Boolean(value)),
      },
      title: t('sheetTitle'),
      meta: sheetMeta(),
      columns: sheet.columns,
      rows: sheet.rows,
      total: sheet.total,
      footNote: `${t('exportedAt', { date: longDate(new Date()) })} · ${t('caseCount', {
        count: filtered.length,
      })}`,
      pageLabel: (page, pages) => tc('pageOf', { page, pages }),
      emptyNote: t('emptyFiltered'),
      // Eight columns, two of which hold sentences. Portrait would give the
      // procedure column about thirty millimetres and every crown on the sheet
      // would wrap to three lines.
      landscape: true,
    });

    return pdfResponse(`${t('exportFileName')}-${stamp}.pdf`, bytes);
  }

  const rows = worksToRows(
    filtered,
    {
      labSerial: t('labSerial'),
      patientName: t('patientName'),
      phone: t('phone'),
      diagnosis: t('diagnosis'),
      elements: t('elements'),
      procedure: t('procedure'),
      lab: t('lab'),
      notes: t('exportNotes'),
      sentAt: t('sentAt'),
      dueAt: t('dueAt'),
      receivedAt: t('receivedAt'),
      urgent: t('urgent'),
      yes: t('exportYes'),
      total: t('elementsTotal'),
    },
    toDateKey,
  );

  return csvResponse(`${t('exportFileName')}-${stamp}.csv`, rows);
}
