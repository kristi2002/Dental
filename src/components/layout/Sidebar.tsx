'use client';

import {
  AlarmClock,
  BellRing,
  Building2,
  CalendarDays,
  ChartColumn,
  ChevronDown,
  ClipboardList,
  FileText,
  FlaskConical,
  Images,
  Inbox,
  Layers,
  LayoutDashboard,
  Menu,
  NotebookPen,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  PhoneIncoming,
  Pill,
  QrCode,
  Send,
  Stethoscope,
  Tags,
  Truck,
  Upload,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ClinicMark } from '@/components/brand/ClinicLogo';
import type { Role } from '@/generated/prisma/enums';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { LanguageSwitcher } from './LanguageSwitcher';
import { UserMenu } from './UserMenu';

/**
 * Every destination the rail can show. What a given person sees is decided on
 * the server — see `NAV_DESTINATIONS` in `nav-destinations.ts`.
 *
 * Every key in that file needs a line here. A missing one is not a crash, which
 * is what made the last gap survive so long: the lookup falls through to the
 * dashboard's own square, so seven sub-destinations — both of Works', both of
 * Prescriptions', and every Import and Labels sheet — quietly drew the same
 * glyph as the first row of the rail. In a pinched rail, where the label is
 * gone and the indent with it, that is the whole of what the row says.
 */
const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  appointments: CalendarDays,
  patients: Users,
  plans: ClipboardList,
  works: FlaskConical,
  // A kind of work is one of the layers a job is built out of, and the register
  // it is picked into is the flask beside it.
  workProcedures: Layers,
  // Not a flask: a laboratory here is the outside firm the case is posted to,
  // which is the same sort of thing as a supplier and is filed as one.
  labs: Building2,
  recalls: BellRing,
  outbox: Send,
  inbox: Inbox,
  requests: PhoneIncoming,
  followUps: AlarmClock,
  services: Stethoscope,
  serviceCategories: Tags,
  prescriptions: Pill,
  // What was actually written, against the standard wording it was written from
  // — a sheet of paper, and the pad it was copied off.
  prescriptionsIssued: FileText,
  prescriptionTemplates: NotebookPen,
  stock: Package,
  stockCatalog: Images,
  // The sheet is literally a page of QR codes.
  stockLabels: QrCode,
  stockCategories: Tags,
  suppliers: Truck,
  // Both imports, and the same drawing for both: it is the same errand.
  servicesImport: Upload,
  stockImport: Upload,
  analytics: ChartColumn,
};

/** Tailwind's `lg`, in the same rem the breakpoint is written in. */
const WIDE = '(min-width: 64rem)';

type Item = {
  href: string;
  key: string;
  /** Current on this path alone — see `NAV_DESTINATIONS`. */
  exact?: boolean;
  /** The block this row belongs to — see `Group` in `nav-destinations.ts`. */
  group?: string;
  children?: ReadonlyArray<Item>;
};

/**
 * The rail's rows cut into the blocks their headings rule off.
 *
 * A run, not a lookup: the destinations arrive in the order the rail declares
 * them and a heading is drawn wherever `group` changes, so the blocks are
 * whatever the list says they are. Two consequences worth having — the order in
 * `NAV_DESTINATIONS` stays the single place the rail's shape is written, and a
 * block whose every row a role may not open simply never appears, because no
 * surviving row names it.
 */
function inBlocks(items: ReadonlyArray<Item>) {
  const blocks: { group: string | null; items: Item[] }[] = [];

  for (const item of items) {
    const group = item.group ?? null;
    const last = blocks.at(-1);
    if (last && last.group === group) last.items.push(item);
    else blocks.push({ group, items: [item] });
  }

  return blocks;
}

/** A year, like the rail's own shape: how someone keeps their menu is a
 *  preference, not a session. */
function remember(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * One row of the rail, at either level: a link where `href` is given, and the
 * heading of a section where it is not.
 *
 * A sub-destination is the same link a size down — same shapes, same active
 * treatment — because it is the same kind of thing: somewhere to go. Only the
 * weight says which of the two you are looking at.
 *
 * A row that heads a section goes nowhere. It is a name over a list, and its one
 * job is opening and shutting that list — the whole row is the target, chevron
 * included, which beats a 36px hit area next to a link on a thumb and on a
 * pointer alike. The screen the section used to lead to is the first entry in
 * the list, under the section's own name, so it is still one click away and the
 * click no longer has to mean two things at once.
 */
function RailRow({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
  nested = false,
  badge = 0,
  expanded,
  controls,
  onToggle,
}: {
  /** Omitted on a section heading, which is a button rather than a link. */
  href?: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
  nested?: boolean;
  /**
   * A number worth interrupting somebody for. Zero draws nothing.
   *
   * Two rows carry one, and the bar for a third is meant to stay high: a rail
   * where four rows carry counts is a rail where none of them is read. The test
   * is whether the number represents *somebody else waiting* — a patient's
   * unanswered reply does, and so does a stranger who left their number on the
   * public page and has heard nothing back. A list of things the practice could
   * get round to does not, which is why the recalls and the outbox have none.
   */
  badge?: number;
  /** Set only on a section heading: whether its list is showing. */
  expanded?: boolean;
  controls?: string;
  onToggle?: () => void;
}) {
  const className = cn(
    'relative flex w-full items-center gap-3 rounded-lg px-3 font-semibold no-underline transition-colors',
    // The ring is white here: brand-dark on teal is invisible.
    'focus-visible:outline-white focus-visible:outline-offset-[-1px]',
    // Still a thumb-sized target one level down — a phone drawer is where
    // these get tapped, and 40px is not enough to tap reliably.
    nested ? 'min-h-11 text-meta' : 'min-h-12 text-body',
    collapsed && 'lg:justify-center lg:px-0',
    // A solid white tab, not tinted text — the current screen has to be
    // findable without relying on colour alone, and white is what ties the
    // rail to the page beside it.
    active ? 'bg-surface text-brand-deep' : 'text-white/85 hover:bg-white/15 hover:text-white',
  );

  const content = (
    <>
      <Icon
        size={nested ? 18 : 20}
        aria-hidden
        className={cn('shrink-0', !active && 'text-white')}
      />
      <span className={cn('min-w-0 flex-1 truncate text-left', collapsed && 'lg:sr-only')}>
        {label}
      </span>
      {/* Stays visible when the rail is pinched, where it becomes a dot on the
          icon — a collapsed rail is the state somebody leaves it in all day,
          and a count that disappears in it is a count that does not work. */}
      {badge > 0 ? (
        <span
          className={cn(
            'shrink-0 rounded-full px-1.5 py-0.5 text-micro font-bold tabular-nums',
            active ? 'bg-brand-dark text-white' : 'bg-white text-brand-deep',
            collapsed &&
              'lg:absolute lg:top-1 lg:right-1 lg:px-1 lg:py-0 lg:text-micro lg:leading-4',
          )}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      ) : null}
      {/* Turned down while the list is showing, a quarter turn back when it is
          not. Part of the row, not a target of its own — a pinched rail has room
          for neither, so there the stacked sub-icons are what says open. */}
      {expanded === undefined ? null : (
        <ChevronDown
          size={16}
          aria-hidden
          className={cn(
            'shrink-0 transition-transform',
            !expanded && '-rotate-90',
            collapsed && 'lg:hidden',
          )}
        />
      )}
    </>
  );

  if (href === undefined) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={controls}
        // The only label a pinched rail has room for.
        title={collapsed ? label : undefined}
        className={className}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={className}
    >
      {content}
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
 * A destination may carry sub-destinations, indented under it — the screen the
 * section opens on, and then the lists it is kept by rather than the work done
 * in it. They are the one thing the sideways bar could never have held. Such a
 * section is a heading rather than a link: it starts shut and opens by being
 * clicked, anywhere along its row — one target, chevron included — and stays
 * however it was left, in a cookie. The rail therefore reads as the short list
 * of sections it is, and a receptionist who never touches the stock shelves
 * never reads past them.
 *
 * Three shapes, one component:
 *   phone   a slim teal top bar plus an off-canvas drawer
 *   desktop a 15rem rail, sticky for the height of the viewport
 *   pinched the same rail collapsed to icons, remembered in a cookie
 */
export function Sidebar({
  items,
  user,
  clinicName,
  badges,
  board,
  defaultCollapsed,
  defaultClosedSections,
}: {
  items: Item[];
  /** Counts by destination key. Resolved on the server; see `AppShell`. */
  badges?: Readonly<Record<string, number>>;
  /**
   * Whose practice this is, resolved on the server — see `clinicDisplayName`.
   * Written beside the mark rather than left to it: the drawing is what makes
   * the rail recognisable at a glance, and the name is what a locum reads on
   * their first morning to be sure which practice they are logged into.
   */
  clinicName: string;
  /**
   * The reminder board, already rendered on the server.
   *
   * On a desktop the shell puts this in the top right of the work itself and
   * the rail never sees it. A phone has no such row pinned anywhere — the
   * search box scrolls away with the page — and a bell that scrolls off the
   * top is a bell nobody presses, so the phone bar keeps its own copy.
   */
  board: ReactNode;
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
  //
  // `exact` turns the prefix half off for the one row it would misread: the
  // screen a section opens on sits beside siblings whose paths it is the prefix
  // of, so on `/stock/labels` it would otherwise light up next to the shelf
  // actually being looked at.
  //
  // There used to be a third case here for `/`, which was the dashboard's own
  // href and the prefix of every other row in this rail. The dashboard lives at
  // `/dashboard` now — `/` is the practice's public page, which this rail never
  // links to — so the ordinary segment rule covers it like everything else.
  const isCurrent = (href: string, exact = false) =>
    exact
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  // A section that holds the screen you are standing on is never left folded:
  // hiding the page you are on is the one thing this fold must not do.
  const holdsCurrent = (key: string) =>
    (items.find((item) => item.key === key)?.children ?? []).some((child) =>
      isCurrent(child.href, child.exact),
    );

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
    // `holdsCurrent` is rebuilt every render and reads only `pathname` and
    // `items`; landing somewhere new is the whole trigger, so `pathname` is the
    // dependency this effect actually has.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Caught now rather than read on the way out: the button to hand focus back
    // to is the one that opened the drawer.
    const openedBy = opener.current;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = scrollWas;
      openedBy?.focus();
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
          href="/dashboard"
          className="flex min-w-0 flex-1 items-center gap-2 no-underline"
          aria-label={clinicName}
        >
          <ClinicMark variant="inverse" alt="" className="h-6 w-auto shrink-0" />
          {/* The tagline is gone from the phone bar and the name truncates:
              between the menu button and the account button there is only so
              much room, and the two buttons are the ones that get tapped. */}
          <span className="truncate text-body leading-tight font-bold tracking-tight text-white">
            {clinicName}
          </span>
        </Link>

        {/* Top right of the phone bar, beside the account button — the same
            corner the desktop puts it in, and the only part of a phone screen
            that stays put while the page scrolls. */}
        {board}
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
            href="/dashboard"
            aria-label={clinicName}
            className={cn(
              'flex min-w-0 flex-1 items-center gap-2.5 no-underline focus-visible:outline-white',
              collapsed && 'lg:flex-none lg:justify-center',
            )}
          >
            {/* Sized by height, like the letterhead it was cut from. h-7 is
                what leaves the practice's name room to be read beside it in a
                15rem rail — and is still the largest the drawing can be in a
                pinched one, where 4.5rem less the padding is all there is. */}
            <ClinicMark variant="inverse" alt="" className="h-7 w-auto shrink-0" />
            <span className={cn('min-w-0', collapsed && 'lg:sr-only')}>
              <span className="block truncate text-body leading-tight font-bold tracking-tight text-white">
                {clinicName}
              </span>
              <span className="block truncate text-micro text-white/85">
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
          {inBlocks(items).map((block) => (
            <div
              key={block.group ?? 'start'}
              className={cn(
                block.group && 'mt-3 first:mt-0',
                // Pinched, the words are gone and a rule takes their place: the
                // blocks are the one thing about this rail worth keeping when
                // there is no room to name them, and without the rule a
                // collapsed rail is a single undivided column of icons.
                block.group && collapsed && 'lg:mt-2 lg:border-t lg:border-white/20 lg:pt-2',
              )}
            >
              {block.group ? (
                <p
                  id={`rail-block-${block.group}`}
                  className={cn(
                    'px-3 pt-1 pb-1.5 text-micro font-bold tracking-[0.1em] text-white/60 uppercase',
                    // Still the list's accessible name when it cannot be read:
                    // `aria-labelledby` does not care whether its target is
                    // drawn, and a screen reader gets the block either way.
                    collapsed && 'lg:sr-only',
                  )}
                >
                  {t(`group.${block.group}`)}
                </p>
              ) : null}

              {/* One list per block, named by the heading over it, rather than
                  one list of fourteen with headings loose inside it — a run of
                  text between two links is not something a list can say. */}
              <ul
                aria-labelledby={block.group ? `rail-block-${block.group}` : undefined}
                className="flex flex-col gap-0.5"
              >
            {block.items.map(({ href, key, children }) => {
              const kids = children ?? [];
              const section = kids.length > 0;
              // A heading shows no tab of its own while its list is open: one of
              // the rows under it is holding the tab, starting with the screen
              // the section opens on. Folded shut — or standing somewhere inside
              // the section that has no row of its own, like one item's own page
              // — the heading takes the tab back, because otherwise nothing in
              // the rail says where you are.
              const unfolded = !closed.has(key);
              const onChild =
                kids.some((child) => isCurrent(child.href, child.exact)) && unfolded;

              return (
                <li key={href}>
                  <RailRow
                    // A section heading is a name over a list, not a trip.
                    href={section ? undefined : href}
                    label={t(key)}
                    icon={ICONS[key] ?? LayoutDashboard}
                    active={isCurrent(href) && !onChild}
                    collapsed={collapsed}
                    badge={badges?.[key] ?? 0}
                    expanded={section ? unfolded : undefined}
                    controls={section ? `rail-section-${key}` : undefined}
                    onToggle={section ? () => toggleSection(key) : undefined}
                  />

                  {section && unfolded ? (
                    // Indented off a hairline, which is what says "inside this"
                    // without a second word of chrome. The pinched rail has no
                    // room for the indent, so the icons simply stack.
                    <ul
                      id={`rail-section-${key}`}
                      className={cn(
                        'mt-0.5 ml-5 flex flex-col gap-0.5 border-l border-white/20 pl-2',
                        collapsed && 'lg:ml-0 lg:border-l-0 lg:pl-0',
                      )}
                    >
                      {kids.map((child) => (
                        <li key={child.href}>
                          <RailRow
                            href={child.href}
                            label={t(child.key)}
                            icon={ICONS[child.key] ?? LayoutDashboard}
                            active={isCurrent(child.href, child.exact)}
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
            </div>
          ))}
        </nav>

        <div
          className={cn(
            'flex shrink-0 flex-col gap-2 border-t border-white/20 p-2',
            collapsed && 'lg:items-center lg:px-1',
          )}
        >
          <LanguageSwitcher compact stacked={collapsed} />
          {/* Only on desktop: on a phone the account button lives in the top
              bar, where it is reachable without opening the drawer first. */}
          <div className="hidden lg:block">{account('top')}</div>
        </div>
      </aside>
    </>
  );
}
