'use client';

import { ArrowRight, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { FocusEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { SITE_PAGES } from '@/components/site/site-pages';
import { Link, usePathname } from '@/i18n/navigation';
import { TREATMENT_KEYS, treatmentPath } from '@/lib/site-content';
import { cn } from '@/lib/utils';

/**
 * The four section links in the masthead, and the panel of eleven under the
 * first of them.
 *
 * This is a client component for one reason and it used to be a small one: the
 * current section is lit, and knowing which section is current means reading the
 * path. `SITE_PAGES` lives in a module of its own rather than here so that the
 * footer — a server component — can read the same array. See the note in that
 * file: a constant exported from a `'use client'` module reaches the server as a
 * reference rather than as a value.
 *
 * **The panel is the reason this file grew.** Every treatment now has a page of
 * its own, and until this existed the only route to any of them was the index
 * page — a reader who knew they wanted an implant had to open "Treatments",
 * scroll a list of eleven, and press the right heading. Eleven pages that can
 * only be reached through a twelfth is a site map, not navigation.
 *
 * **The trigger is still a link to `/treatments`, not a button.** The obvious
 * build makes "Treatments" a disclosure button and puts the index page at the
 * bottom of the panel, which quietly removes a destination that has been in this
 * bar since the site had one — and on a bar where every other item navigates,
 * the one that does not is the one people press twice. So: the link keeps
 * working, the panel opens beside it on hover and on focus, and the index is
 * *also* offered at the foot of the panel for anybody who opened it first.
 *
 * **Focus opens it, which is what makes it usable without a mouse.** A keyboard
 * reader tabs to "Treatments", the panel opens, and the next eleven tab stops
 * are the eleven treatments; tabbing past the last of them closes it again.
 * `aria-expanded` on the link says so out loud. The alternative — hover only —
 * is eleven pages that exist for mouse users.
 *
 * **Nothing here traps focus and nothing here is a menu.** `role="menu"` and its
 * arrow-key model are for application menus of commands; this is a list of links
 * to pages, and the pattern for that is a disclosure over a plain list, which is
 * what a screen reader will describe correctly with no help from us.
 */

/**
 * Whether `pathname` is inside `href` — the locale prefix already stripped by
 * `usePathname`, which is the whole reason this can be a string comparison.
 *
 * `startsWith` rather than equality so `/treatments/implants` still lights its
 * section, and the boundary check is what stops `/visitors` matching `/visit`.
 */
function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNav() {
  const t = useTranslations('site');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  /**
   * A beat before closing on the way out.
   *
   * The panel sits directly under the link with no gap, so a pointer moving from
   * one to the other never technically leaves the group — but a pointer moving
   * *diagonally* toward the third column clips the corner and does. Without the
   * delay that reads as the panel snapping shut under the cursor for no reason.
   */
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Set by Escape, and the only thing that stops it undoing itself.
   *
   * Escape closes the panel and puts focus back on the trigger — and the trigger
   * is inside the group whose `onFocus` opens the panel, so without this the
   * sequence is: close, focus, reopen. It looked exactly like Escape doing
   * nothing, and the underlying state was worse than that: the panel was open
   * while the reader believed they had dismissed it, so the eleven links were
   * back in the tab order they had just been taken out of.
   *
   * Cleared as soon as the reader does anything that means "again" — moving
   * focus out of the group, or taking the pointer off it. It is a latch on one
   * specific self-inflicted reopen, not a mode.
   */
  const dismissed = useRef(false);

  function show() {
    if (dismissed.current) return;
    if (closing.current) clearTimeout(closing.current);
    setOpen(true);
  }

  function hide(delay = 140) {
    dismissed.current = false;
    if (closing.current) clearTimeout(closing.current);
    closing.current = setTimeout(() => setOpen(false), delay);
  }

  // A link inside the panel navigates without unmounting this component, so
  // nothing else would ever close it — the reader would arrive on the implants
  // page with the panel still hanging open over it.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => () => {
    if (closing.current) clearTimeout(closing.current);
  }, []);

  /** Tabbing out of the group closes it; moving between its own links does not. */
  function onBlur(event: FocusEvent<HTMLLIElement>) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    dismissed.current = false;
    setOpen(false);
  }

  const trigger = useRef<HTMLAnchorElement>(null);
  const group = useRef<HTMLLIElement>(null);

  /**
   * Escape closes it, and the listener is on the document rather than on the
   * group.
   *
   * A React `onKeyDown` on the `<li>` only ever fires when focus is already
   * inside it — which is true when the panel was opened by tabbing and false
   * every time it was opened by hovering, because hovering moves no focus at
   * all. The first build had exactly that bug: Escape worked for keyboard users
   * and did nothing whatever for the mouse users who are most of the people who
   * will open this.
   *
   * Focus is only pulled back to the trigger when it was inside the group to
   * begin with. Yanking it there from wherever the reader actually was, because
   * they dismissed a panel they opened by accident with the cursor, is worse
   * than leaving it alone.
   */
  useEffect(() => {
    if (!open) return;

    function onEscape(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      if (group.current?.contains(document.activeElement)) {
        dismissed.current = true;
        trigger.current?.focus();
      }
    }

    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [open]);

  return (
    // `justify-between`, so the four links spread the whole width between the
    // plaque and the booking block rather than bunching against one end. A
    // navigation that fills its row is furniture; four words huddled in a corner
    // are a widget.
    //
    // `gap-3` is a floor under that spreading rather than a gap it usually
    // uses: `justify-between` distributes whatever is left over, and at the
    // `lg` breakpoint — where the bar first appears and has the least room —
    // what is left over is nearly nothing. Without a minimum the four labels
    // butt against each other and read as one long word.
    <ul className="flex items-center justify-between gap-3">
      {SITE_PAGES.map((page) => {
        const current = isCurrent(pathname, page.href);
        const hasPanel = page.href === '/treatments';

        return (
          /*
           * The pointer listeners are on the `<li>` and the linter is right to
           * ask why, so: the hover target is not the link, it is the link *and*
           * the panel under it together. Put `onPointerLeave` on the anchor and
           * the panel closes the instant the cursor starts moving toward the
           * thing it just opened — which is the single most common way a
           * navigation panel like this is got wrong.
           *
           * It is not a control and is not pretending to be one. The `<li>`
           * takes no keyboard handler, holds no `role` and is not focusable;
           * every actual interaction is on the anchor inside it, which is a real
           * link with `aria-expanded` and works with the pointer, the keyboard
           * and with no JavaScript at all. The rule exists to catch a `<div>`
           * impersonating a button, and this is the case it cannot tell apart
           * from that one.
           */
          // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
          <li
            key={page.href}
            ref={hasPanel ? group : undefined}
            // `relative` only on the one that has something to hang off it. The
            // panel is positioned against this item's left edge, which is what
            // keeps it under the word it belongs to rather than centred on a bar
            // it has nothing to do with.
            className={cn(hasPanel && 'relative')}
            onPointerEnter={hasPanel ? show : undefined}
            onPointerLeave={hasPanel ? () => hide() : undefined}
            onFocus={hasPanel ? show : undefined}
            onBlur={hasPanel ? onBlur : undefined}
          >
            <Link
              ref={hasPanel ? trigger : undefined}
              href={page.href}
              aria-current={current ? 'page' : undefined}
              aria-expanded={hasPanel ? open : undefined}
              aria-controls={hasPanel ? 'nav-treatments' : undefined}
              className={cn(
                'relative inline-flex min-h-11 items-center gap-1.5 px-1 text-micro font-semibold tracking-[0.16em] whitespace-nowrap uppercase no-underline transition-colors after:absolute after:inset-x-1 after:bottom-2.5 after:h-px after:origin-left after:bg-gilt after:transition-transform hover:text-white focus-visible:outline-white motion-reduce:after:transition-none',
                current
                  ? 'text-white after:scale-x-100'
                  : 'text-navy-ink after:scale-x-0 hover:after:scale-x-100',
              )}
            >
              {t(`nav.${page.key}`)}

              {hasPanel ? (
                <ChevronDown
                  size={13}
                  aria-hidden
                  className={cn(
                    'shrink-0 text-gilt transition-transform duration-200 motion-reduce:transition-none',
                    open && 'rotate-180',
                  )}
                />
              ) : null}
            </Link>

            {hasPanel ? (
              <div
                id="nav-treatments"
                // Rendered always and hidden with `invisible`, not unmounted:
                // an element that appears for the first time on hover has its
                // eleven links laid out and its fonts resolved at exactly the
                // moment the reader is looking at the space they should already
                // occupy. `invisible` also takes it out of the tab order, which
                // is what keeps eleven closed links from being eleven tab stops.
                className={cn(
                  'absolute top-full left-0 pt-3 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none',
                  open
                    ? 'visible translate-y-0 opacity-100'
                    : 'invisible -translate-y-1 opacity-0',
                )}
              >
                <div className="w-[min(44rem,calc(100vw-4rem))] overflow-hidden rounded-2xl border border-navy-line bg-navy/95 shadow-pop backdrop-blur-md">
                  {/*
                   * Four rows, filling down and then across, which is what makes
                   * the columns read in the clinical order the rest of the site
                   * is in. A plain three-column grid flows across the rows
                   * instead, so the first column would be "check-up, crowns,
                   * oral surgery" — three treatments with nothing to do with one
                   * another, in an order no reader can see the logic of.
                   */}
                  <ul className="grid grid-flow-col grid-rows-4 gap-x-4 p-3">
                    {TREATMENT_KEYS.map((key) => {
                      const href = treatmentPath(key);
                      const here = pathname === href;

                      return (
                        <li key={key}>
                          <Link
                            href={href}
                            aria-current={here ? 'page' : undefined}
                            tabIndex={open ? undefined : -1}
                            className={cn(
                              'flex min-h-10 items-center rounded-lg px-3 text-meta font-semibold no-underline transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-white',
                              here ? 'text-gilt' : 'text-navy-ink',
                            )}
                          >
                            {t(`treatments.${key}.title`)}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>

                  {/* The index page, offered again at the foot for the reader
                      who opened the panel rather than pressing the word. */}
                  <Link
                    href="/treatments"
                    tabIndex={open ? undefined : -1}
                    className="group flex min-h-12 items-center justify-between gap-4 border-t border-navy-line bg-white/[0.03] px-6 text-caption font-semibold tracking-[0.14em] text-gilt uppercase no-underline transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-white"
                  >
                    {t('pages.treatment.backToAll')}
                    <ArrowRight
                      size={15}
                      aria-hidden
                      className="shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                    />
                  </Link>
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
