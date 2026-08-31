'use client';

import {
  ArrowRight,
  Bell,
  CalendarClock,
  CalendarDays,
  CircleCheck,
  ClipboardList,
  Flag,
  FlaskConical,
  List,
  Mail,
  Package,
  PackageSearch,
  PackageX,
  PhoneIncoming,
  Send,
  TriangleAlert,
  User,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
/* Type-only, and it has to stay that way: this is a client component, and
 * `board-elsewhere` reaches for Prisma and the database. A value import would
 * drag the whole client into the browser bundle — which does not fail loudly at
 * the import, it fails as the whole `(app)` layout refusing to compile. */
import type { Elsewhere } from '@/lib/board-elsewhere';
import type { BellCounts } from '@/lib/follow-ups';
import type { StockAlertCounts } from '@/lib/stock-alerts';
import { markBoardSeen } from '@/lib/actions/board';
import { cn } from '@/lib/utils';

/**
 * The questions the board can be asked — one per card in the glance strip.
 *
 * Deliberately the same three the strip has always counted, rather than a set
 * of its own. The strip was already the board's table of contents: three
 * numbers that say how much of each kind is waiting. A row of filter chips
 * underneath it would have been those same three questions asked a second time,
 * in a second control, and the board is a thing people skim — the cheapest
 * filter is the one that adds nothing to skim past.
 *
 * The first three partition the board exactly: late plus not-late is every
 * follow-up, and the storage room is the rest. Nothing on the board is
 * unreachable through them, and no row is reachable through two.
 *
 * The second row cuts *into* the storage room, the way the first two cut into
 * the follow-ups — the shelves with nothing on them, and the orders that were
 * promised and never came. The two overlap by design, a material usually being
 * empty *because* the delivery never came, which is exactly why they are two
 * cards and not one number: "what can I not do today" and "who do I need to
 * ring" are different questions about the same rows.
 */
/* A stable empty default. Written out here rather than as `= []` in the
 * signature, where a fresh array on every render breaks referential equality
 * for everything downstream of it. */
const NO_PILES: ReadonlyArray<Elsewhere> = [];

type BoardFilter =
  | 'all'
  | 'mine'
  | 'urgent'
  | 'overdue'
  | 'today'
  | 'later'
  | 'stock'
  | 'out'
  | 'orderLate';

/**
 * Everything waiting on the practice, behind one bell in the top right.
 *
 * Two changes of mind are recorded here, and they are the same change of mind
 * twice.
 *
 * The first is *what* is on the board. Follow-ups were on it and low stock was
 * not, which meant the one fact that stops a surgery working — no gloves, no
 * anaesthetic — lived two screens away behind a filter nobody opens on a busy
 * morning. The storage room knew. It just had no way to say so anywhere people
 * look. Both kinds of waiting now arrive at the same place, because a board that
 * is only *some* of the reminders teaches people to check elsewhere as well, and
 * then they check nowhere.
 *
 * The second is *where* it is. This was a popover hung off the foot of the
 * navigation rail — bottom-left, below nine destinations, in the corner a screen
 * is read last. That is a fine home for something you go to and a poor one for
 * something that has to catch you, so it moves to the top right: the corner every
 * other application the practice uses puts its notifications in, and the one the
 * eye lands on when a page finishes loading.
 *
 * And it stopped being a popover. A 26rem column hanging off a button was the
 * right size for four one-line errands and the wrong size for a board that now
 * carries the storage room too — sections, counts, two verbs per row. So it is a
 * real modal: centred, wide, and split into a summary read at a glance and
 * sections worked through. `<dialog>` with `showModal()`, exactly like every
 * other dialog here, which is what buys the focus trap, the inert background and
 * Escape without hand-rolling any of the three.
 */
export function ReminderCenter({
  counts,
  stock,
  followUpList,
  stockList,
  quietenedList,
  newButton,
  elsewhere = NO_PILES,
  newOnBoard = 0,
  tone: buttonTone = 'surface',
}: {
  counts: BellCounts;
  stock: StockAlertCounts;
  /**
   * What the trigger is sitting on. `surface` is the pale row across the top of
   * the work; `brand` is the phone bar, which is teal — a white-filled button
   * dropped on it reads as a hole rather than as a control, and the account
   * button beside it has always been an outline.
   */
  tone?: 'surface' | 'brand';
  /** The server-rendered `FollowUpList`. */
  followUpList: ReactNode;
  /** The server-rendered `StockAlertList`, or null when the shelf is fine. */
  stockList: ReactNode;
  /**
   * The server-rendered `QuietenedAlerts`, or null when nothing is waved away.
   *
   * Rendered outside the section machinery below, and outside the empty state,
   * because it is the one thing here that has to be reachable *when the board
   * looks clear*. A board reading "nothing needs you" with three materials
   * quietened underneath it is telling the truth about what it was asked and a
   * lie about the storage room, and the morning somebody wants this list is
   * exactly the morning the board went quiet without them noticing.
   */
  quietenedList?: ReactNode;
  /** The server-rendered "new follow-up" trigger, or null for a reader. */
  newButton?: ReactNode;
  /**
   * The piles that live on other screens — see `lib/board-elsewhere.ts`.
   *
   * Counts and a door, not rows, and that asymmetry is deliberate: the two
   * lists above are *worked* here because their verbs are one press, and these
   * are not. A laboratory is chased with the docket open and a telephone in the
   * other hand; there is no button this modal could offer that would finish it.
   * So the board does the one thing it is uniquely able to do — say the pile
   * exists, on the morning nobody would have gone looking — and then gets out
   * of the way.
   *
   * Already filtered by the server to what this reader may be told and to what
   * is actually non-empty.
   */
  elsewhere?: ReadonlyArray<Elsewhere>;
  /**
   * How much of the board arrived since this person last shut it.
   *
   * The board is complete and, being complete, no longer ever reads nought — a
   * booking request nobody has answered and a shelf below its minimum do not
   * clear themselves, so on a real practice most of the badge has been sitting
   * for days. A number that says the same thing every morning is one people stop
   * reading, which is precisely the failure this whole panel exists to avoid. So
   * the board grew a second sentence: not *how much is waiting*, which it has
   * always been able to say, but *how much of it you have not seen*.
   *
   * Deliberately smaller than the badge and never instead of it. Everything on
   * this board is still real and still waiting; "new" is a way in, not a filter
   * on what matters. See `lib/board-new.ts` for what can honestly be counted
   * and, more to the point, what cannot.
   */
  newOnBoard?: number;
}) {
  const t = useTranslations('reminderBoard');
  const tf = useTranslations('followUps');
  /* No "· 10 seconds ago" beside it, and the reason is worth keeping: this line
   * is rendered on the server and then again in the browser, and *any* clock
   * reading inside it differs between the two — which React reports as a
   * hydration mismatch and repairs by throwing the whole subtree away and
   * redrawing it. Caught by driving the real page, where the panel came out
   * right and the console did not. "Since you last looked" is the fact that
   * matters anyway; the exact minute is not something anybody acts on. */
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);

  const elsewhereWaiting = elsewhere.reduce((sum, pile) => sum + pile.count, 0);

  /* Everything the board is holding, which is what the badge prints and what
   * the "all" card reads.
   *
   * The piles from other screens are in this number, and they have to be: a
   * bell saying 7 over a panel showing 15 is a bell nobody can use to decide
   * whether to open the panel, which is the only job a badge has. */
  const waiting = counts.open + stock.total + elsewhereWaiting;

  /**
   * Which of the piles the board is being asked about.
   *
   * A board that is the only place two unrelated kinds of waiting land is a
   * board that, on a bad morning, is twenty rows deep — and the thing somebody
   * came to it for is a scroll and a half down, between a lab case and a box of
   * gloves. The sections already say *what* each row is; pressing a card is how
   * somebody asks for one of them and puts the rest away for a minute.
   */
  const [filter, setFilter] = useState<BoardFilter>('all');

  /* Each card's number, which is also the size of what pressing it leaves.
   *
   * They are the numbers the strip printed before it could be pressed, moved up
   * here unchanged: a card whose count and whose filter disagreed would be the
   * worst of both, a number nobody trusts on a control nobody presses. */
  const sizes: Record<BoardFilter, number> = {
    all: waiting,
    mine: counts.mine,
    urgent: counts.urgent,
    overdue: counts.overdue,
    today: counts.today,
    later: counts.later,
    stock: stock.total,
    out: stock.out,
    orderLate: stock.orderLate,
  };

  /* Which half of the board a card is about. The two lists are the whole of
   * `BoardFilter` minus `all`, and a key that fell out of both would quietly
   * empty the board — so they are written as one array split in two rather
   * than as two conditions to keep in step. */
  const ABOUT_FOLLOW_UPS = ['mine', 'urgent', 'overdue', 'today', 'later'] as const;
  const ABOUT_STOCK = ['stock', 'out', 'orderLate'] as const;

  const onFollowUps = (ABOUT_FOLLOW_UPS as ReadonlyArray<BoardFilter>).includes(filter);
  const onStock = (ABOUT_STOCK as ReadonlyArray<BoardFilter>).includes(filter);

  /* How much of each pile survives the filter. Not merely which sections to
   * draw: the count in a section's header is a promise about the rows beneath
   * it, and a header still reading "6 follow-ups" over the one late line would
   * be the board lying about its own filter. */
  const stockShown = filter === 'all' ? stock.total : onStock ? sizes[filter] : 0;
  const followUpsShown = filter === 'all' ? counts.open : onFollowUps ? sizes[filter] : 0;

  /* Everything a card needs to be both a number and a switch.
   *
   * Written once rather than six times inline: the interesting part is the
   * condition, and six copies of it in the JSX is six places for one of them to
   * drift.
   *
   * `all` is the odd one out at both ends. It is pressable when it is *not* the
   * current answer, which is the reverse of every other card — a narrowing card
   * that is already lit can still be pressed, to come off it, and coming off
   * "everything" is not a thing you can do. For the same reason it wears no
   * cross: the cross means "take this filter off", and the whole board is what
   * is left when they are all off. */
  const card = (key: BoardFilter) => {
    const chosen = filter === key;

    if (key === 'all') {
      return {
        value: waiting,
        active: chosen,
        onSelect: !chosen && waiting > 0 ? () => setFilter('all') : undefined,
        clearLabel: undefined,
      };
    }

    return {
      value: sizes[key],
      active: chosen,
      clearLabel: t('filterShowAll'),
      onSelect:
        chosen || (sizes[key] > 0 && sizes[key] < waiting)
          ? () => setFilter(chosen ? 'all' : key)
          : undefined,
    };
  };

  /* The board stays open across a server action, deliberately. Ticking one line
   * off a board of six means you are about to tick the next, and a modal that
   * shut itself after every press would make clearing six a six-press,
   * six-reopen job. The rows underneath are replaced by the layout revalidation
   * that `revalidateAll` already triggers.
   *
   * Which leaves the board emptying while it is open. It stays put and says so:
   * the empty state is the reward for having cleared it, and a modal that
   * vanished at the moment of success would read as a bug. */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  /* Remember that this person has looked, once they have stopped looking.
   *
   * On close rather than on open, and `markBoardSeen`'s own comment sets out
   * why: the panel stays open across a server action and is re-rendered by the
   * revalidation every tick produces, so marking on open would clear the "new"
   * marks in the same breath as drawing them.
   *
   * Not awaited and not error-handled here. It writes one column that only the
   * next render reads, and a bell that threw a toast because it could not
   * remember would be worse than one that quietly measures from further back. */
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }

    if (!wasOpen.current) return;
    wasOpen.current = false;
    void markBoardSeen();
  }, [open]);

  /* Clicking the backdrop shuts it.
   *
   * Attached to the element rather than written as an `onClick` prop, because a
   * handler in the JSX would have to sit on the `<dialog>` and be cancelled again
   * by a second one on the panel inside it — two handlers and a `stopPropagation`
   * to express "not on the panel". A modal `<dialog>` fills the viewport and its
   * backdrop *is* the element, so a click that lands on the backdrop reports the
   * dialog itself as its target and a click on anything inside reports that
   * instead. One comparison, no propagation games, and nothing non-interactive
   * ends up carrying a mouse handler. */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;

    const onClick = (event: MouseEvent) => {
      if (event.target === dialog) setOpen(false);
    };

    dialog.addEventListener('click', onClick);
    return () => dialog.removeEventListener('click', onClick);
  }, [open]);

  /* Colour says what kind of pile it is, the number says how big.
   *
   * Red is kept for something that has already gone wrong — a line past its day,
   * or a material with nothing left in it. Amber is the week's work. A badge that
   * turns red because six things are due next Friday is one everybody learns to
   * walk past, and then on the morning it means something nobody looks. */
  const bad = counts.overdue + stock.out;
  const tone =
    bad > 0 ? 'bg-danger text-white' : waiting > 0 ? 'bg-warn text-white' : 'bg-white/25 text-white';

  return (
    <>
      <button
        type="button"
        /* Opened whole, every time. A filter is a question asked of *this*
           opening; carrying it over to the next means the board somebody opens
           an hour later can be hiding the alarm they opened it for, and the
           badge on this very button will have counted that alarm. */
        onClick={() => {
          setFilter('all');
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${t('title')} — ${t('badgeLabel', { count: waiting })}`}
        className={cn(
          // The radius belongs to each branch rather than the shared half: two
          // rounding utilities in one class string is a coin toss decided by
          // which one Tailwind happens to emit last, not by the order written.
          'relative flex min-h-11 min-w-11 shrink-0 items-center justify-center',
          buttonTone === 'brand'
            ? 'on-brand-control rounded-lg focus-visible:outline-white'
            : 'rounded-xl border border-line-strong bg-surface text-ink-soft transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-deep focus-visible:outline focus-visible:outline-offset-2',
        )}
      >
        <Bell size={20} aria-hidden />

        {/* Nothing at all when the board is clear. An empty badge is a shape the
            eye still checks; no badge is the only honest way to say "none". */}
        {waiting > 0 ? (
          <span
            aria-hidden
            className={cn(
              'absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center rounded-full',
              'px-1.5 text-micro font-bold tabular-nums ring-2',
              // The ring is what lifts the badge off whatever it overlaps, so it
              // has to be the colour behind the button rather than a fixed white.
              buttonTone === 'brand' ? 'ring-brand-deep' : 'ring-surface',
              tone,
            )}
          >
            {waiting > 99 ? '99+' : waiting}
          </span>
        ) : null}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        className={cn(
          'm-auto max-h-[min(90vh,54rem)] w-[min(96vw,58rem)] overflow-visible',
          'rounded-[var(--radius-card)] border border-line bg-surface p-0 text-ink shadow-pop',
        )}
      >
        <div className="flex max-h-[min(90vh,54rem)] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
            <div className="flex min-w-0 items-start gap-3">
              {/* Dropped on a phone, for the reason the subtitle below it is.
                  Between the bell tile and the "new follow-up" button there was
                  not enough width left at 390px for the word "Reminders", and a
                  single word cannot wrap — so the heading ran out under the
                  button. The tile is decoration on a panel whose heading, whose
                  trigger and whose whole reason for being on screen already say
                  "bell"; the word is not. */}
              <span
                aria-hidden
                className="hidden size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-deep sm:grid"
              >
                <Bell size={22} />
              </span>
              <div className="min-w-0">
                {/* And truncated as the backstop. Dropping the tile buys enough
                    room for every locale's title at 390px, but "Promemoria" on
                    a 320px screen would overflow again, and clipping a heading
                    is the one failure here that stays readable — the accessible
                    name is the full text either way. */}
                <h2 id={titleId} className="truncate text-title leading-tight font-bold text-ink">
                  {t('title')}
                </h2>
                {/* Dropped on a phone. Beside the "new" button there is about
                    a third of the width left for it, which turns one line of
                    explanation into four lines of squeezed column — and the
                    heading above it already says what this is. */}
                {/* What is new displaces the standing explanation, on the one
                    morning it has something to say.
                
                    Not both: the subtitle is a sentence about what this panel is
                    for, which somebody needs exactly once, and "3 new since
                    Friday" is the sentence they need every time there is one.
                    Stacking them would push the rows further down the screen to
                    say something less useful above something more. */}
                <p className="mt-0.5 hidden text-meta sm:block">
                  {newOnBoard > 0 ? (
                    <span className="font-bold text-brand-deep">
                      {t('newSince', { count: newOnBoard })}
                    </span>
                  ) : (
                    <span className="text-ink-soft">{t('subtitle')}</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {newButton}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-label={t('close')}
                onClick={() => setOpen(false)}
              >
                <X size={20} aria-hidden />
              </button>
            </div>
          </header>

          {/* The glance, which is also the narrowing.
              
              Numbers that answer "how bad is it" before a row is read, and —
              since the board grew long enough to need filtering — the questions
              it can be asked. Each is tinted only when it is actually non-zero,
              so a calm board reads as a row of quiet grey rather than a traffic
              light with nothing to say.
              
              A card is only pressable when pressing it would change what is on
              screen: nought to show, or already the whole board, and it stays
              the plain number it always was rather than a control that does
              nothing. The lit one is the exception — tick the last line off
              under it and it would otherwise go dead mid-press, taking the way
              back with it. See `Stat`. */}
          <div role="group" aria-label={t('filterLabel')} className="border-b border-line">
            {/* One grid, nine cards, three to a line at every width.
                
                Read down the columns and it is three questions asked three
                ways: *whose and how bad* on the top line, *by when* in the
                middle, *the storage room* at the bottom. Read across and each
                line is a pile with its own cuts beside it.
                
                Three across a 390px screen is about a hundred pixels of card,
                which fits every label in every language once the icon steps
                aside — so the icon is the thing that goes on a phone, not the
                word. Nine divides by three at every breakpoint, which is what
                keeps the grid a rectangle: an incomplete last line would show
                as a block of the hairline colour, because that colour is the
                grid's own background showing through the one-pixel gaps. */}
            <div className="grid grid-cols-3 gap-px bg-line">
              <Stat Icon={List} label={t('statAll')} tone="plain" {...card('all')} />
              <Stat
                Icon={User}
                label={t('statMine')}
                tone={sizes.mine > 0 ? 'plain' : 'quiet'}
                {...card('mine')}
              />
              <Stat
                Icon={Flag}
                label={t('statUrgent')}
                tone={sizes.urgent > 0 ? 'danger' : 'quiet'}
                {...card('urgent')}
              />

              <Stat
                Icon={TriangleAlert}
                label={t('statOverdue')}
                tone={sizes.overdue > 0 ? 'danger' : 'quiet'}
                {...card('overdue')}
              />
              <Stat
                Icon={CalendarClock}
                label={t('statToday')}
                tone={sizes.today > 0 ? 'warn' : 'quiet'}
                {...card('today')}
              />
              <Stat
                Icon={CalendarDays}
                label={t('statLater')}
                tone={sizes.later > 0 ? 'plain' : 'quiet'}
                {...card('later')}
              />

              <Stat
                Icon={Package}
                label={t('statStock')}
                tone={stock.out > 0 ? 'danger' : stock.total > 0 ? 'warn' : 'quiet'}
                {...card('stock')}
              />
              <Stat
                Icon={PackageX}
                label={t('statOut')}
                tone={sizes.out > 0 ? 'danger' : 'quiet'}
                {...card('out')}
              />
              <Stat
                Icon={PackageSearch}
                label={t('statOrderLate')}
                tone={sizes.orderLate > 0 ? 'danger' : 'quiet'}
                {...card('orderLate')}
              />
            </div>
          </div>

          {/* `data-filter` is what narrows the rows *within* a section — the
              sections themselves are dropped in the JSX below. See the
              `[data-filter='now']` rule in `globals.css` for why it is an
              attribute and a stylesheet rather than a second render. */}
          <div data-filter={filter} className="min-h-0 flex-1 overflow-y-auto">
            {waiting === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <span className="text-ok" aria-hidden>
                  <CircleCheck size={44} />
                </span>
                <p className="text-lead font-bold text-ink">{t('none')}</p>
                <p className="max-w-sm text-body text-ink-soft">{t('noneHint')}</p>
              </div>
            ) : /* The pile emptied under somebody's hands — the last late line
                  ticked off while the filter was still on it. Not the board's
                  empty state, which says "nothing needs you" and would be a lie
                  with eleven rows one press away, so it says what is really
                  true and offers the press. */
            sizes[filter] === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
                <span className="text-ok" aria-hidden>
                  <CircleCheck size={40} />
                </span>
                <p className="text-lead font-bold text-ink">{t('filterEmpty')}</p>
                <p className="max-w-sm text-body text-ink-soft">
                  {t('filterEmptyHint', { count: waiting })}
                </p>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setFilter('all')}
                >
                  {t('filterShowAll')}
                </button>
              </div>
            ) : (
              <>
                {/* The storage room leads. A follow-up is something somebody
                    chose to write down and can be pushed to Thursday; an empty
                    box is a fact about this morning and cannot. */}
                {stockList && stockShown > 0 ? (
                  <Section
                    title={t('sectionStock')}
                    hint={t('sectionStockHint')}
                    count={t('countStock', { count: stockShown })}
                  >
                    {stockList}
                  </Section>
                ) : null}

                {/* Always headed, even at nought — one half of the board can be
                    clear while the other is not, and an unlabelled sentence
                    floating under the storage room's rows reads as a note about
                    the storage room rather than as the follow-ups being done. */}
                {followUpList && (filter === 'all' || followUpsShown > 0) ? (
                  <Section
                    title={t('sectionFollowUps')}
                    hint={t('sectionFollowUpsHint')}
                    count={t('countFollowUps', { count: followUpsShown })}
                  >
                    {followUpsShown > 0 ? (
                      followUpList
                    ) : (
                      <p className="px-5 py-5 text-center text-body text-ink-soft sm:px-6">
                        {tf('empty')}
                      </p>
                    )}
                  </Section>
                ) : null}

                {/* Last of the three, because it is the only one nobody can
                    act on from here. A row that sends you somewhere else
                    belongs under the rows that do not. */}
                {filter === 'all' && elsewhere.length > 0 ? (
                  <Section
                    title={t('sectionElsewhere')}
                    hint={t('sectionElsewhereHint')}
                    count={t('countElsewhere', { count: elsewhereWaiting })}
                  >
                    <ul className="divide-y divide-line">
                      {elsewhere.map((pile) => (
                        <ElsewhereRow key={pile.key} pile={pile} />
                      ))}
                    </ul>
                  </Section>
                ) : null}
              </>
            )}

            {/* Last, folded, and outside the branch above — see `quietenedList`.
                Dropped under the two follow-up cards, where a list of quietened
                *materials* is the one thing on screen that somebody has just
                said they are not asking about. */}
            {onFollowUps ? null : quietenedList}
          </div>
        </div>
      </dialog>
    </>
  );
}

/**
 * One number in the glance strip, and — when it would narrow anything — the
 * control that asks the board for it.
 *
 * A button only when `onSelect` is given. A card reading 0, or one already
 * holding the whole board, would be a control whose press changes nothing, and
 * the strip is read at a glance: three cards where two are pressable and one is
 * not is honest, three where all look pressable and one is inert is not.
 *
 * Pressed, it takes its own soft colour rather than the app's teal. The card
 * *is* the filter, so the selected one should look like a lit version of
 * itself; a teal wash over a red number would read as a fourth state nobody
 * has a name for.
 */
function Stat({
  Icon,
  label,
  value,
  tone,
  active,
  onSelect,
  clearLabel,
}: {
  Icon: LucideIcon;
  label: string;
  value: number;
  /** `plain` is the whole board's own card: present, but not an alarm. */
  tone: 'danger' | 'warn' | 'quiet' | 'plain';
  active: boolean;
  /** Omitted when pressing would change nothing — the card stays a plain number. */
  onSelect?: () => void;
  /** Given only by a card that can be come off. See `card` in the board above. */
  clearLabel?: string;
}) {
  const palette = {
    danger: 'text-danger',
    warn: 'text-warn',
    quiet: 'text-ink-faint',
    plain: 'text-ink',
  }[tone];
  /* Whole class names, not `palette.replace('text-', 'ring-')`: Tailwind reads
   * the source for literal strings and generates nothing for a name a running
   * program assembles. */
  const lit = {
    danger: 'bg-danger-soft ring-danger',
    warn: 'bg-warn-soft ring-warn',
    quiet: 'bg-brand-soft ring-brand',
    plain: 'bg-brand-soft ring-brand',
  }[tone];

  const body = (
    <>
      {/* Gone on a phone — see the strip's comment. Three cards across 390px
          have room for the number and the word, and not for a picture of the
          word. */}
      <span className={cn('hidden shrink-0 sm:block', palette)} aria-hidden>
        <Icon size={20} />
      </span>
      <span className="min-w-0">
        <span className={cn('block text-figure leading-none font-bold tabular-nums', palette)}>
          {value}
        </span>
        <span className="mt-1 block truncate text-meta font-semibold text-ink-soft">
          {label}
        </span>
      </span>
    </>
  );

  const shell = 'relative flex w-full items-center gap-3 px-3 py-3 text-left sm:px-5';

  /* Lit without being a button: "all", while it is the answer. Nothing to
   * press — it is already what is on screen — but it still has to show which
   * card the board is standing on, or the strip would look unfiltered at the
   * exact moment it is showing everything on purpose. */
  if (!onSelect) {
    return (
      <div
        /* Not `aria-pressed` — that belongs to a button, and this is not one.
         * `aria-current` is the attribute for "of these, this is the one you
         * are on", and it is valid on any element. */
        aria-current={active ? 'true' : undefined}
        className={cn(shell, active ? cn(lit, 'ring-1 ring-inset') : 'bg-surface-soft')}
      >
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        shell,
        'transition-colors focus-visible:outline focus-visible:-outline-offset-2',
        active ? cn(lit, 'ring-1 ring-inset') : 'bg-surface-soft hover:bg-paper',
      )}
    >
      {body}

      {/* The way off, said rather than left to be guessed.
      
          A pressed card that only unpresses when pressed again is a convention
          people know from tabs and toggles, and half of them still hunt for a
          "clear" somewhere else — so the lit card wears the cross that every
          filter in every other application wears. Not a second button: the card
          already *is* the control, and a real button nested inside a button is
          invalid HTML and a coin toss over which one a click reaches. The word
          goes to the screen reader through the label. */}
      {active && clearLabel ? (
        <>
          <X size={14} aria-hidden className={cn('absolute top-2 right-2', palette)} />
          <span className="sr-only">— {clearLabel}</span>
        </>
      ) : null}
    </button>
  );
}

/**
 * One pile that lives on another screen: what it is, how big, and the door.
 *
 * Deliberately plainer than the rows above it. Those carry two verbs each
 * because the work can be finished where it is read; this one carries a link
 * because it cannot, and dressing it up with buttons that only navigate would
 * make four navigations look like four actions.
 *
 * The whole row is the link, not a chevron at the end of it: it is one sentence
 * long and there is nothing else on it to press, so a target the width of the
 * board is simply a bigger target than a caret — which is the difference
 * between a thumb and a mis-tap on the phone this is mostly read on.
 */
function ElsewhereRow({ pile }: { pile: Elsewhere }) {
  const t = useTranslations('reminderBoard');
  const Icon = ELSEWHERE_ICONS[pile.key];

  return (
    <li>
      <Link
        href={pile.href}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-paper sm:px-5"
      >
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-soft text-ink-soft"
        >
          <Icon size={18} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">
            {t(`elsewhere.${pile.key}`, { count: pile.count })}
          </span>
          <span className="mt-0.5 block text-meta text-ink-faint">
            {t(`elsewhereHint.${pile.key}`)}
          </span>
        </span>

        <ArrowRight size={16} aria-hidden className="shrink-0 text-ink-faint" />
      </Link>
    </li>
  );
}

/** One picture per pile, matching whatever the destination screen already uses. */
const ELSEWHERE_ICONS: Record<Elsewhere['key'], LucideIcon> = {
  works: FlaskConical,
  requests: PhoneIncoming,
  mail: Mail,
  unreminded: Send,
  unwritten: ClipboardList,
};

/** A titled run of rows, with its count in the header rather than in a badge. */
function Section({
  title,
  hint,
  count,
  children,
}: {
  title: string;
  hint: string;
  count: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-line last:border-b-0">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-paper px-5 py-2.5 sm:px-6">
        <h3 className="text-caption font-bold tracking-wide text-ink-soft uppercase">{title}</h3>
        <p className="text-meta font-semibold tabular-nums text-ink-faint">{count}</p>
        <p className="w-full text-meta text-ink-faint">{hint}</p>
      </header>
      {children}
    </section>
  );
}
