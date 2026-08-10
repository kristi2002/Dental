import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Nav } from './Nav';
import { ToothMark } from './ToothMark';

export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations('app');

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Top bar on small screens, fixed rail on large ones. */}
      <aside className="sticky top-0 z-30 shrink-0 border-b-2 border-line bg-surface lg:top-0 lg:h-screen lg:w-72 lg:border-r-2 lg:border-b-0 lg:overflow-y-auto">
        <div className="flex flex-col lg:h-full">
          <Link
            href="/"
            className="flex items-center gap-3 px-5 py-4 no-underline lg:py-6"
            aria-label={t('name')}
          >
            <ToothMark />
            <span>
              <span className="block text-[1.35rem] leading-tight font-bold tracking-tight text-ink">
                {t('name')}
              </span>
              <span className="block text-[0.85rem] text-ink-faint">{t('tagline')}</span>
            </span>
          </Link>

          <Nav />

          <div className="hidden lg:mt-auto lg:block">
            <LanguageSwitcher />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>

        <div className="border-t-2 border-line bg-surface lg:hidden">
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}
