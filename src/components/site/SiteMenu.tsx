'use client';

import { ArrowRight, Menu, Phone, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { SITE_PAGES } from '@/components/site/site-pages';
import { Link, usePathname } from '@/i18n/navigation';
import type { SiteContact } from '@/lib/site';
import { cn } from '@/lib/utils';

/**
 * The four pages, on the screens the masthead has no room to print them on.
 *
 * The section links are `hidden lg:block` and always have been: below 1024px the
 * lockup, the language menu and the booking pill already use every pixel the bar
 * has. That was survivable while the four words were fragments — a phone reader
 * scrolled past all four sections whether they pressed anything or not — and it
 * stopped being survivable the moment they became routes. Three quarters of this
 * site would have been reachable on a phone only through the footer.
 *
 * So: one button, and a panel. The same `<dialog>` treatment as `BookDrawer`,
 * for the same reasons — `showModal()` brings the focus trap, the top layer, the
 * inert page behind it and Escape, which is four things a hand-rolled panel
 * gets to reimplement and usually gets at least one of wrong.
 *
 * **It carries the telephone number as well as the links.** The masthead's
 * utility row is `hidden sm:flex`, so on the narrowest screens the number is not
 * in the chrome at all; this is where a phone reader finds it, which makes the
 * panel worth opening even for somebody who is not going anywhere.
 *
 * The entrance is a stagger written in CSS from an `--i` on each row — the same
 * `.rise` the headline uses. Nothing here animates on a timer in JavaScript, and
 * the rows are in the HTML from the first render rather than being mounted when
 * the panel opens: a `<dialog>` that is closed is simply not painted, which is
 * the cheapest way there is to have a menu that costs nothing until it is asked
 * for.
 */
export function SiteMenu({ contact }: { contact: SiteContact }) {
  const t = useTranslations('site');
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  // A route change has to shut it. Without this, pressing a link inside the
  // panel navigates underneath a modal that stays open over the new page — the
  // single most common bug in a drawer-shaped navigation, and invisible in
  // development because a fast local navigation looks like nothing happened.
  useEffect(() => {
    dialog.current?.close();
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
        aria-label={t('pages.menu.open')}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-navy-ink transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-white lg:hidden"
      >
        <Menu size={21} aria-hidden />
      </button>

      <dialog
        ref={dialog}
        // See the note on `#book-drawer`: two panels now share `.drawer`, and
        // each needs a name of its own.
        id="site-menu"
        aria-label={t('nav.sections')}
        onClose={() => setOpen(false)}
        // The same geometry as the booking drawer: a full-height panel against
        // the right edge, the dialog element itself only a positioning box.
        className="drawer m-0 ml-auto h-full max-h-none w-full max-w-[24rem] bg-transparent p-0 backdrop:bg-navy/70 backdrop:backdrop-blur-sm"
      >
        <div className="site-display flex h-full flex-col bg-navy text-white">
          <div className="flex items-center justify-between border-b border-navy-line px-5 py-4">
            <p className="text-[0.74rem] font-bold tracking-[0.16em] text-navy-ink-soft uppercase">
              {t('nav.sections')}
            </p>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label={t('gallery.close')}
              className="inline-flex size-11 items-center justify-center rounded-full text-navy-ink transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-white"
            >
              <X size={20} aria-hidden />
            </button>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
            <ul>
              {SITE_PAGES.map((page, index) => {
                const current = pathname === page.href || pathname.startsWith(`${page.href}/`);

                return (
                  <li key={page.href} className="border-b border-navy-line/70 last:border-b-0">
                    <Link
                      href={page.href}
                      aria-current={current ? 'page' : undefined}
                      // Keyed to whether the panel has been opened at all, so
                      // the stagger replays on every open rather than once on
                      // mount. An element returning from `display: none`
                      // restarts its animations; this is only here to give the
                      // first open one to restart from.
                      className={cn(
                        'flex min-h-14 items-center justify-between gap-4 font-display text-[1.45rem] no-underline transition-colors',
                        open && 'rise',
                        current ? 'text-gilt' : 'text-white hover:text-gilt',
                      )}
                      style={{ '--i': `${index}` } as CSSProperties}
                    >
                      {t(`nav.${page.key}`)}
                      <ArrowRight size={18} aria-hidden className="shrink-0 text-gilt" />
                    </Link>
                  </li>
                );
              })}
            </ul>

            <Link
              href="/visit#request"
              className="mt-8 flex min-h-13 items-center justify-center gap-2.5 rounded-full bg-gilt px-6 text-[1rem] font-bold text-navy no-underline focus-visible:outline-gilt-soft"
            >
              {t('nav.book')}
              <ArrowRight size={17} aria-hidden />
            </Link>

            {contact.telHref ? (
              <a
                href={contact.telHref}
                className="mt-3 flex min-h-13 items-center justify-center gap-2.5 rounded-full border border-navy-line px-6 text-[0.98rem] font-semibold text-white no-underline transition-colors hover:bg-white/10 focus-visible:outline-white"
              >
                <Phone size={16} aria-hidden className="text-gilt" />
                {contact.phone}
              </a>
            ) : null}
          </nav>
        </div>
      </dialog>
    </>
  );
}
