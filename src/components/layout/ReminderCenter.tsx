'use client';

import { Bell, CalendarClock, CircleCheck, Package, TriangleAlert, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { BellCounts } from '@/lib/follow-ups';
import type { StockAlertCounts } from '@/lib/stock-alerts';
import { cn } from '@/lib/utils';

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
}) {
  const t = useTranslations('reminderBoard');
  const tf = useTranslations('followUps');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);

  const waiting = counts.open + stock.total;

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
        onClick={() => setOpen(true)}
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
              <span
                aria-hidden
                className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-deep"
              >
                <Bell size={22} />
              </span>
              <div className="min-w-0">
                <h2 id={titleId} className="text-title leading-tight font-bold text-ink">
                  {t('title')}
                </h2>
                {/* Dropped on a phone. Beside the "new" button there is about
                    a third of the width left for it, which turns one line of
                    explanation into four lines of squeezed column — and the
                    heading above it already says what this is. */}
                <p className="mt-0.5 hidden text-meta text-ink-soft sm:block">
                  {t('subtitle')}
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

          {/* The glance: three numbers that answer "how bad is it" before a row
              is read. Each is tinted only when it is actually non-zero, so a
              calm board reads as a row of quiet grey rather than a traffic
              light with nothing to say. */}
          <div className="grid grid-cols-3 gap-px border-b border-line bg-line">
            <Stat
              Icon={TriangleAlert}
              label={t('statOverdue')}
              value={counts.overdue}
              tone={counts.overdue > 0 ? 'danger' : 'quiet'}
            />
            <Stat
              Icon={CalendarClock}
              label={t('statToday')}
              value={counts.open - counts.overdue}
              tone={counts.open - counts.overdue > 0 ? 'warn' : 'quiet'}
            />
            <Stat
              Icon={Package}
              label={t('statStock')}
              value={stock.total}
              tone={stock.out > 0 ? 'danger' : stock.total > 0 ? 'warn' : 'quiet'}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {waiting === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <span className="text-ok" aria-hidden>
                  <CircleCheck size={44} />
                </span>
                <p className="text-lead font-bold text-ink">{t('none')}</p>
                <p className="max-w-sm text-body text-ink-soft">{t('noneHint')}</p>
              </div>
            ) : (
              <>
                {/* The storage room leads. A follow-up is something somebody
                    chose to write down and can be pushed to Thursday; an empty
                    box is a fact about this morning and cannot. */}
                {stockList && stock.total > 0 ? (
                  <Section
                    title={t('sectionStock')}
                    hint={t('sectionStockHint')}
                    count={t('countStock', { count: stock.total })}
                  >
                    {stockList}
                  </Section>
                ) : null}

                {/* Always headed, even at nought — one half of the board can be
                    clear while the other is not, and an unlabelled sentence
                    floating under the storage room's rows reads as a note about
                    the storage room rather than as the follow-ups being done. */}
                {followUpList ? (
                  <Section
                    title={t('sectionFollowUps')}
                    hint={t('sectionFollowUpsHint')}
                    count={t('countFollowUps', { count: counts.open })}
                  >
                    {counts.open > 0 ? (
                      followUpList
                    ) : (
                      <p className="px-5 py-5 text-center text-body text-ink-soft sm:px-6">
                        {tf('empty')}
                      </p>
                    )}
                  </Section>
                ) : null}
              </>
            )}

            {/* Last, folded, and outside the branch above — see `quietenedList`. */}
            {quietenedList}
          </div>
        </div>
      </dialog>
    </>
  );
}

/** One number in the glance strip. */
function Stat({
  Icon,
  label,
  value,
  tone,
}: {
  Icon: LucideIcon;
  label: string;
  value: number;
  tone: 'danger' | 'warn' | 'quiet';
}) {
  const palette = { danger: 'text-danger', warn: 'text-warn', quiet: 'text-ink-faint' }[tone];

  return (
    <div className="flex items-center gap-3 bg-surface-soft px-4 py-3 sm:px-5">
      <span className={cn('shrink-0', palette)} aria-hidden>
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
    </div>
  );
}

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
