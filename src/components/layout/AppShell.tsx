import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { SessionUser } from '@/lib/auth/session';
import { NAV_DESTINATIONS } from './nav-destinations';
import { Sidebar } from './Sidebar';

/**
 * The frame every signed-in screen hangs in: a navigation rail down the left,
 * and the work beside it.
 *
 * Nothing is pinned across the top on a desktop any more. The masthead and the
 * nav bar used to cost about 120px of every viewport, permanently, and the
 * calendar — the screen this practice actually lives in — paid for that in
 * half-hours of schedule it could not show. Down the side, the same nine
 * destinations cost width that the `max-w-6xl` measure was not using anyway.
 */
export async function AppShell({ children, user }: { children: ReactNode; user: SessionUser }) {
  const t = await getTranslations('app');

  // Which shape the rail is in is read on the server, so a pinched rail does not
  // flash open before hydration. The layout is already dynamic — the session is
  // itself a cookie — so this costs nothing.
  const store = await cookies();
  const railCollapsed = store.get('rail')?.value === 'collapsed';

  const items = NAV_DESTINATIONS.filter(
    ({ permission }) => permission === null || user.permissions.includes(permission),
  ).map(({ href, key }) => ({ href, key }));

  return (
    // Column on a phone — top bar above the page. Row on a desktop — rail beside it.
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar
        items={items}
        defaultCollapsed={railCollapsed}
        user={{
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          canManageStaff: user.permissions.includes('staff.manage'),
          canViewAudit: user.permissions.includes('audit.view'),
          canViewSettings: user.permissions.includes('settings.view'),
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>

        <footer className="border-t border-line bg-surface">
          <div className="mx-auto w-full max-w-6xl px-4 py-4 text-[0.9rem] text-ink-soft sm:px-8">
            {t('name')} · {t('tagline')}
          </div>
        </footer>
      </div>
    </div>
  );
}
