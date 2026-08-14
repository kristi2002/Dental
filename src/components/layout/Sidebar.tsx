'use client';

import {
  BellRing,
  CalendarDays,
  ChartColumn,
  ChevronDown,
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
import { type MouseEvent, useEffect, useRef, useState } from 'react';
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
  works: FlaskConical,
  recalls: BellRing,
  services: Stethoscope,
  serviceCategories: Tags,
  prescriptions: Pill,
  stock: Package,
  stockCategories: Tags,
  suppliers: Truck,
  analytics: ChartColumn,
};

/** Tailwind's `lg`, in the same rem the breakpoint is written in. */
const WIDE = '(min-width: 64rem)';

type Item = { href: string; key: string; children?: ReadonlyArray<Item> };

/** A year, like the rail's own shape: how someone keeps their menu is a
 *  preference, not a session. */
function remember(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * One row of the rail, at either level.
 *
 * A sub-destination is the same link a size down — same shapes, same active
 * treatment — because it is the same kind of thing: somewhere to go. Only the
 * weight says which of the two you are looking at.
 *
 * A row that heads a section carries the fold as well as the trip, over its whole
 * width: something with more behind it opens by being clicked, and a 36px chevron
 * is not where anyone aims. Going to Stock and looking at what is filed under
 * Stock are still two intentions, so the chevron stays its own target beside the
 * link (see `FoldButton`) — that one is the fold without the trip, which is what
 * lets a section be tidied away from anywhere in the app.
 */
function RailLink({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  nested = false,
  expanded,
  onClick,
  className,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
  nested?: boolean;
  /** Set only on a row that heads a section: whether its list is showing. */
  expanded?: boolean;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  className?: string;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-expanded={expanded}
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
        className,
      )}
    >
      <Icon
        size={nested ? 18 : 20}
        aria-hidden
        className={cn('shrink-0', !active && 'text-white')}
      />
      <span className={cn('min-w-0 truncate', collapsed && 'lg:sr-only')}>{label}</span>
    </Link>
  );
}

/**
 * The fold on a section, without the trip: a chevron beside the section's link,
 * turned down when the sub-destinations are showing and a quarter turn back when
 * they are not. The link itself folds too — this is the way to fold a section you
 * are not going to.
 *
 * Thumb-sized on a phone, where the drawer is what gets tapped, and trimmer on a
 * desktop, where the pointer is exact. A pinched rail has room for neither the
 * chevron nor a second target, so it goes with it: the fold is on the icon there,
 * and the stacked sub-icons are what says open.
 */
function FoldButton({
  label,
  expanded,
  collapsed,
  onToggle,
}: {
  label: string;
  expanded: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={label}
      className={cn(
        'flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg',
        'text-white/85 transition-colors hover:bg-white/15 hover:text-white',
        'focus-visible:outline-white focus-visible:outline-offset-[-1px]',
        'lg:min-h-9 lg:min-w-9',
        collapsed && 'lg:hidden',
      )}
    >
      <ChevronDown
        size={16}
        aria-hidden
        className={cn('transition-transform', !expanded && '-rotate-90')}
      />
    </button>
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
 * the sideways bar could never have held. Such a section starts shut and opens
 * by being clicked, anywhere along its row — or on the chevron beside its name,
 * which is the same fold from wherever you happen to be standing, without a trip
 * to the section first. Either way it stays however it was left, in a cookie. The
 * rail therefore reads as the short list of sections it is, and a receptionist
 * who never touches the stock shelves never reads past them.
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
  defaultClosedSections,
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
  /** Keys of the sections folded shut, from the `rail-sections` cookie — read on
   *  the server for the same reason. */
  defaultClosedSections: ReadonlyArray<string>;
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

  // A section that holds the screen you are standing on is never left folded:
  // hiding the page you are on is the one thing this fold must not do.
  const holdsCurrent = (key: string) =>
    (items.find((item) => item.key === key)?.children ?? []).some((child) => isCurrent(child.href));

  const [closed, setClosed] = useState<ReadonlySet<string>>(
    () => new Set(defaultClosedSections.filter((key) => !holdsCurrent(key))),
  );

  function toggleSection(key: string) {
    const next = new Set(closed);
    if (!next.delete(key)) next.add(key);
    setClosed(next);
  }

  // Arriving inside a folded section — from a breadcrumb, a card, a typed URL —
  // unfolds it for good: you have shown you go there. The first render has
  // already done this for the screen the page loaded on, which is why a folded
  // section never flashes its contents open after hydration.
  useEffect(() => {
    setClosed((was) => {
      const next = new Set([...was].filter((key) => !holdsCurrent(key)));
      return next.size === was.size ? was : next;
    });
  }, [pathname]);

  // The cookie mirrors the fold, so the rail comes back the way it was left —
  // including the section the first render just unfolded.
  useEffect(() => {
    remember('rail-sections', [...closed].join('.'));
  }, [closed]);

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
    remember('rail', next ? 'collapsed' : 'expanded');
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
              // Folded shut, the section takes the tab back — the sub-screen has
              // nowhere to show it.
              const unfolded = !closed.has(key);
              const onChild = kids.some((child) => isCurrent(child.href)) && unfolded;

              return (
                <li key={href}>
                  <div className="flex items-center gap-0.5">
                    <RailLink
                      href={href}
                      label={t(key)}
                      icon={ICONS[key] ?? LayoutDashboard}
                      active={isCurrent(href) && !onChild}
                      collapsed={collapsed}
                      className="min-w-0 flex-1"
                      expanded={kids.length > 0 ? unfolded : undefined}
                      onClick={
                        kids.length > 0
                          ? (event) => {
                              // A modified click opens the section in a new tab
                              // and leaves this one where it was, so the rail
                              // must not move under the hand either.
                              if (
                                event.metaKey ||
                                event.ctrlKey ||
                                event.shiftKey ||
                                event.altKey ||
                                event.button !== 0
                              ) {
                                return;
                              }
                              toggleSection(key);
                            }
                          : undefined
                      }
                    />

                    {kids.length > 0 ? (
                      <FoldButton
                        label={t(unfolded ? 'foldSection' : 'unfoldSection', { section: t(key) })}
                        expanded={unfolded}
                        collapsed={collapsed}
                        onToggle={() => toggleSection(key)}
                      />
                    ) : null}
                  </div>

                  {kids.length > 0 && unfolded ? (
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
