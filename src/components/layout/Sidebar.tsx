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
  List,
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
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ClinicMark } from '@/components/brand/ClinicLogo';
import type { Role } from '@/generated/prisma/enums';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
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
  // The three rows that open a section onto its own index. One drawing for all
  // three, because they all mean the same thing — "the list of this" — and a
  // pinched rail needs the pair under a heading to differ, not to be clever.
  worksAll: List,
  servicesAll: List,
  stockAll: List,
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
  /** Extra paths this row answers for — see `NAV_DESTINATIONS`. */
  alsoCurrent?: ReadonlyArray<string>;
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
  onTip,
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
  /**
   * Where to show this row's name while the rail is pinched, and where to stop.
   *
   * The label is `sr-only` in that state, so a native `title` was the only thing
   * naming the row for a sighted mouse user — a second-long wait, on the state
   * people leave the rail in all day. The rail cannot draw the tooltip itself:
   * the scrolling list clips anything reaching past 4.5rem, so the row reports
   * its position and the rail renders one tooltip into the document body.
   */
  onTip?: (tip: { label: string; top: number; left: number } | null) => void;
}) {
  const className = cn(
    'relative flex w-full items-center gap-3 rounded-lg px-3 no-underline transition-colors',
    // The ring is white here: brand-dark on teal is invisible.
    'focus-visible:outline-white focus-visible:outline-offset-[-1px]',
    // 44px is the smallest target anybody should have to hit, and a phone
    // drawer is where these get tapped, so that is the floor everywhere. On a
    // desktop pointer they come down to 40 and 36 — fourteen rows at 48px did
    // not fit a 900px screen, let alone the 768px one at the front desk.
    nested ? 'min-h-11 text-meta font-medium lg:min-h-9' : 'min-h-11 text-body font-semibold lg:min-h-10',
    collapsed && 'lg:justify-center lg:px-0',
    // A solid white tab, not tinted text — the current screen has to be
    // findable without relying on colour alone, and white is what ties the
    // rail to the page beside it.
    //
    // Everything else is full white rather than `white/85`. Dimming type on a
    // coloured ground is how the rail came to sit between 2.0:1 and 3.3:1
    // against its own gradient: the levels are told apart by size and weight
    // here, which costs no contrast at all. See `.app-rail` in `globals.css`.
    active ? 'bg-surface text-brand-deep' : 'text-white hover:bg-white/15',
  );

  // Only while pinched, and only on the desktop rail — the drawer shows labels.
  const tip = (event: { currentTarget: HTMLElement }) => {
    if (!collapsed || !onTip) return;
    const box = event.currentTarget.getBoundingClientRect();
    onTip({ label, top: box.top + box.height / 2, left: box.right + 8 });
  };
  const untip = () => onTip?.(null);

  const pointer = onTip
    ? {
        onMouseEnter: tip,
        onFocus: tip,
        onMouseLeave: untip,
        onBlur: untip,
      }
    : {};

  const content = (
    <>
      <Icon size={nested ? 18 : 20} aria-hidden className="shrink-0" />
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
        // A heading takes the white tab whenever nothing under it has one —
        // standing on `/stock/scan`, which has no row of its own, the rail said
        // "here" to the eye and nothing at all to a screen reader. `true`
        // rather than `page`: the heading is a fold, not the page itself.
        aria-current={active ? 'true' : undefined}
        className={className}
        {...pointer}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={className}
      {...pointer}
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
  const onPath = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const isCurrent = (href: string, exact = false, also?: ReadonlyArray<string>) =>
    (exact ? pathname === href : onPath(href)) || (also?.some(onPath) ?? false);

  /** Whichever of a row's own tests apply. */
  const rowIsCurrent = (item: Pick<Item, 'href' | 'exact' | 'alsoCurrent'>) =>
    isCurrent(item.href, item.exact, item.alsoCurrent);

  // A section that holds the screen you are standing on is never left folded:
  // hiding the page you are on is the one thing this fold must not do.
  const holdsCurrent = (key: string) =>
    (items.find((item) => item.key === key)?.children ?? []).some(rowIsCurrent);

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
  const scroller = useRef<HTMLElement>(null);
  const scrollerInner = useRef<HTMLDivElement>(null);

  /*
   * Whether the list runs past either end of its window, and which one.
   *
   * Fourteen destinations no longer fit the screens this practice owns. Folded
   * to defaults the rail wants 880px and a 1366×768 laptop gives it 572, so
   * five rows sit below the fold — and `overflow-y-auto` says so with nothing
   * at all. That is the horizontal scroll of the old top bar, stood on end,
   * with worse warning than it had: at least a bar that scrolls sideways looks
   * cut off. A hairline and a shadow at whichever end has more behind it is the
   * cheapest honest answer, and it works over a gradient, which a colour fade
   * cannot.
   */
  const [edges, setEdges] = useState({ top: false, bottom: false });

  useEffect(() => {
    const node = scroller.current;
    const inner = scrollerInner.current;
    if (!node) return;

    const sync = () => {
      const room = node.scrollHeight - node.clientHeight;
      setEdges({
        top: room > 1 && node.scrollTop > 1,
        bottom: room > 1 && node.scrollTop < room - 1,
      });
    };

    sync();
    node.addEventListener('scroll', sync, { passive: true });
    // The window resizing and a section unfolding both change the answer, and
    // neither is a scroll — hence the observer, on the content and on its
    // window, rather than a listener on one of them.
    const watcher = new ResizeObserver(sync);
    watcher.observe(node);
    if (inner) watcher.observe(inner);

    return () => {
      node.removeEventListener('scroll', sync);
      watcher.disconnect();
    };
  }, []);

  /** The pinched rail's tooltip — see `onTip` on `RailRow`. */
  const [tip, setTip] = useState<{ label: string; top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Dropped the moment the rail opens back up, so a tooltip cannot outlive the
  // state that justified it.
  useEffect(() => {
    if (!collapsed) setTip(null);
  }, [collapsed]);
  const onTip = useCallback(
    (next: { label: string; top: number; left: number } | null) => setTip(next),
    [],
  );

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
            'flex shrink-0 gap-2 px-3 py-2.5',
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
              {/* Full white like everything else on this ground — see the note
                  on `RailRow`'s colours. It recedes by being micro and regular
                  beside a bold body line, which costs no contrast. */}
              <span className="block truncate text-micro leading-tight text-white">
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

        {/* The list, and the two hairlines that say it runs past its window.
            `relative` so they can sit over the scroll rather than inside it. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <nav
            ref={scroller}
            aria-label={t('menu')}
            className={cn('min-h-0 flex-1 overflow-y-auto px-2 py-2', collapsed && 'lg:px-1.5')}
          >
            <div ref={scrollerInner}>
          {inBlocks(items).map((block) => (
            <div
              key={block.group ?? 'start'}
              className={cn(
                // A rule above every block, drawn whether or not the words over
                // it can be read. It used to appear only in the pinched rail,
                // where the headings were gone — but the headings were the only
                // thing separating the blocks in the open rail too, and they
                // were the dimmest type on the screen. The rule does that work
                // now, and the words are free to be legible.
                block.group && 'mt-2 border-t border-white/25 pt-2 first:mt-0',
                block.group && collapsed && 'lg:mt-1.5 lg:pt-1.5',
              )}
            >
              {block.group ? (
                <p
                  id={`rail-block-${block.group}`}
                  className={cn(
                    'px-3 pb-1 text-micro font-bold tracking-[0.12em] text-white uppercase',
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
            {block.items.map((item) => {
              const { href, key, children } = item;
              const kids = children ?? [];
              // One row under a heading is not a list — see `AppShell`, which
              // collapses those back to a plain link before they reach here.
              const section = kids.length > 0;
              // A heading shows no tab of its own while its list is open: one of
              // the rows under it is holding the tab, starting with the screen
              // the section opens on. Folded shut — or standing somewhere inside
              // the section that has no row of its own, like one item's own page
              // — the heading takes the tab back, because otherwise nothing in
              // the rail says where you are.
              const unfolded = !closed.has(key);
              const onChild = kids.some(rowIsCurrent) && unfolded;

              return (
                <li key={href}>
                  <RailRow
                    // A section heading is a name over a list, not a trip.
                    href={section ? undefined : href}
                    label={t(key)}
                    icon={ICONS[key] ?? LayoutDashboard}
                    active={rowIsCurrent(item) && !onChild}
                    collapsed={collapsed}
                    badge={badges?.[key] ?? 0}
                    expanded={section ? unfolded : undefined}
                    controls={section ? `rail-section-${key}` : undefined}
                    onToggle={section ? () => toggleSection(key) : undefined}
                    onTip={onTip}
                  />

                  {section ? (
                    // Indented off a hairline, which is what says "inside this"
                    // without a second word of chrome. The pinched rail has no
                    // room for the indent, so the icons simply stack.
                    //
                    // Always in the document, hidden rather than dropped: the
                    // heading names this list in `aria-controls`, and while it
                    // was conditionally rendered that name pointed at nothing
                    // for every folded section on the page. `hidden` takes it
                    // out of the layout, the focus order and the accessibility
                    // tree alike — including the drawer's own focus trap, which
                    // filters on `offsetParent`.
                    <ul
                      id={`rail-section-${key}`}
                      hidden={!unfolded}
                      className={cn(
                        'mt-0.5 ml-5 flex flex-col gap-0.5 border-l border-white/25 pl-2',
                        collapsed && 'lg:ml-0 lg:border-l-0 lg:pl-0',
                      )}
                    >
                      {kids.map((child) => (
                        <li key={child.href}>
                          <RailRow
                            href={child.href}
                            label={t(child.key)}
                            icon={ICONS[child.key] ?? LayoutDashboard}
                            active={rowIsCurrent(child)}
                            collapsed={collapsed}
                            onTip={onTip}
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
            </div>
          </nav>

          {/* Not a fade: the ground behind these is a gradient, so a strip of
              one flat colour would only match it at one height. A hairline and
              a shadow read as "this carries on under here" over anything. */}
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-x-0 top-0 h-px bg-white/40 shadow-[0_6px_10px_-4px_rgba(0,0,0,0.45)] transition-opacity',
              edges.top ? 'opacity-100' : 'opacity-0',
            )}
          />
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/40 shadow-[0_-6px_10px_-4px_rgba(0,0,0,0.45)] transition-opacity',
              edges.bottom ? 'opacity-100' : 'opacity-0',
            )}
          />
        </div>

        <div
          className={cn(
            // Desktop only, and the whole strip rather than its one child: the
            // language switcher has moved into the account menu and the account
            // button is already in the phone bar, so below `lg` this was an
            // empty 20px band with a rule across the top of it.
            'hidden shrink-0 flex-col gap-2 border-t border-white/25 p-2 lg:flex',
            collapsed && 'lg:items-center lg:px-1',
          )}
        >
          {/* The language switcher used to live here, and it was the most
              expensive thing in the rail per press: ~50px open and, stacked
              into a column of three codes, ~150px pinched — for a control most
              people touch once. It is in the account menu now, beside the theme
              and the density, which is where it belonged anyway: all three are
              "how this looks to me", and none of them is a destination.

              The account button is here on a desktop only — on a phone it
              lives in the top bar, reachable without opening the drawer. */}
          {account('top')}
        </div>
      </aside>

      {/* The pinched rail's label, in the body rather than in the rail: the
          scrolling list clips anything reaching past 4.5rem. Pointer-inert, so
          it can never be the thing the next click lands on. */}
      {mounted && collapsed && tip
        ? createPortal(
            <div
              role="tooltip"
              aria-hidden
              style={{ top: tip.top, left: tip.left }}
              className="pointer-events-none fixed z-[60] -translate-y-1/2 rounded-lg bg-ink px-2.5 py-1.5 text-meta font-semibold whitespace-nowrap text-paper shadow-pop"
            >
              {tip.label}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
