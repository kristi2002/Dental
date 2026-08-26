import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { NextResponse } from 'next/server';
import { routing } from '@/i18n/routing';
import { recordAudit } from '@/lib/auth/guard';
import { getCurrentUser } from '@/lib/auth/session';
import { csvResponse } from '@/lib/csv';
import { toDateKey } from '@/lib/dates';
import { ACTIVE_PATIENTS, fold, patientSearchClauses } from '@/lib/patient-search';
import { patientsToRows } from '@/lib/patients-export';
import { prisma } from '@/lib/prisma';

/**
 * The patient directory as a spreadsheet.
 *
 * Sibling of the works export and built the same way: the filters travel with
 * it, so what downloads is what was on screen. The shape of the file — and the
 * one column deliberately left out of it — is in `patients-export.ts`.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.permissions.includes('patient.view')) {
    // 404 rather than 403, like the works and document routes: whether this
    // practice keeps patients at this address is itself none of an
    // unauthenticated caller's business.
    return new NextResponse(null, { status: 404 });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim();
  const archived = url.searchParams.get('show') === 'archived';

  // This route sits outside the `[locale]` segment, so there is no segment to
  // read the language from — the page passes it, and anything unrecognised falls
  // back rather than throwing.
  const requested = url.searchParams.get('locale');
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const t = await getTranslations({ locale, namespace: 'patients' });
  const tc = await getTranslations({ locale, namespace: 'common' });

  // Assembled exactly as the page assembles it, down to the folded query, so the
  // file and the screen cannot disagree about who is in the list.
  const folded = fold(query);
  const digits = query.replace(/\D/g, '');
  const where = {
    ...(archived ? { NOT: { archivedAt: null } } : ACTIVE_PATIENTS),
    ...(query ? { OR: patientSearchClauses(query, folded, digits) } : {}),
  };

  const patients = await prisma.patient.findMany({
    where,
    // The screen's order, and no pagination: the page shows fifty at a time
    // because a browser has to draw them, and a file has no such excuse — a
    // "patient list" that quietly stopped at row fifty would be a trap.
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    select: {
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      dateOfBirth: true,
      address: true,
      fiscalCode: true,
      guardianName: true,
      guardianPhone: true,
      emergencyContact: true,
      referralSource: true,
      recallMonths: true,
      contactConsent: true,
      preferredChannel: true,
      locale: true,
      createdAt: true,
      archivedAt: true,
    },
  });

  const rows = patientsToRows(
    patients,
    {
      lastName: t('lastName'),
      firstName: t('firstName'),
      phone: t('phone'),
      email: t('email'),
      dateOfBirth: t('dateOfBirth'),
      age: t('ageLabel'),
      address: t('address'),
      fiscalCode: t('fiscalCode'),
      guardian: t('guardianName'),
      guardianPhone: t('guardianPhone'),
      emergencyContact: t('emergencyContact'),
      referralSource: t('referralSource'),
      recallMonths: t('recallEvery'),
      consent: t('contactConsent'),
      channel: t('preferredChannel'),
      language: t('exportLanguage'),
      registered: t('registeredLabel'),
      archived: t('exportArchivedOn'),
      yes: tc('yes'),
      no: tc('no'),
    },
    toDateKey,
  );

  // A file of names, numbers and addresses leaving the building is worth a line
  // in the trail, exactly as the works export and the backup are. The count is
  // in it because "how many records left" is the first question asked after a
  // laptop goes missing.
  await recordAudit(user, {
    action: 'export',
    entity: 'patient',
    summary: `${archived ? 'archived' : 'active'} · ${query || 'all'} · ${patients.length}`,
  });

  return csvResponse(`${t('exportFileName')}-${toDateKey(new Date())}.csv`, rows);
}
