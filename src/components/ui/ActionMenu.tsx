'use client';

import { EllipsisVertical } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/**
 * The overflow of a row: the verbs that belong to a record but are not what the
 * front desk presses all day.
 *
 * An appointment has seven things you can do to it, and laying all seven out as
 * buttons made every card look equally urgent — the two that get pressed every
 * hour sat in a hedge of five that get pressed weekly. So the everyday ones stay
 * out on the card and the rest come in here, behind one small button.
 *
 * The items are passed in from the server: links, one-button forms and dialog
 * triggers, styled `menu-item` so they read as rows rather than as a stack of
 * pills. All this does is open and shut around them.
 */
export function ActionMenu({
  label,
  children,
  align = 'end',
  className,
  triggerClassName = 'btn btn-secondary btn-sm',
  trigger,
  floating = false,
}: {
  /** Names the button and the menu. The only text on either, unless `trigger` adds some. */
  label: string;
  children: ReactNode;
  /** Which edge of the button the panel hangs from. */
  align?: 'start' | 'end';
  className?: string;
  triggerClassName?: string;
  /**
   * What the button shows. Defaults to the three dots, which is what an overflow
   * menu is — but a menu is also the right shape for a value that has several
   * things you might do *with* it: a phone number you could ring, message or
   * copy. Those want the value itself as the face of the button rather than a
   * glyph beside it that the reader has to connect back to the number.
   */
  trigger?: ReactNode;
  /**
   * For a row in a table rather than on a card. The works register scrolls in a
   * box of its own and pins two of its edges, and a panel that stays inside it
   * loses twice over: clipped by the box the moment it is taller than the room
   * left below the row, and painted over by the sticky total even when it is
   * not. So it is measured, pinned to the viewport, and moved out to the body —
   * at the cost of having to be re-measured whenever the table moves under it.
   */
  floating?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState<{ top: number; left: number } | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // The button and the panel, which are two separate trees once the panel is
  // floating: everything below asks "is this ours?" rather than "is this inside
  // the wrapper?", because from the document's point of view a floated panel is
  // a child of `<body>` and nothing to do with the row it belongs to.
  const parts = () => [wrapper.current, panel.current].filter(Boolean) as HTMLElement[];

  useEffect(() => {
    if (!open) return;

    function ours(node: Node) {
      return parts().some((part) => part.contains(node));
    }

    function dialogOpen() {
      return parts().some((part) => part.querySelector('dialog[open]'));
    }

    function onPointerDown(event: MouseEvent) {
      if (!ours(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      // A dialog opened from in here is on top and owns Escape first. Closing
      // the menu would unmount the dialog mid-dismissal, which loses whatever
      // was typed in it without ever showing the confirmation.
      if (dialogOpen()) return;
      setOpen(false);
    }

    // Only the links close the menu behind them: they are leaving, for a new tab
    // or the mail client, and there is nothing to come back to. The buttons are
    // left alone on purpose — a dialog trigger has to stay mounted to keep its
    // dialog, a submitting form has to stay mounted to finish, and a `confirm()`
    // that was waved off should find the menu where it was rather than have to
    // be opened a second time.
    function onClick(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (ours(target) && target.closest('a')) setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('click', onClick);
    };
  }, [open]);

  // Once the dialog an item opened has gone, the menu waiting behind it has
  // nothing left to say — so it goes too, and the row is left as it was found.
  //
  // Watched rather than listened for: a dialog's `close` event neither bubbles
  // nor reaches a listener on an ancestor, and the one component that could
  // hear it is the dialog itself, which is handed in from the server and cannot
  // be given a callback. The `open` attribute is the same fact, and it is one
  // anybody can read.
  useEffect(() => {
    if (!open) return;

    const roots = parts();
    if (roots.length === 0) return;

    let opened = false;
    const observer = new MutationObserver(() => {
      if (roots.some((root) => root.querySelector('dialog[open]'))) opened = true;
      else if (opened) setOpen(false);
    });

    for (const root of roots) {
      observer.observe(root, {
        subtree: true,
        childList: true,
        attributeFilter: ['open'],
      });
    }
    return () => observer.disconnect();
  }, [open]);

  // Where a floating panel goes. Below the button unless the bottom of the
  // window is nearer than the panel is tall, in which case it goes above —
  // dropping off the screen is the one thing worse than being clipped. Measured
  // again on any scroll, the table's own included, so the panel travels with
  // the row it belongs to rather than hanging over a different one.
  useEffect(() => {
    if (!floating) return;
    if (!open) {
      setSpot(null);
      return;
    }

    function place() {
      const face = button.current;
      const box = panel.current;
      if (!face || !box) return;

      const at = face.getBoundingClientRect();
      const height = box.offsetHeight;
      const width = box.offsetWidth;
      const room = window.innerHeight - at.bottom;
      const above = room < height + 16 && at.top > height + 16;
      const left = align === 'end' ? at.right - width : at.left;

      setSpot({
        top: above ? at.top - 8 - height : at.bottom + 8,
        left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
      });
    }

    place();
    // Capturing, because the scroll that matters is the register's own box and
    // a scroll event does not bubble out of it.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [floating, open, align]);

  const menu = open ? (
    <div
      ref={panel}
      role="menu"
      aria-label={label}
      // Its own, rather than inherited from the cell it used to sit in: once the
      // panel is on the body it is outside every `data-print-hide` on the page,
      // and a menu left open is not part of the register.
      data-print-hide
      // A floating panel is laid out first and placed a tick later, so it waits
      // out of sight rather than showing up in the corner and jumping. It keeps
      // its box either way: the measurement needs one.
      style={
        floating
          ? {
              top: spot?.top ?? 0,
              left: spot?.left ?? 0,
              visibility: spot ? undefined : 'hidden',
            }
          : undefined
      }
      className={cn(
        // 14rem, not more: on a phone the strip has wrapped and the button it
        // hangs from is not at the right edge of anything, so a wider panel puts
        // its own left border off the side of the screen.
        'z-40 w-56 overflow-hidden rounded-[var(--radius-card)]',
        'border border-line bg-surface py-1 text-left shadow-pop',
        floating ? 'fixed' : 'absolute top-full mt-2',
        floating ? null : align === 'end' ? 'right-0' : 'left-0',
      )}
    >
      {children}
    </div>
  ) : null;

  return (
    <div ref={wrapper} className={cn('relative', className)}>
      <button
        ref={button}
        type="button"
        className={triggerClassName}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        title={label}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger ?? <EllipsisVertical size={18} aria-hidden />}
      </button>

      {/* Out of the table and onto the body. Not for the position — `fixed`
          already handles that — but for the paint order: the cell this menu
          hangs in is a pinned column, and a sticky cell is its own stacking
          context, so `z-40` inside it is only ever forty places above the rest
          of that one cell. The register's total is a sticky footer with a
          z-index of its own, and it was painting straight over the menu.
          Nothing inside the table can win that argument; leaving the table
          settles it. */}
      {floating ? menu && createPortal(menu, document.body) : menu}
    </div>
  );
}
