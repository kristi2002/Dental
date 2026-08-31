import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LoginForm } from '@/components/auth/LoginForm';
import { ClinicLogo } from '@/components/brand/ClinicLogo';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { getCurrentUser } from '@/lib/auth/session';
import { redirect } from '@/i18n/navigation';
import { prisma } from '@/lib/prisma';
import { clinicDisplayName, getClinicProfile } from '@/lib/queries';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  return { title: t('signIn') };
}

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Already signed in — no reason to show the pad again.
  if (await getCurrentUser()) {
    redirect({ href: '/dashboard', locale });
  }

  // A database with nobody in it cannot be signed into, and an empty picker is
  // a dead end that looks like a bug. Send them to first-run setup instead —
  // which closes itself the moment it has been used once.
  if ((await prisma.staffUser.count()) === 0) {
    redirect({ href: '/setup', locale });
  }

  const t = await getTranslations('auth');
  const tApp = await getTranslations('app');
  const clinicName = clinicDisplayName(await getClinicProfile()) || tApp('name');

  const staff = await prisma.staffUser.findMany({
    where: { active: true },
    orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
    select: { id: true, firstName: true, lastName: true, role: true },
  });

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="app-header">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          {/* The whole lockup, not the rail's cut-down mark: this is the front
              door, and it is the one screen in the app with a full-width
              masthead and nothing competing for it. No account button here, so
              it only has to step down a size for a phone. The artwork spells the
              practice's name, which is why nothing is written beside it. */}
          <ClinicLogo variant="inverse" alt={clinicName} className="h-11 w-auto sm:h-14" />
          <LanguageSwitcher />
        </div>
      </header>
      <div className="app-spectrum" aria-hidden />

      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:py-16">
        <div className="card w-full max-w-md p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-ink">{t('signIn')}</h1>
          <p className="mt-1 mb-6 text-body text-ink-soft">{t('subtitle')}</p>

          <LoginForm staff={staff} />
        </div>
      </main>
    </div>
  );
}
