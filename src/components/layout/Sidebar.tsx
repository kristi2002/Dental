'use client';

import {
  BellRing,
  CalendarDays,
  ChartColumn,
  ClipboardList,
  FlaskConical,
  LayoutDashboard,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  Pill,
  Stethoscope,
  Tags,
  Truck,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { Role } from '@/generated/prisma/enums';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ToothMark } from './ToothMark';
import { UserMenu } from './UserMenu';

/** Every destination the rail can show, in order. What a given person sees is
 *  decided on the server — see `NAV_DESTINATIONS` in `nav-destinations.ts`. */
const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  appointments: CalendarDays,
  patients: Users,
  plans: ClipboardList,
  recalls: BellRing,
  services: Stethoscope,
  serviceCategories: Tags,
  prescriptions: Pill,
  lab: FlaskConical,
  stock: Package,
  stockCategories: Tags,
  suppliers: Truck,
  analytics: ChartColumn,
};

/** Tailwind's `lg`, in the same rem the breakpoint is written in. */
const WIDE = '(min-width: 64rem)';

type Item = { href: string; key: string; children?: ReadonlyArray<Item> };

/**
 * One row of the rail, at either level.
 *
 * A sub-destination is the same link a size down — same shapes, same active
 * treatment — because it is the same kind of thing: somewhere to go. Only the
 * weight says which of the two you are looking at.
 */
function RailLink({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  nested = false,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
  nested?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      // The only label a pinched rail has room for.
      title={collapsed ? label : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 font-semibold no-underline transition-colors',
        // The ring is white here: brand-dark on teal is invisible.
        'focus-visible:outline-white focus-visible:outline-offset-[-1px]',
        // Still a thumb-sized target one level down — a phone drawer is where
        // these get tapped, and 40px is not enough to tap reliably.
        nested ? 'min-h-11 text-[0.9rem]' : 'min-h-12 text-[0.95rem]',
        collapsed && 'lg:justify-center lg:px-0',
        // A solid white tab, not tinted text — the current screen has to be
        // findable without relying on colour alone, and white is what ties the
        // rail to the page beside it.
        active ? 'bg-surface text-brand-deep' : 'text-white/85 hover:bg-white/15 hover:text-white',
      )}
    >
      <Icon
        size={nested ? 18 : 20}
        aria-hidden
        className={cn('shrink-0', !active && 'text-white')}
      />
      <span className={cn('truncate', collapsed && 'lg:sr-only')}>{label}</span>
    </Link>
  );
}

/**
 * The navigation rail.
 *
 * Nine destinations is more than a row across the top can hold honestly — the
 * old bar scrolled sideways, which is how a receptionist on a 13" screen went a
 * year without knowing the Lab screen existed. Down the side they all fit at
 * once, with room left for the next module.
 *
 * The rail also buys back the ~120px of height the masthead and the bar used to
 * take between them. On the calendar that is half an hour of extra schedule on
 * screen at every hour of the day, which is the whole reason for the move.
 *
 * A destination may carry sub-destinations, indented under it — the lists a
 * section is kept by rather than the work done in it. They are the one thing
 * the sideways bar could never have held.
 *
 * Three shapes, one component:
 *   phone   a slim teal top bar plus an off-canvas drawer
 *   desktop a 15rem rail, sticky for the height of the viewport
 *   pinched the same rail collapsed to icons, remembered in a cookie
 */
export function Sidebar({
  items,
  user,
  defaultCollapsed,
}: {
  items: Item[];
  user: {
    firstName: string;
    lastName: string;
    role: Role;
    canManageStaff: boolean;
    canViewAudit: boolean;
    canViewSettings: boolean;
  };
  /** Read from the `rail` cookie on the server, so a collapsed rail does not
   *  flash open on first paint. */
  defaultCollapsed: boolean;
}) {
  const t = useTranslations('nav');
  const tApp = useTranslations('app');
  const pathname = usePathname();

  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [open, setOpen] = useState(false);

  // Whole segments, not a prefix: `/stock` must not light up on `/stocktake`,
  // and it has to keep lighting up on `/stock/categories`.
  const isCurrent = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  const rail = useRef<HTMLElement>(null);
  const opener = useRef<HTMLButtonElement>(null);

  // Following a link is the drawer's whole purpose, so it closes itself when
  // one lands rather than sitting over the page that was asked for.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // The drawer only exists below `lg`. Widening the window past it while the
  // drawer is open would otherwise leave the backdrop armed behind the rail.
  useEffect(() => {
    const wide = window.matchMedia(WIDE);
    const sync = () => {
      if (wide.matches) setOpen(false);
    };
    wide.addEventListener('change', sync);
    return () => wide.removeEventListener('change', sync);
  }, []);

  // While the drawer is over the page, it *is* the page: focus stays inside it,
  // Escape closes it, what is behind does not scroll, and the button that
  // opened it gets focus back on the way out.
  useEffect(() => {
    if (!open) return;
    const node = rail.current;
    if (!node) return;

    const focusable = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      ).filter((element) => element.offsetParent !== null);

    focusable()[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !node) return;

      const list = focusable();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !node.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    const scrollWas = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = scrollWas;
      opener.current?.focus();
    };
  }, [open]);

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    // A year, because which shape the rail is in is a preference, not a session.
    document.cookie = `rail=${next ? 'collapsed' : 'expanded'}; path=/; max-age=31536000; samesite=lax`;
  }

  const account = (placement: 'top' | 'bottom') => (
    <UserMenu
      firstName={user.firstName}
      lastName={user.lastName}
      role={user.role}
      canManageStaff={user.canManageStaff}
      canViewAudit={user.canViewAudit}
      canViewSettings={user.canViewSettings}
      placement={placement}
      compact={placement === 'top' && collapsed}
    />
  );

  return (
    <>
      {/* The phone bar. One row, so the schedule below it keeps the height the
          masthead and the nav used to spend between them. */}
      <header className="app-header sticky top-0 z-30 flex items-center gap-2 px-3 py-2 lg:hidden">
        <button
          ref={opener}
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="app-rail"
          aria-label={t('openMenu')}
          className="on-brand-control flex min-h-11 min-w-11 items-center justify-center rounded-lg focus-visible:outline-white"
        >
          <Menu size={22} aria-hidden />
        </button>

        <Link
          href="/"
          className="flex min-w-0 flex-1 items-center gap-2 no-underline"
          aria-label={tApp('name')}
        >
          <ToothMark size={28} className="text-white" />
          {/* The tagline is gone from the phone bar and the wordmark truncates:
              between the menu button and the account button there is only so
              much room, and the two buttons are the ones that get tapped. */}
          <span className="truncate text-[1.05rem] leading-tight font-bold tracking-tight text-white">
            {tApp('name')}
          </span>
        </Link>

        {account('bottom')}
      </header>

      {open ? (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-ink/45 lg:hidden"
        />
      ) : null}

      <aside
        id="app-rail"
        ref={rail}
        className={cn(
          'app-rail z-50 flex flex-col',
          // Phone: off-canvas, over the page, out of the flow entirely.
          'fixed inset-y-0 left-0 w-[16rem] transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full',
          // Desktop: a column of the layout, pinned for the viewport's height.
          'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:shrink-0 lg:transition-[width]',
          collapsed ? 'lg:w-[4.5rem]' : 'lg:w-[15rem]',
        )}
      >
        <div
          className={cn(
            'flex shrink-0 gap-2 px-3 py-3',
            collapsed ? 'items-center lg:flex-col lg:px-2' : 'items-center',
          )}
        >
          <Link
            href="/"
            aria-label={tApp('name')}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2.5 no-underline focus-visible:outline-white',
              collapsed && 'lg:flex-none lg:justify-center',
            )}
          >
            <ToothMark className="text-white" />
            <span className={cn('min-w-0', collapsed && 'lg:sr-only')}>
              <span className="block truncate text-[1.12rem] leading-tight font-bold tracking-tight text-white">
                {tApp('name')}
              </span>
              <span className="block truncate text-[0.76rem] text-white/85">
                {tApp('tagline')}
              </span>
            </span>
          </Link>

          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? t('expandRail') : t('collapseRail')}
            className="on-brand-control hidden min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg focus-visible:outline-white lg:flex"
          >
            {collapsed ? (
              <PanelLeftOpen size={20} aria-hidden />
            ) : (
              <PanelLeftClose size={20} aria-hidden />
            )}
          </button>

          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t('closeMenu')}
            className="on-brand-control flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg focus-visible:outline-white lg:hidden"
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        {/* The spectrum still rules off the branding from the work, exactly as it
            did under the masthead — it has only turned the corner with it. */}
        <div className="app-spectrum shrink-0" aria-hidden />

        <nav
          aria-label={t('menu')}
          className={cn('flex-1 overflow-y-auto px-2 py-3', collapsed && 'lg:px-1.5')}
        >
          <ul className="flex flex-col gap-0.5">
            {items.map(({ href, key, children }) => {
              const kids = children ?? [];
              // A section reads as current only while you are on the section
              // itself: standing on one of its sub-screens, that one is the tab.
              const onChild = kids.some((child) => isCurrent(child.href));

              return (
                <li key={href}>
                  <RailLink
                    href={href}
                    label={t(key)}
                    icon={ICONS[key] ?? LayoutDashboard}
                    active={isCurrent(href) && !onChild}
                    collapsed={collapsed}
                  />

                  {kids.length > 0 ? (
                    // Indented off a hairline, which is what says "inside this"
                    // without a second word of chrome. The pinched rail has no
                    // room for the indent, so the icons simply stack.
                    <ul
                      className={cn(
                        'mt-0.5 ml-5 flex flex-col gap-0.5 border-l border-white/20 pl-2',
                        collapsed && 'lg:ml-0 lg:border-l-0 lg:pl-0',
                      )}
                    >
                      {kids.map((child) => (
                        <li key={child.href}>
                          <RailLink
                            href={child.href}
                            label={t(child.key)}
                            icon={ICONS[child.key] ?? LayoutDashboard}
                            active={isCurrent(child.href)}
                            collapsed={collapsed}
                            nested
                          />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </nav>

        <div
          className={cn(
            'flex shrink-0 flex-col gap-2 border-t border-white/20 p-2',
            collapsed && 'lg:items-center lg:px-1',
          )}
        >
          <LanguageSwitcher compact stacked={collapsed} />
          {/* Only on desktop: on a phone the account button lives in the top bar,
              where it is reachable without opening the drawer first. */}
          <div className="hidden lg:block">{account('top')}</div>
        </div>
      </aside>
    </>
  );
}
