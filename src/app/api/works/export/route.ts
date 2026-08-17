import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { NextResponse } from 'next/server';
import { routing } from '@/i18n/routing';
import { recordAudit } from '@/lib/auth/guard';
import { getCurrentUser } from '@/lib/auth/session';
import { csvResponse } from '@/lib/csv';
import { toDateKey, today } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import {
  filterWorks,
  monthsPresent,
  resolveWorkMonth,
  totalElements,
  toWorkFilterStatus,
  worksToRows,
} from '@/lib/works';

/**
 * The works register as a spreadsheet.
 *
 * The one thing a register is for that a screen cannot do: hand the whole thing
 * over. The filters travel with it, so what downloads is what was on screen —
 * see the note on `exportHref` in the page.
 *
 * The file is flattened to one row per piece of work rather than per case; the
 * reasoning is on `worksToRows`, which is also where that shape is tested.
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

  // This route sits outside the `[locale]` segment, so there is no segment to
  // read the language from — the page passes it, and anything unrecognised falls
  // back rather than throwing.
  const requested = url.searchParams.get('locale');
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: 'works' });

  const works = await prisma.work.findMany({
    // Oldest first, unlike the screen: a register read in a spreadsheet is read
    // forwards, and row 1 should be the first case of the month.
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

  // The page's own filter, called rather than copied — the promise that the file
  // is what was on screen is only kept if there is one implementation of it.
  const filtered = filterWorks(
    works,
    { query, lab: labFilter, month: monthFilter, status: statusFilter },
    today(),
  );

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

  // A file of patient names and phone numbers leaving the building is worth a
  // line in the trail, the same as a backup is. The element count goes in it
  // too: this file is what a billing dispute will be argued from, so the trail
  // should say what figure left the building and when.
  await recordAudit(user, {
    action: 'export',
    entity: 'work',
    summary: `${monthFilter ?? 'all'} · ${filtered.length} · ${totalElements(filtered)}`,
  });

  // Named for the month it holds, so a folder of these sorts itself.
  const stamp = monthFilter ?? toDateKey(new Date());
  return csvResponse(`${t('exportFileName')}-${stamp}.csv`, rows);
}
