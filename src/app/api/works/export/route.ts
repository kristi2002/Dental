import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { NextResponse } from 'next/server';
import { routing } from '@/i18n/routing';
import { recordAudit } from '@/lib/auth/guard';
import { getCurrentUser } from '@/lib/auth/session';
import { csvResponse } from '@/lib/csv';
import { toDateKey } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { matches } from '@/lib/utils';
import { worksToRows } from '@/lib/works';

/** Same sentinel the register's own lab filter uses. */
const NO_LAB = '__none__';

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
    // forwards, and row 1 should be case 1.
    orderBy: { number: 'asc' },
    include: { lines: { orderBy: { position: 'asc' } } },
  });

  // The same two filters the page applies, in the same order and with the same
  // accent-folding comparison, so the file and the screen can never disagree.
  const filtered = works.filter((work) => {
    if (labFilter === NO_LAB) {
      if (work.lines.some((line) => line.lab?.trim())) return false;
    } else if (labFilter && !work.lines.some((line) => line.lab?.trim() === labFilter)) {
      return false;
    }

    if (!query) return true;

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

  const rows = worksToRows(
    filtered,
    {
      number: t('number'),
      labSerial: t('labSerial'),
      patientName: t('patientName'),
      phone: t('phone'),
      diagnosis: t('diagnosis'),
      elements: t('elements'),
      procedure: t('procedure'),
      lab: t('lab'),
      notes: t('exportNotes'),
      createdAt: t('createdAt'),
    },
    toDateKey,
  );

  // A file of patient names and phone numbers leaving the building is worth a
  // line in the trail, the same as a backup is.
  await recordAudit(user, {
    action: 'export',
    entity: 'work',
    summary: `${filtered.length} / ${works.length}`,
  });

  return csvResponse(`${t('exportFileName')}-${toDateKey(new Date())}.csv`, rows);
}
