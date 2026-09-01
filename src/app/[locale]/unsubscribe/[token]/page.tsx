import { BellOff } from 'lucide-react';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ClinicLogo } from '@/components/brand/ClinicLogo';
import { OptOutForm } from '@/components/confirm/OptOutForm';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { verifyOptOutToken } from '@/lib/opt-out';
import { prisma } from '@/lib/prisma';
import { clinicDisplayName, getClinicProfile } from '@/lib/queries';
import { CONFIRM_RATE, confirmBucket, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'unsubscribe' });
  // Not indexable, for the same reason the confirmation page is not: this URL
  // is addressed to one person and names them on the far side of it.
  return { title: t('title'), robots: { index: false, follow: false } };
}

/**
 * The bottom of every message the practice sends that the patient did not ask
 * for, made into a page.
 *
 * Second of the two doors in this app with no session behind them, and built to
 * the same rules as the first: the signature in the URL is the whole authority,
 * the page shows a first name and nothing else about the person, and a wrong
 * guess costs a slot in a small per-address budget rather than nothing at all.
 *
 * It says what opting out does and does not do, because the sentence patients
 * are actually worried about is the one nobody writes down: *will they still
 * ring me if something is wrong with my tooth?* Yes — this closes the courtesy
 * messages, not the practice.
 */
export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('unsubscribe');
  const tApp = await getTranslations('app');

  const limit = rateLimit(confirmBucket(await headers()), CONFIRM_RATE);
  if (!limit.allowed) {
    return (
      <main className="mx-auto max-w-md px-5 py-20 text-center">
        <p role="alert" className="text-lead font-semibold text-ink">
          {t('tooMany')}
        </p>
      </main>
    );
  }

  const patientId = await verifyOptOutToken(token);
  const patient = patientId
    ? await prisma.patient.findUnique({
        where: { id: patientId },
        select: { firstName: true, contactConsent: true },
      })
    : null;

  const clinicName = clinicDisplayName(await getClinicProfile()) || tApp('name');

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="app-header">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <ClinicLogo variant="inverse" alt={clinicName} className="h-11 w-auto sm:h-14" />
          <LanguageSwitcher />
        </div>
      </header>
      <div className="app-spectrum" aria-hidden />

      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:py-16">
        <div className="card w-full max-w-md p-6 sm:p-8">
          {!patient ? (
            <>
              <h1 className="text-2xl font-bold text-ink">{t('invalidTitle')}</h1>
              <p className="mt-2 text-body text-ink-soft">{t('invalidText')}</p>
            </>
          ) : (
            <>
              <span className="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-deep">
                <BellOff size={26} aria-hidden />
              </span>

              <h1 className="text-2xl font-bold text-ink">
                {t('greeting', { name: patient.firstName })}
              </h1>
              <p className="mt-1 text-body text-ink-soft">{t('intro', { clinic: clinicName })}</p>

              <div className="mt-5">
                <OptOutForm token={token} optedOut={patient.contactConsent === false} />
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
