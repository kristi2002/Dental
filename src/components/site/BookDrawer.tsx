'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { RequestForm } from '@/components/site/RequestForm';

/**
 * The callback form as a panel that slides in over the page.
 *
 * The brief for this was "trigger the form from a floating button, and slide it
 * into view so they don't lose their place", and the second half is the part
 * that matters: somebody four screens into the gallery who decides to get in
 * touch should not be thrown to the bottom of the document and have to find
 * their way back.
 *
 * **It enhances the anchors rather than replacing them.** Every "book a visit"
 * on the site is still an ordinary link pointing at the form in `VisitUs` — the
 * masthead's, the hero's, the concern panel's, the trip planner's, the floating
 * button's. This component adds one delegated listener that catches clicks on
 * any of them and opens the drawer instead. Turn JavaScript off and every one of
 * those links still reaches a working, server-rendered form; nothing here is
 * load-bearing.
 *
 * **The match is on the end of the href, not the whole of it.** While the
 * storefront was one document every such link was the bare fragment
 * `#request`. It is four pages now, and on three of them that fragment points
 * at nothing — so the links off the visit page are written `/visit#request`,
 * which a browser with no JavaScript follows to the form and which this still
 * recognises. `$=` is what covers both spellings, and the locale prefix
 * `next-intl` puts in front of the path is exactly why matching the whole
 * attribute was never going to work.
 *
 * That is also why the delegation is on the document rather than props threaded
 * through six components: the anchors are server-rendered in half a dozen
 * different files across four routes, and giving each an `onClick` would make
 * that many server components into client ones to buy nothing. It is mounted
 * once, in `(site)/layout.tsx`, so every page has it.
 *
 * **A real `<dialog>`, opened with `showModal()`.** Focus trapping, `Escape`,
 * the top layer, the backdrop and returning focus to the trigger are all
 * behaviour the element already has and that a hand-rolled panel would have to
 * reimplement — usually badly, and usually leaving a keyboard user tabbing
 * through the page behind it.
 *
 * **The form inside is a second instance**, not the same one moved. React would
 * have to portal the node out of the page and back, and the in-flow copy has to
 * keep existing for the no-JavaScript case anyway. `idPrefix` is what keeps the
 * two apart: duplicate field ids would mean clicking a label in the drawer
 * focused the field in the section behind it. They share the topic through
 * `TopicChoice`, so a concern picked at the top of the page is still filled in
 * here.
 */
export function BookDrawer() {
  const t = useTranslations('site');
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      // Let the browser have the ones a person means to handle itself: a new
      // tab, a new window, a download, a middle click. `defaultPrevented` is
      // still worth checking in the capture phase — another capture listener
      // may have claimed the click — it is simply no longer the thing that was
      // breaking this.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const link = (event.target as HTMLElement | null)?.closest?.('a[href$="#request"]');
      if (!link) return;

      // Nothing to intercept if the dialog never mounted, and nothing to do if
      // it is already open.
      const node = dialog.current;
      if (!node || node.open) return;

      event.preventDefault();
      node.showModal();
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return (
    <dialog
      ref={dialog}
      // Named, because `.drawer` is no longer unique: the phone navigation panel
      // is the same kind of thing and wears the same class for the same slide.
      // A test — or anything else — reaching for "the booking drawer" needs a
      // handle that means that and not "a panel".
      id="book-drawer"
      aria-label={t('form.title')}
      // `bg-transparent` and no padding: the panel inside is the surface, so the
      // dialog element itself is only a positioning box. Without this the UA's
      // own white background shows as a rectangle behind the rounded panel.
      className="drawer m-0 ml-auto h-full max-h-none w-full max-w-[34rem] bg-transparent p-0 backdrop:bg-navy/60 backdrop:backdrop-blur-sm"
    >
      <div className="site-display flex h-full flex-col bg-bone">
        <div className="flex items-center justify-between border-b border-bone-deep px-5 py-4 sm:px-6">
          <p className="text-[0.76rem] font-bold tracking-[0.14em] text-bone-ink-soft uppercase">
            {t('nav.book')}
          </p>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label={t('gallery.close')}
            className="inline-flex size-11 items-center justify-center rounded-full text-bone-ink-soft transition-colors hover:bg-gilt-soft hover:text-bone-ink"
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        {/* Scrolls on its own rather than letting the dialog grow: the form is
            taller than a phone, and a modal that scrolls the page behind it is
            the bug this whole component exists to avoid. */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          {/*
           * `anchor={false}` — the copy in `VisitUs` owns `id="request"`. Two
           * elements with that id would make the anchor ambiguous and, worse,
           * would have this drawer's own trigger links pointing into it.
           */}
          <RequestForm idPrefix="drawer" anchor={false} className="" />
        </div>
      </div>
    </dialog>
  );
}
