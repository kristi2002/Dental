import { KeyRound } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SetupForm } from '@/components/auth/SetupForm';
import { ClinicLogo } from '@/components/brand/ClinicLogo';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { redirect } from '@/i18n/navigation';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'setup' });
  // Nothing here should ever be indexed: on a live practice this page does not
  // exist, and on a fresh one it is a door standing open for a few minutes.
  return { title: t('title'), robots: { index: false, follow: false } };
}

/**
 * First run: create the practice's first Owner, from a browser.
 *
 * A deployed database starts with no staff and the app has no signup, so the
 * only way in was a shell on the container. That is a fair thing to ask of
 * whoever runs the server and an unfair thing to ask of a dentist — and it left
 * a perfectly good deployment that nobody could sign into.
 *
 * **The door closes the moment anybody exists.** This page redirects to the sign
 * in screen as soon as the staff table is not empty, and the action behind it
 * writes its row only on the condition that the table is still empty — so the
 * guarantee does not depend on this check winning a race.
 */
export default async function SetupPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // The practice already has people. This page is finished forever.
  if ((await prisma.staffUser.count()) > 0) {
    redirect({ href: '/login', locale });
  }

  const t = await getTranslations('setup');
  const tApp = await getTranslations('app');

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="app-header">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          {/* The same masthead the sign-in screen wears. Nothing is read out of
              the database here — this page exists precisely because there is not
              yet anybody to have filled it in — so the lockup is captioned with
              the product's name. */}
          <ClinicLogo variant="inverse" alt={tApp('name')} className="h-11 w-auto sm:h-14" />
          <LanguageSwitcher />
        </div>
      </header>
      <div className="app-spectrum" aria-hidden />

      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:py-16">
        <div className="card w-full max-w-lg p-6 sm:p-8">
          <span className="mb-4 inline-flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-deep">
            <KeyRound size={26} aria-hidden />
          </span>

          <h1 className="text-2xl font-bold text-ink">{t('title')}</h1>
          <p className="mt-1 mb-6 text-body text-ink-soft">{t('subtitle')}</p>

          <SetupForm />
        </div>
      </main>
    </div>
  );
}
