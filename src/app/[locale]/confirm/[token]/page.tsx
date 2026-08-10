import { CalendarCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { ConfirmForm } from '@/components/confirm/ConfirmForm';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { ToothMark } from '@/components/layout/ToothMark';
import { AppointmentStatus } from '@/generated/prisma/enums';
import { verifyConfirmationToken } from '@/lib/confirmations';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'confirm' });
  // Not indexable: this URL is addressed to one person.
  return { title: t('title'), robots: { index: false, follow: false } };
}

/**
 * The one page in the app that anybody can open, and the only one with no
 * session behind it. Its authority is the signature in the URL.
 *
 * It shows a first name, a date and a time — enough for the patient to
 * recognise their own appointment, and nothing that would matter if the link
 * were forwarded to the wrong person.
 */
export default async function ConfirmPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('confirm');
  const tApp = await getTranslations('app');
  const format = await getFormatter();

  const appointmentId = await verifyConfirmationToken(token);
  const appointment = appointmentId
    ? await prisma.appointment.findUnique({
        where: { id: appointmentId },
        select: {
          date: true,
          startTime: true,
          status: true,
          serviceName: true,
          confirmedAt: true,
          declinedAt: true,
          patient: { select: { firstName: true } },
        },
      })
    : null;

  const clinicName = process.env.NEXT_PUBLIC_CLINIC_NAME ?? tApp('name');

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="app-header">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <span className="flex items-center gap-3">
            <ToothMark className="text-white" />
            <span className="text-[1.3rem] leading-tight font-bold tracking-tight text-white">
              {clinicName}
            </span>
          </span>
          <LanguageSwitcher />
        </div>
      </header>
      <div className="app-spectrum" aria-hidden />

      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:py-16">
        <div className="card w-full max-w-md p-6 sm:p-8">
          {!appointment ? (
            <>
              <h1 className="text-2xl font-bold text-ink">{t('invalidTitle')}</h1>
              <p className="mt-2 text-[1.05rem] text-ink-soft">{t('invalidText')}</p>
            </>
          ) : (
            <>
              <span className="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-deep">
                <CalendarCheck size={26} aria-hidden />
              </span>

              <h1 className="text-2xl font-bold text-ink">
                {t('greeting', { name: appointment.patient.firstName })}
              </h1>
              <p className="mt-1 text-[1.05rem] text-ink-soft">{t('intro')}</p>

              <dl className="mt-5 rounded-lg border border-line bg-surface-soft px-4 py-3.5 text-[1.05rem]">
                <div className="flex justify-between gap-4 py-1">
                  <dt className="text-ink-soft">{t('when')}</dt>
                  <dd className="text-right font-bold text-ink">
                    {format.dateTime(appointment.date, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      timeZone: 'UTC',
                    })}
                    <span className="block font-normal">{appointment.startTime}</span>
                  </dd>
                </div>
                {appointment.serviceName ? (
                  <div className="flex justify-between gap-4 border-t border-line py-1 pt-2">
                    <dt className="text-ink-soft">{t('what')}</dt>
                    <dd className="text-right font-bold text-ink">{appointment.serviceName}</dd>
                  </div>
                ) : null}
              </dl>

              <div className="mt-5">
                <ConfirmForm
                  token={token}
                  alreadyConfirmed={appointment.confirmedAt !== null}
                  alreadyDeclined={
                    appointment.declinedAt !== null ||
                    appointment.status === AppointmentStatus.CANCELLED
                  }
                  closed={
                    appointment.status === AppointmentStatus.COMPLETED ||
                    appointment.status === AppointmentStatus.NO_SHOW
                  }
                />
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
