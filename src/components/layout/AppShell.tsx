import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import type { SessionUser } from '@/lib/auth/session';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Nav } from './Nav';
import { NAV_DESTINATIONS } from './nav-destinations';
import { ToothMark } from './ToothMark';
import { UserMenu } from './UserMenu';

export function AppShell({ children, user }: { children: ReactNode; user: SessionUser }) {
  const t = useTranslations('app');

  const items = NAV_DESTINATIONS.filter(
    ({ permission }) => permission === null || user.permissions.includes(permission),
  ).map(({ href, key }) => ({ href, key }));

  return (
    <div className="flex min-h-screen flex-col">
      {/* Masthead, spectrum rule and nav travel together as one sticky block. */}
      <div className="sticky top-0 z-30">
        <header className="app-header">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
            <Link
              href="/"
              className="flex min-w-0 items-center gap-3 no-underline"
              aria-label={t('name')}
            >
              <ToothMark className="text-white" />
              {/* Below ~510px the mark carries the branding on its own: the
                  wordmark, the switcher and the account button together are
                  wider than a phone masthead. It stays in the a11y tree. */}
              <span className="sr-only min-[30rem]:not-sr-only min-[30rem]:min-w-0">
                <span className="block truncate text-[1.3rem] leading-tight font-bold tracking-tight text-white">
                  {t('name')}
                </span>
                {/* Last in, first out: the endonyms in the switcher earn their
                    room at `md`, so the decorative line waits until `lg`. */}
                <span className="hidden truncate text-[0.8rem] text-white/85 lg:block">
                  {t('tagline')}
                </span>
              </span>
            </Link>

            <div className="flex shrink-0 items-center gap-2">
              <LanguageSwitcher />
              <UserMenu
                firstName={user.firstName}
                lastName={user.lastName}
                role={user.role}
                canManageStaff={user.permissions.includes('staff.manage')}
                canViewAudit={user.permissions.includes('audit.view')}
                canViewSettings={user.permissions.includes('settings.view')}
              />
            </div>
          </div>
        </header>

        <div className="app-spectrum" aria-hidden />

        <div className="border-b border-line bg-surface">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-8">
            <Nav items={items} />
          </div>
        </div>
      </div>

      <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 text-[0.9rem] text-ink-soft sm:px-8">
          {t('name')} · {t('tagline')}
        </div>
      </footer>
    </div>
  );
}
