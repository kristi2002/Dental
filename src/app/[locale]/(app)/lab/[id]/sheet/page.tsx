import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { LabToothChart } from '@/components/lab/LabToothChart';
import { PrintButton } from '@/components/prescriptions/PrintButton';
import { requirePermission } from '@/lib/auth/guard';
import { isLabCareGuide } from '@/lib/lab';
import { prisma } from '@/lib/prisma';
import { getClinicProfile } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/**
 * The work order, as the sheet of paper that travels with the case.
 *
 * Printed by the browser like the prescription sheet — `print:` utilities strip
 * the app chrome, and the chart goes with it, because a drawing of which teeth
 * and which faces is the one instruction a technician cannot afford to
 * misread off a list of numbers.
 */
export default async function LabWorkOrderSheet({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  await requirePermission('plan.view');

  const t = await getTranslations('lab');
  const tc = await getTranslations('common');
  const format = await getFormatter();

  const [labCase, profile] = await Promise.all([
    prisma.labCase.findUnique({
      where: { id },
      include: {
        patient: { select: { firstName: true, lastName: true, phone: true } },
        items: { orderBy: { position: 'asc' } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    }),
    getClinicProfile(),
  ]);
  if (!labCase) notFound();

  const clinicName = profile.name || process.env.NEXT_PUBLIC_CLINIC_NAME || 'DentOrganizer';
  const day = (value: Date) =>
    format.dateTime(value, { day: 'numeric', month: 'long', year: 'numeric' });

  const window =
    labCase.deliveryFrom && labCase.deliveryTo
      ? `${labCase.deliveryFrom}–${labCase.deliveryTo}`
      : '';

  return (
    <div className="mx-auto max-w-[52rem]">
      <div className="mb-4 print:hidden">
        <PrintButton label={t('printOrder')} />
      </div>

      <article className="card p-8 print:border-0 print:shadow-none">
        <header className="flex items-start justify-between gap-6 border-b-2 border-line pb-4">
          <div>
            <h1 className="text-2xl font-bold text-ink">{clinicName}</h1>
            <p className="text-[1rem] text-ink-soft">{t('orderTitle')}</p>
          </div>
          <p className="text-right text-[0.95rem] text-ink-soft tabular-nums">
            {day(labCase.createdAt)}
          </p>
        </header>

        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[1.05rem] sm:grid-cols-[auto_1fr_auto_1fr]">
          <dt className="font-bold text-ink-faint">{t('patient')}</dt>
          <dd className="text-ink">
            {labCase.patient.lastName} {labCase.patient.firstName}
          </dd>

          <dt className="font-bold text-ink-faint">{t('phone')}</dt>
          <dd className="text-ink tabular-nums">{labCase.patient.phone}</dd>

          <dt className="font-bold text-ink-faint">{t('labName')}</dt>
          <dd className="text-ink">{labCase.labName}</dd>

          <dt className="font-bold text-ink-faint">{t('kind')}</dt>
          <dd className="text-ink">{labCase.kind}</dd>

          <dt className="font-bold text-ink-faint">{t('sentAt')}</dt>
          <dd className="text-ink tabular-nums">{day(labCase.sentAt)}</dd>

          <dt className="font-bold text-ink-faint">{t('dueAt')}</dt>
          <dd className="text-ink tabular-nums">
            {labCase.dueAt ? `${day(labCase.dueAt)}${window ? ` · ${window}` : ''}` : tc('none')}
          </dd>

          {labCase.tryInAt ? (
            <>
              <dt className="font-bold text-ink-faint">{t('tryInAt')}</dt>
              <dd className="text-ink tabular-nums">{day(labCase.tryInAt)}</dd>
            </>
          ) : null}
        </dl>

        <section className="mt-6">
          <h2 className="mb-2 text-[0.9rem] font-bold tracking-wide text-ink-faint uppercase">
            {t('chartTitle')}
          </h2>
          <LabToothChart name="teeth-print" defaultValue={labCase.teeth} readOnly
            numbering={profile.toothNumbering} />
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-[0.9rem] font-bold tracking-wide text-ink-faint uppercase">
            {t('items')}
          </h2>
          {labCase.items.length === 0 ? (
            <p className="text-ink-faint">{t('noItems')}</p>
          ) : (
            <ol className="space-y-1.5">
              {labCase.items.map((item) => (
                <li key={item.id} className="flex gap-3 text-[1.05rem]">
                  <span className="font-bold text-ink-faint tabular-nums">{item.position}.</span>
                  <span className="text-ink">
                    {item.name}
                    {item.notes ? (
                      <span className="text-ink-soft"> — {item.notes}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {labCase.notes ? (
          <section className="mt-6">
            <h2 className="mb-2 text-[0.9rem] font-bold tracking-wide text-ink-faint uppercase">
              {t('comment')}
            </h2>
            <p className="text-[1.05rem] whitespace-pre-line text-ink">{labCase.notes}</p>
          </section>
        ) : null}

        {labCase.careInstructions && isLabCareGuide(labCase.careInstructions) ? (
          <section className="mt-6 rounded-lg border border-line bg-paper p-4">
            <h2 className="mb-1 text-[0.9rem] font-bold tracking-wide text-ink-faint uppercase">
              {t('careInstructions')}
            </h2>
            <p className="font-semibold text-ink">{t(`care_${labCase.careInstructions}`)}</p>
            <p className="mt-1 text-[1rem] text-ink-soft">
              {t(`careBody_${labCase.careInstructions}`)}
            </p>
          </section>
        ) : null}

        <footer className="mt-10 flex justify-end">
          <div className="w-64 border-t-2 border-line pt-2 text-center text-[0.95rem] text-ink-soft">
            {labCase.createdBy
              ? `${labCase.createdBy.firstName} ${labCase.createdBy.lastName}`
              : ''}
            <span className="block text-[0.85rem] text-ink-faint">{t('sheetSignature')}</span>
          </div>
        </footer>
      </article>
    </div>
  );
}

