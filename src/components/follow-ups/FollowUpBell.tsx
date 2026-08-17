'use client';

import { AlarmClock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { BellCounts } from '@/lib/follow-ups';
import { cn } from '@/lib/utils';

/**
 * The board, on every screen in the app.
 *
 * This is chrome rather than a destination, and deliberately so. A follow-up you
 * have to navigate to is a follow-up you find on Thursday when it was for
 * Monday, which is exactly the failure the sticky note on the monitor already
 * had. So it sits beside the account button — the only other thing in this
 * layout that is about *you* rather than about the screen you are on — in the
 * phone bar and at the foot of the rail.
 *
 * It is also why this is an icon with a count rather than a row in the rail: the
 * rail collapses to 4.5rem and a labelled row cannot survive that, while a badge
 * on an icon reads the same at both widths. `Recalls` already holds the bell in
 * that list anyway, and two bells one above the other would be unreadable.
 *
 * The list inside is passed in already rendered, from the server — the dates are
 * formatted in the reader's locale and the rows carry server actions. All this
 * component does is open and shut.
 */
export function FollowUpBell({
  counts,
  placement = 'bottom',
  compact = false,
  children,
  newButton,
}: {
  counts: BellCounts;
  /** `top` for the rail foot, where there is nothing below to open into. */
  placement?: 'top' | 'bottom';
  /** The pinched rail: the icon alone, no label. */
  compact?: boolean;
  /** The server-rendered `FollowUpList`. */
  children: ReactNode;
  /** The server-rendered "new follow-up" trigger, or null for a reader. */
  newButton?: ReactNode;
}) {
  const t = useTranslations('followUps');
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Colour says what kind of pile it is, the number says how big. Red only for
  // something that has actually gone past its day — a board that is red because
  // six things are due next week teaches everyone to ignore red.
  const tone =
    counts.overdue > 0
      ? 'bg-danger text-white'
      : counts.urgent > 0
        ? 'bg-warn text-white'
        : 'bg-white/25 text-white';

  const summary =
    counts.overdue > 0
      ? t('bellLate', { count: counts.overdue })
      : t('bellOpen', { count: counts.open });

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        className={cn(
          'on-brand-control relative flex items-center rounded-lg focus-visible:outline-white',
          compact ? 'justify-center p-2' : 'gap-2 px-2 py-1.5',
          placement === 'top' && !compact && 'w-full',
        )}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${t('title')} — ${summary}`}
        onClick={() => setOpen((value) => !value)}
      >
        <AlarmClock size={20} aria-hidden className="shrink-0" />

        {compact ? null : (
          <span className="min-w-0 flex-1 truncate text-left text-[0.92rem] font-semibold text-white">
            {t('title')}
          </span>
        )}

        {/* Nothing at all when the board is clear. An empty badge is a shape the
            eye still checks; no badge is the only honest way to say "none". */}
        {counts.open > 0 ? (
          <span
            aria-hidden
            className={cn(
              'grid min-w-5 shrink-0 place-items-center rounded-full px-1.5 text-[0.75rem] font-bold tabular-nums',
              tone,
              // Pinched, the badge has no room beside the icon, so it sits on it.
              compact && 'absolute top-0.5 right-0.5',
            )}
          >
            {counts.open > 99 ? '99+' : counts.open}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={t('title')}
          className={cn(
            'absolute z-40 w-[min(92vw,26rem)] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface text-ink shadow-pop',
            // Same reasoning as the user menu: from the rail foot it opens
            // upward and to the right, so a pinched rail does not have to be
            // wide enough to hold its own popover.
            placement === 'top' ? 'bottom-full left-0 mb-2' : 'right-0 mt-2',
          )}
        >
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-[1.05rem] font-bold text-ink">{t('title')}</h2>
              <p
                className={cn(
                  'text-[0.88rem]',
                  counts.overdue > 0 ? 'font-semibold text-danger' : 'text-ink-soft',
                )}
              >
                {summary}
              </p>
            </div>
            {newButton}
          </header>

          {/* Long boards scroll inside the popover rather than off the screen. */}
          <div className="max-h-[min(70vh,32rem)] overflow-y-auto">{children}</div>
        </div>
      ) : null}
    </div>
  );
}
