import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { SheetHead } from '@/components/brand/SheetHead';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { PrintButton } from '@/components/prescriptions/PrintButton';
import { TreatmentStepStatus } from '@/generated/prisma/enums';
import { requirePermission } from '@/lib/auth/guard';
import { toDateKey } from '@/lib/dates';
import { planProgress } from '@/lib/plan-progress';
import { prisma } from '@/lib/prisma';
import { getClinicProfile } from '@/lib/queries';
import { toothLabel } from '@/lib/teeth';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'plans' });
  return { title: t('printTitle') };
}

/**
 * The plan on a sheet of paper, for the patient to take home.
 *
 * A course of treatment is the one thing in this app a patient is actually asked
 * to agree to — six visits, four teeth, a number of months — and it existed only
 * as a progress bar on a screen behind a login. So the conversation at the desk
 * was the dentist reading a list aloud while somebody wrote it on the back of an
 * appointment card.
 *
 * Written for the reader rather than for the practice: the steps in order, which
 * tooth each one is on, what is already done, and what is booked. No prices —
 * this app has no billing by design — and no clinical shorthand that only makes
 * sense to whoever typed it.
 *
 * Same mechanics as the day sheet: an ordinary page, printed by the browser,
 * with the app chrome stripped by the `print:` rules in `globals.css`.
 */
export default async function PlanPrintPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  await requirePermission('plan.view');

  const t = await getTranslations('plans');
  const tt = await getTranslations('teeth');
  const format = await getFormatter();

  const [plan, profile] = await Promise.all([
    prisma.treatmentPlan.findUnique({
      where: { id },
      select: {
        title: true,
        notes: true,
        status: true,
        createdAt: true,
        patient: { select: { firstName: true, lastName: true, phone: true } },
        steps: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            position: true,
            title: true,
            toothNum: true,
            notes: true,
            status: true,
            completedAt: true,
            appointment: { select: { date: true, startTime: true } },
          },
        },
      },
    }),
    getClinicProfile(),
  ]);

  if (!plan) notFound();

  const progress = planProgress(plan.steps);
  const patientName = `${plan.patient.lastName} ${plan.patient.firstName}`;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3" data-print-hide>
        {/* The plan itself sits in the trail, not just the list it came from:
            the sheet opens over the record you were reading, and a way back to
            "all plans" is not a way back to that one. */}
        <Breadcrumbs
          items={[
            { href: '/plans', label: t('allTitle') },
            { href: `/plans/${id}`, label: plan.title },
            { label: t('printTitle') },
          ]}
        />
        <PrintButton label={t('print')} />
      </div>

      <article className="card p-8 print:border-0 print:p-0 print:shadow-none">
        <SheetHead
          profile={profile}
          title={t('printTitle')}
          meta={format.dateTime(plan.createdAt, {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        />

        {/* Below the letterhead rather than inside it: the letterhead says who
            printed this, and this says what it is about. Two different
            questions, and folding the second into the first is what had the
            plan's own title competing with the practice's name for the top of
            the page. */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-ink">{plan.title}</h1>
          <p className="mt-1 text-[1.05rem] text-ink-soft">{patientName}</p>
          <p className="mt-1 text-[1rem] font-semibold text-ink-soft tabular-nums">
            {/* Against the steps that still count — a skipped one is not work
                left to do, and counting it would tell the patient they are
                further behind than they are. */}
            {t('progress', { done: progress.done, total: progress.relevant })}
          </p>
        </div>

        {plan.notes ? (
          <p className="mb-5 whitespace-pre-wrap text-[1.02rem] text-ink-soft">{plan.notes}</p>
        ) : null}

        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <th className="w-10 py-2 pr-3 text-[0.85rem] font-bold tracking-wide text-ink-faint uppercase">
                #
              </th>
              <th className="py-2 pr-3 text-[0.85rem] font-bold tracking-wide text-ink-faint uppercase">
                {t('stepTitle')}
              </th>
              <th className="py-2 pr-3 text-[0.85rem] font-bold tracking-wide text-ink-faint uppercase">
                {tt('colTooth')}
              </th>
              <th className="py-2 text-[0.85rem] font-bold tracking-wide text-ink-faint uppercase">
                {t('status')}
              </th>
            </tr>
          </thead>
          <tbody>
            {plan.steps.map((step) => (
              <tr key={step.id} className="border-b border-line align-top">
                <td className="py-3 pr-3 font-bold tabular-nums">{step.position}</td>
                <td className="py-3 pr-3">
                  <span className="text-[1.05rem] font-semibold text-ink">{step.title}</span>
                  {step.notes ? (
                    <span className="block text-[0.92rem] text-ink-soft">{step.notes}</span>
                  ) : null}
                </td>
                <td className="py-3 pr-3 tabular-nums">
                  {step.toothNum ? toothLabel(step.toothNum, profile.toothNumbering) : '—'}
                </td>
                <td className="py-3">
                  {step.status === TreatmentStepStatus.DONE ? (
                    <span className="font-semibold">
                      {t('stepDone')}
                      {step.completedAt
                        ? ` · ${format.dateTime(step.completedAt, {
                            day: 'numeric',
                            month: 'short',
                          })}`
                        : ''}
                    </span>
                  ) : step.status === TreatmentStepStatus.SKIPPED ? (
                    <span className="text-ink-soft">{t('stepSkipped')}</span>
                  ) : step.appointment ? (
                    // What the patient most wants off this sheet: the date they
                    // are expected back.
                    <span className="font-semibold tabular-nums">
                      {toDateKey(step.appointment.date)} {step.appointment.startTime}
                    </span>
                  ) : (
                    <span className="text-ink-soft">{t('stepNotBooked')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-6 text-[0.9rem] text-ink-faint">{t('printFooter')}</p>
      </article>
    </>
  );
}
