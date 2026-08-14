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

  const allowed = (permission: (typeof NAV_DESTINATIONS)[number]['permission']) =>
    permission === null || user.permissions.includes(permission);

  // A section stays in the rail even when every one of its sub-screens is out of
  // reach — the sub-screens are the extras, not the reason the section is there.
  const items = NAV_DESTINATIONS.filter(({ permission }) => allowed(permission)).map(
    ({ href, key, children }) => ({
      href,
      key,
      children: children?.filter(({ permission }) => allowed(permission)).map(({ href, key }) => ({
        href,
        key,
      })),
    }),
  );

  // Which sections are folded shut, by key — same reasoning, same first paint.
  //
  // No cookie at all means nobody has touched the fold yet, and the rail opens
  // the way it reads best: the short list of sections, with the lists each one is
  // filed by waiting behind a chevron. An empty cookie is a different answer —
  // somebody opened everything — so it is honoured as written.
  const stored = store.get('rail-sections');
  const closedSections = stored
    ? stored.value.split('.').filter(Boolean)
    : items.filter(({ children }) => children && children.length > 0).map(({ key }) => key);

  return (
    // Column on a phone — top bar above the page. Row on a desktop — rail beside it.
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar
        items={items}
        defaultCollapsed={railCollapsed}
        defaultClosedSections={closedSections}
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
