import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { NextResponse } from 'next/server';
import { routing } from '@/i18n/routing';
import { recordView } from '@/lib/auth/guard';
import { getCurrentUser } from '@/lib/auth/session';
import { age, paddedDateFormat } from '@/lib/dates';
import { pdfResponse } from '@/lib/pdf';
import { renderDocket, type DocketField } from '@/lib/pdf-docket';
import { prisma } from '@/lib/prisma';
import { clinicDisplayName, getClinicProfile } from '@/lib/queries';
import { mergeSpans, spanCodes } from '@/lib/tooth-span';

/**
 * The laboratory docket, as a file.
 *
 * The same slip `works/[id]/print` renders on screen — same fields, same order,
 * same chart — but downloaded rather than printed. Both exist because they are
 * for different moments: the page is what somebody reads and checks before the
 * box is sealed, and this is what gets attached to an email when the laboratory
 * rings a fortnight later asking what was sent.
 *
 * Fields are gathered here rather than in `pdf-docket.ts` for the reason the
 * register's are gathered in its route: the wording is the locale's, and the
 * drawing has no business knowing what a laboratory is called in Albanian.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user?.permissions.includes('work.view')) {
    // 404 rather than 403, like the register's export: whether this practice
    // keeps a works register is itself none of an unauthenticated caller's
    // business.
    return new NextResponse(null, { status: 404 });
  }

  const { id } = await params;
  const url = new URL(request.url);

  // Outside the `[locale]` segment, so there is no segment to read the language
  // from — the link passes it, and anything unrecognised falls back.
  const requested = url.searchParams.get('locale');
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  const [work, profile, t, tc, tp] = await Promise.all([
    prisma.work.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { position: 'asc' } },
        // Only the date of birth, and only to write an age on the slip. The
        // laboratory is told how old the patient is because it changes how a
        // denture is made; it is not told who they are beyond the name the
        // register already snapshotted.
        patient: { select: { dateOfBirth: true } },
      },
    }),
    getClinicProfile(),
    getTranslations({ locale, namespace: 'works' }),
    getTranslations({ locale, namespace: 'common' }),
    getTranslations({ locale, namespace: 'patients' }),
  ]);

  if (!work) return new NextResponse(null, { status: 404 });

  await recordView(user, {
    entity: 'work',
    entityId: work.id,
    summary: `Downloaded the laboratory docket for case ${work.number} (${work.patientName})`,
  });

  const day = paddedDateFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });

  // The laboratories this case is going to. Nearly always one — the register
  // keeps the lab per line because a case can be split, and a docket for a split
  // case should say so rather than pick the first and be quietly wrong.
  const labs = [...new Set(work.lines.map((line) => line.lab?.trim()).filter(Boolean))];

  const fields: DocketField[] = [
    { label: t('docketStart'), value: day(work.sentAt) },
    { label: t('lab'), value: labs.join(' · ') },
    { label: t('patientName'), value: work.patientName, wide: true },
    {
      label: tp('ageLabel'),
      value: work.patient?.dateOfBirth ? tp('age', { age: age(work.patient.dateOfBirth) }) : '',
    },
    // Nothing in the register holds the shade: it is chosen at the chair and
    // written on the pad, so it is ruled and left for a pen.
    { label: t('docketShade'), value: '' },
    { label: t('labSerial'), value: work.labSerial ?? '' },
    { label: t('dueAt'), value: work.dueAt ? day(work.dueAt) : '' },
  ];

  const bytes = await renderDocket({
    letterhead: {
      name: clinicDisplayName(profile),
      contact: [profile.phone, profile.email, profile.address]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    },
    title: t('docketTitle'),
    meta: t('docketNumber', { number: work.number }),
    fields,
    urgent: work.urgent ? t('urgent') : undefined,
    work: {
      headers: {
        procedure: t('docketType'),
        teeth: t('teeth'),
        elements: t('elementsShort'),
      },
      lines: work.lines.map((line) => ({
        procedure: line.procedure,
        teeth: spanCodes(line.teeth),
        elements: String(line.elements),
      })),
      total: {
        label: t('elementsTotal'),
        value: String(work.lines.reduce((sum, line) => sum + line.elements, 0)),
      },
    },
    // The same merge the screen's chart uses, so the two cannot mark different
    // teeth for one case.
    positions: mergeSpans(work.lines),
    notes: work.notes ?? undefined,
    stages: [
      t('docketStageFrame'),
      t('docketStageDentine'),
      t('docketStageFinish'),
      t('docketStageTray'),
    ],
    stageTime: t('docketTime'),
    footNote: t('exportedAt', { date: day(new Date()) }),
    pageLabel: (page, pages) => tc('pageOf', { page, pages }),
  });

  // Named for the case, so a folder of these sorts itself and a laboratory
  // querying an invoice can be sent the one slip it asked about.
  return pdfResponse(`${t('docketFileName')}-${work.number}.pdf`, bytes);
}
