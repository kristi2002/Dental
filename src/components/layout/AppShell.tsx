import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { ClinicMark } from '@/components/brand/ClinicLogo';
import { FollowUpFormDialog } from '@/components/follow-ups/FollowUpFormDialog';
import { FollowUpList } from '@/components/follow-ups/FollowUpList';
import { PageHelp } from '@/components/help/PageHelp';
import { QuietenedAlerts } from '@/components/stock/QuietenedAlerts';
import { StockAlertList } from '@/components/stock/StockAlertList';
import { AppointmentRequestStatus } from '@/generated/prisma/enums';
import type { SessionUser } from '@/lib/auth/session';
import { getBackupStatus } from '@/lib/backup-status';
import { toDateKey, today } from '@/lib/dates';
import { bellCounts } from '@/lib/follow-ups';
import { countNewElsewhere, getWaitingElsewhere } from '@/lib/board-elsewhere';
import { countNew } from '@/lib/board-new';
import { getUnreadCount } from '@/lib/messages/threads';
import { prisma } from '@/lib/prisma';
import {
  clinicDisplayName,
  getAssignableStaff,
  getClinicProfile,
  getOpenFollowUps,
  getStockAlerts,
} from '@/lib/queries';
import { HELP_TOPICS } from '@/lib/help/topics';
import { HIDEABLE } from '@/lib/nav-visibility';
import { stockAlertCounts } from '@/lib/stock-alerts';
import { BackupBanner } from './BackupBanner';
import { ReminderCenter } from './ReminderCenter';
import { CommandPalette } from './CommandPalette';
import { NAV_DESTINATIONS, SEARCHABLE_LISTS } from './nav-destinations';
import { Sidebar } from './Sidebar';
import { TailorMenu } from './TailorMenu';

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
  const tn = await getTranslations('nav');
  const tc = await getTranslations('common');
  // The three screens that live in the user menu keep their labels there.
  const ta = await getTranslations('auth');
  // The working screens the rail does not carry are named on their own pages,
  // and the palette calls them what those pages call themselves.
  const ts = await getTranslations('stock');
  const torders = await getTranslations('orders');
  const tscan = await getTranslations('scan');
  const tday = await getTranslations('daySheet');
  const th = await getTranslations('help');

  // Which shape the rail is in is read on the server, so a pinched rail does not
  // flash open before hydration. The layout is already dynamic — the session is
  // itself a cookie — so this costs nothing.
  const store = await cookies();
  const railCollapsed = store.get('rail')?.value === 'collapsed';

  // Whose practice this is. The rail and the footer both write it, and it is the
  // one thing on every screen that says this install belongs to somebody — so
  // unlike the letterhead, which prints nothing rather than a placeholder, the
  // chrome falls back to the product's own name rather than going blank.
  const clinicName = clinicDisplayName(await getClinicProfile()) || t('name');

  const allowed = (permission: (typeof NAV_DESTINATIONS)[number]['permission']) =>
    permission === null || user.permissions.includes(permission);

  // A section stays in the rail even when every one of its sub-screens is out of
  // reach — the sub-screens are the extras, not the reason the section is there.
  //
  // `group` rides along untouched. The rail rules a heading in wherever it
  // changes, which is what makes the headings survive this filter for free: a
  // block whose every row a role may not open loses its heading with them,
  // because no surviving row ever names that group.
  const reachable = NAV_DESTINATIONS.filter(({ permission }) => allowed(permission)).map(
    ({ href, key, group, children }) => ({
      href,
      key,
      group,
      children: children
        ?.filter(({ permission }) => allowed(permission))
        .map(({ href, key, exact }) => ({ href, key, exact })),
    }),
  );

  // And then what this particular person has asked not to look at — see
  // `lib/nav-visibility.ts`. It arrives on the session, which is one query that
  // was already happening, so this costs nothing and cannot flicker.
  //
  // Two lists rather than one, deliberately: the rail is drawn from the short
  // list and the search box below is built from the long one, so a screen
  // somebody has put away is out of the menu and still one Ctrl-K away. A
  // tidy-up that hid things from search would be a trap.
  const hidden = new Set(user.hiddenNav);
  const items = reachable.filter(({ key }) => !hidden.has(key));

  // Everywhere the palette can send somebody: the rail's own destinations and
  // the lists filed under them, flattened, plus the three screens that live in
  // the user menu rather than the rail. Permission-filtered here, on the server,
  // so the browser is never handed the name of a screen it may not open.
  const destinations = [
    ...reachable.flatMap(({ href, key, children }) => [
      { href, label: tn(key) },
      // The screen a section opens on is listed once, under the section's own
      // name — it is the first row of the list in the rail, but here that same
      // href is already the section's entry above.
      ...(children ?? [])
        .filter((child) => child.href !== href)
        .map((child) => ({
          href: child.href,
          label: `${tn(key)} · ${tn(child.key)}`,
        })),
    ]),
    ...(user.permissions.includes('staff.manage')
      ? [{ href: '/staff', label: ta('manageStaff') }]
      : []),
    ...(user.permissions.includes('audit.view')
      ? [{ href: '/activity', label: ta('activity') }]
      : []),
    ...(user.permissions.includes('settings.view')
      ? [{ href: '/settings', label: ta('settings') }]
      : []),
    // Screens with no row of their own anywhere: each is opened by a button on
    // the list it belongs to, and is therefore unreachable from any other screen
    // in the building. The rail is a short list on purpose and they do not
    // belong in it — but "where is the stocktake" is a question, and this is the
    // box people ask questions in.
    ...(user.permissions.includes('appointment.view')
      ? [{ href: '/day-sheet', label: tday('title') }]
      : []),
    // "Is the composite here yet" is a front-desk question and a reading one, so
    // this is the one storage screen on `stock.view` rather than `stock.edit` —
    // the page guards itself the same way. It has no row in the rail and is
    // opened from a button on the storage list, which is exactly the case this
    // list exists for.
    ...(user.permissions.includes('stock.view')
      ? [{ href: '/stock/orders', label: `${tn('stock')} · ${torders('title')}` }]
      : []),
    ...(user.permissions.includes('stock.edit')
      ? [
          { href: '/stock/scan', label: `${tn('stock')} · ${tscan('title')}` },
          { href: '/stock/stocktake', label: `${tn('stock')} · ${ts('stocktakeTitle')}` },
          { href: '/stock/expiry', label: `${tn('stock')} · ${ts('expiryTitle')}` },
        ]
      : []),
  ];

  // Where the same words can be asked again, when the palette itself has no
  // answer to them. Each of these pages searches its own contents on `?q=`, and
  // a front desk holding a box of composite is looking for a material, not for
  // somebody called Composite. Permission-filtered on the server like the rest.
  const searches = SEARCHABLE_LISTS.filter(({ permission }) => allowed(permission)).map(
    ({ href, key }) => ({ href, label: tn(key) }),
  );

  // Which screens the help library lists, in the registry's own order.
  //
  // A topic earns its place by the *section* it belongs to being somewhere this
  // person can go — the first segment of its first route, looked up in the
  // permission-filtered destinations above. That is what keeps a receptionist
  // from browsing an explanation of the statistics they may not open, and it
  // covers the record screens for free: `/patients/:id` is reachable because
  // `/patients` is, which is exactly the truth of it.
  const helpTopics = HELP_TOPICS.filter((entry) => {
    const section = `/${entry.routes[0].split('/')[1]}`;
    return destinations.some((destination) => destination.href === section);
  }).map((entry) => entry.id);

  // What the tailor menu offers to switch off: everything this person can reach,
  // named the way the menu they are editing names it. Permission-filtered here
  // like everything else, so nobody is offered a switch for a screen they could
  // not open in the first place.
  const tailorItems = HIDEABLE.filter(({ permission }) => allowed(permission)).map((item) => ({
    ...item,
    label: item.labels === 'auth' ? ta(item.labelKey) : tn(item.labelKey),
  }));

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

  // The board behind the bell. Read here rather than on each page because the
  // bell is drawn on every one of them — and rendered here, on the server, so
  // the rail is handed finished markup instead of a list of rows plus the job of
  // formatting dates in three languages on the client.
  const canSeeFollowUps = user.permissions.includes('followup.view');
  const canEditFollowUps = user.permissions.includes('followup.edit');

  const [openFollowUps, followUpStaff] = canSeeFollowUps
    ? await Promise.all([getOpenFollowUps(), getAssignableStaff()])
    : [[], []];

  // The storage room's half of the board. Read here for the same reason the
  // follow-ups are — the bell is drawn on every screen — and gated on
  // `stock.view`, because somebody who may not open the cupboard must not be
  // told what is in it by a badge in the corner.
  // The counts in the rail. Each is gated on its own permission for the same
  // reason the bell's are: somebody who may not open a list must not be told how
  // much is in it by a number in the corner.
  //
  // Two, and the bar for a third is still meant to be high — the test is whether
  // the number is *somebody else waiting*. A patient's unanswered reply is; so
  // is a stranger who left their telephone number on the public page and has
  // heard nothing back, which is the one queue here where nobody has any
  // relationship with the practice yet and silence reads as being ignored.
  const [unreadMail, waitingRequests] = await Promise.all([
    user.permissions.includes('message.view') ? getUnreadCount() : 0,
    user.permissions.includes('request.view')
      ? prisma.appointmentRequest.count({ where: { status: AppointmentRequestStatus.NEW } })
      : 0,
  ]);
  const badges =
    unreadMail > 0 || waitingRequests > 0
      ? {
          ...(unreadMail > 0 ? { inbox: unreadMail } : {}),
          ...(waitingRequests > 0 ? { requests: waitingRequests } : {}),
        }
      : undefined;

  const canSeeStock = user.permissions.includes('stock.view');
  const canEditStock = user.permissions.includes('stock.edit');
  // Two halves: what the board is asking about, and what somebody has told it
  // to drop. The second is only ever an undo list — it is not counted, badged
  // or sorted with the first.
  const { active: alerts, quietened } = canSeeStock
    ? await getStockAlerts()
    : { active: [], quietened: [] };

  // The piles that live on other screens — a case still at the laboratory, a
  // stranger who left their number, tomorrow's patient nobody has told. Counts
  // only, already gated on the permission that opens each screen, and already
  // stripped of the empty ones. See `lib/board-elsewhere.ts` for why they are
  // counts rather than rows.
  const elsewhere = await getWaitingElsewhere(user.permissions);

  /*
   * When this person last shut the board, and how much has landed since.
   *
   * Read with its own lookup rather than added to `SessionUser`, which would be
   * the cheaper place — `getCurrentUser` already selects from this row and is
   * `cache`d. That file is being refactored by somebody else as this is
   * written, and one indexed primary-key lookup is a small price for not
   * editing a type mid-change. Worth folding into the session read later.
   */
  const seen = await prisma.staffUser.findUnique({
    where: { id: user.id },
    select: { boardSeenAt: true },
  });
  const boardSeenAt = seen?.boardSeenAt ?? null;

  const newOnBoard =
    countNew(openFollowUps, boardSeenAt) +
    (await countNewElsewhere(user.permissions, boardSeenAt));

  // Read here rather than on the Staff page alone, because a failure nobody
  // visits that page to discover is a failure nobody discovers. Two small file
  // reads, and only for the person who can act on the answer.
  const backupStatus = user.permissions.includes('backup.export')
    ? await getBackupStatus()
    : null;

  /**
   * The board, built per corner it appears in.
   *
   * A function rather than one element used twice: the trigger has to be an
   * outline on the phone bar's teal and a filled control on the pale row across
   * the desktop, and those are the only two things that differ. Only one of the
   * two is ever on screen — the phone bar is `lg:hidden` and the desktop copy is
   * `hidden lg:block` — exactly as the account button has always worked.
   *
   * Drawn for somebody with no follow-up permission at all, because the storage
   * room's half stands on its own, and not at all when both halves are shut.
   */
  const renderBoard = (tone: 'surface' | 'brand') =>
    // Drawn for anybody with any of the three, not just the first two: a
    // receptionist who may not open the cupboard and keeps no follow-ups still
    // has a queue of people waiting to be answered, and the bell is where the
    // app promises to say so.
    canSeeFollowUps || canSeeStock || elsewhere.length > 0 ? (
      <ReminderCenter
        tone={tone}
        counts={bellCounts(openFollowUps, today(), user.id)}
        elsewhere={elsewhere}
        newOnBoard={newOnBoard}
        stock={stockAlertCounts(alerts)}
        followUpList={
          canSeeFollowUps ? (
            <FollowUpList
              items={openFollowUps}
              canEdit={canEditFollowUps}
              staff={followUpStaff}
              variant="popover"
              viewerId={user.id}
              seenAt={boardSeenAt}
            />
          ) : null
        }
        stockList={
          canSeeStock ? <StockAlertList alerts={alerts} canEdit={canEditStock} /> : null
        }
        // Only for somebody who could have made the dismissal in the first
        // place. A reader shown an undo they may not press is being offered a
        // dead button.
        quietenedList={
          canSeeStock && canEditStock ? <QuietenedAlerts alerts={quietened} /> : null
        }
        // A reader gets the board without the pen. `followup.edit` is what the
        // action checks anyway; this is only so the button is not advertised.
        newButton={
          canEditFollowUps ? (
            <FollowUpFormDialog
              staff={followUpStaff}
              today={toDateKey(today())}
              triggerClassName="btn btn-primary btn-sm shrink-0"
              // Words on a desktop, the alarm clock alone on a phone — the
              // board's own heading needs the width back. See `compact`.
              compact="phone"
            />
          ) : null
        }
      />
    ) : null;

  return (
    // Column on a phone — top bar above the page. Row on a desktop — rail beside it.
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar
        items={items}
        clinicName={clinicName}
        board={renderBoard('brand')}
        badges={badges}
        defaultCollapsed={railCollapsed}
        defaultClosedSections={closedSections}
        user={{
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          // Permission first, then whether this person has put the row away.
          // The three screens the account menu carries are the three people ask
          // to be rid of most often — a front desk has no use for an activity
          // log, and one owner's practice has no use for four copies of the
          // opening-hours link. Hidden here is hidden in the menu only: the
          // search box still finds all three, and the pages still guard
          // themselves.
          canManageStaff: user.permissions.includes('staff.manage') && !hidden.has('staff'),
          canViewAudit: user.permissions.includes('audit.view') && !hidden.has('activity'),
          canViewSettings: user.permissions.includes('settings.view') && !hidden.has('settings'),
        }}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Above everything, including the search box: when the backups have
            stopped, that is the most important thing on the screen. It renders
            nothing at all in the ordinary case. */}
        {backupStatus ? <BackupBanner status={backupStatus} /> : null}

        {/* One box, on every screen, that finds a person or a place. Deliberately
            thin and unpinned: the rail already costs width, and a second bar
            fixed across the top is exactly what this layout removed. It scrolls
            away with the page, because the keyboard shortcut is how it is
            actually opened after the first day. */}
        {/* Never on paper. It is navigation, like the rail and the masthead
            beside it, and it was reaching the printer only because it sits
            outside all three of them — so a prescription, a day sheet and a
            sheet of shelf labels each came out with an empty search box across
            the top. */}
        <div className="px-4 pt-4 sm:px-8" data-print-hide>
          {/* The search box and the bell share one row across the top of the
              work, which is what puts the board in the corner every other
              application the practice uses keeps its notifications in. The row
              scrolls away with the page exactly as the palette always did —
              this layout deleted its pinned top bar on purpose, and a bell is
              not the reason to put one back. */}
          <div className="mx-auto flex w-full max-w-6xl items-start gap-3">
            <div className="min-w-0 flex-1">
              <CommandPalette
              destinations={destinations}
                searches={searches}
                label={tc('search')}
                placeholder={t('palettePlaceholder')}
                screensLabel={t('paletteScreens')}
                patientsLabel={tn('patients')}
                helpLabel={th('paletteHelp')}
                topics={helpTopics.map((id) => ({
                  href: id,
                  label: th(`topics.${id}.title`),
                }))}
                emptyLabel={t('paletteHint')}
              />
            </div>

            {/* And beside it, the two buttons that are about the application
                rather than about the practice: what this screen is for, and
                which screens you want to keep.

                They are in the same corner on every page — that is the whole of
                what makes them findable. Help attached to a page is help nobody
                finds twice, because the second time they are somewhere else and
                it has moved. Unlike the bell there is no phone copy: the bell is
                duplicated into the sticky teal bar because a notification that
                scrolls off the top is a notification nobody sees, and neither of
                these is ever urgent. */}
            <PageHelp
              destinations={destinations}
              permissions={user.permissions}
              topics={helpTopics}
              pointer={user.needsHelpPointer}
            />
            <TailorMenu items={tailorItems} hidden={user.hiddenNav} />

            {/* The desktop copy. On a phone the same board rides in the
                sticky bar instead — see `Sidebar`. */}
            <div className="hidden lg:block">{renderBoard('surface')}</div>
          </div>
        </div>

        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <div className="app-measure">{children}</div>
        </main>

        <footer className="border-t border-line bg-surface">
          {/* The mark again, in the app's teal and small — the rail's is white on
              teal and scrolls away with nothing, while this one closes the page
              the way the letterhead opens the paper. Decorative: the practice's
              name is written right beside it. */}
          <div className="mx-auto flex w-full max-w-6xl items-center gap-2.5 px-4 py-4 text-meta text-ink-soft sm:px-8">
            <ClinicMark variant="brand" alt="" className="h-5 w-auto shrink-0 opacity-80" />
            <span className="min-w-0 truncate">
              {clinicName} · {t('tagline')}
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
