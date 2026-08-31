import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { SheetHead } from '@/components/brand/SheetHead';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { PrintButton } from '@/components/prescriptions/PrintButton';
import { recordView, requirePermission } from '@/lib/auth/guard';
import { age } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { getClinicProfile } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/**
 * The prescription as a sheet of paper.
 *
 * Rendered as an ordinary page and printed by the browser — no PDF pipeline for
 * something that is one page of text, and `print:` utilities strip the app
 * chrome so what comes out of the printer is just the prescription.
 */
export default async function PrescriptionSheet({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('prescription.view');

  const t = await getTranslations('prescriptions');
  const tp = await getTranslations('patients');
  const format = await getFormatter();

  const [prescription, profile] = await Promise.all([
    prisma.prescription.findUnique({
      where: { id },
      include: {
        patient: { select: { firstName: true, lastName: true, dateOfBirth: true } },
        issuedBy: { select: { firstName: true, lastName: true } },
      },
    }),
    getClinicProfile(),
  ]);
  if (!prescription) notFound();

  await recordView(user, {
    entity: 'prescription',
    entityId: prescription.id,
    summary: `Opened a prescription for ${prescription.patient.firstName} ${prescription.patient.lastName}`,
  });

  return (
    <div className="mx-auto max-w-[46rem]">
      {/* The sheet opens in its own tab, so this is the only way back into the
          record it belongs to. */}
      <div
        className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden"
        data-print-hide
      >
        <Breadcrumbs
          items={[
            { href: '/patients', label: tp('title') },
            {
              href: `/patients/${prescription.patientId}?tab=prescriptions`,
              label: `${prescription.patient.lastName} ${prescription.patient.firstName}`,
            },
            { label: t('sheetTitle') },
          ]}
        />
        <PrintButton label={t('print')} />
      </div>

      <article className="card p-8 print:border-0 print:shadow-none">
        <SheetHead
          profile={profile}
          title={t('sheetTitle')}
          meta={format.dateTime(prescription.createdAt, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        />

        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-body">
          <dt className="font-bold text-ink-faint">{t('sheetPatient')}</dt>
          <dd className="text-ink">
            {prescription.patient.lastName} {prescription.patient.firstName}
          </dd>

          {prescription.patient.dateOfBirth ? (
            <>
              <dt className="font-bold text-ink-faint">{tp('ageLabel')}</dt>
              <dd className="text-ink">
                {tp('age', { age: age(prescription.patient.dateOfBirth) })}
              </dd>
            </>
          ) : null}
        </dl>

        <p className="mt-6 min-h-40 text-lead leading-relaxed whitespace-pre-line text-ink">
          {prescription.body}
        </p>

        <footer className="mt-10 flex justify-end">
          <div className="w-64 border-t-2 border-line pt-2 text-center text-body text-ink-soft">
            {prescription.issuedBy
              ? `${prescription.issuedBy.firstName} ${prescription.issuedBy.lastName}`
              : ''}
            <span className="block text-meta text-ink-faint">{t('sheetSignature')}</span>
          </div>
        </footer>
      </article>
    </div>
  );
}
