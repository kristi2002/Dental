import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LoginForm } from '@/components/auth/LoginForm';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { ToothMark } from '@/components/layout/ToothMark';
import { getCurrentUser } from '@/lib/auth/session';
import { redirect } from '@/i18n/navigation';
import { prisma } from '@/lib/prisma';

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
    redirect({ href: '/', locale });
  }

  const t = await getTranslations('auth');
  const tApp = await getTranslations('app');

  const staff = await prisma.staffUser.findMany({
    where: { active: true },
    orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
    select: { id: true, firstName: true, lastName: true, role: true },
  });

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="app-header">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <span className="flex min-w-0 items-center gap-3">
            <ToothMark className="text-white" />
            <span className="min-w-0">
              {/* No account button competing for room here, so the wordmark
                  stays on phones — it just steps down a size to fit. */}
              <span className="block truncate text-[1.1rem] leading-tight font-bold tracking-tight text-white sm:text-[1.3rem]">
                {tApp('name')}
              </span>
              <span className="hidden truncate text-[0.8rem] text-white/85 lg:block">
                {tApp('tagline')}
              </span>
            </span>
          </span>
          <LanguageSwitcher />
        </div>
      </header>
      <div className="app-spectrum" aria-hidden />

      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:py-16">
        <div className="card w-full max-w-md p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-ink">{t('signIn')}</h1>
          <p className="mt-1 mb-6 text-[1.02rem] text-ink-soft">{t('subtitle')}</p>

          <LoginForm staff={staff} />
        </div>
      </main>
    </div>
  );
}
