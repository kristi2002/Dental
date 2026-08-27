'use client';

import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SitePhoto } from '@/components/site/photos';

/**
 * One photograph, full size, over the page.
 *
 * A real `<dialog>` opened with `showModal()`, which is what buys the whole
 * behaviour for free and correctly: the top layer, a focus trap, inert content
 * behind it, and Escape. Every hand-rolled lightbox reimplements those four
 * things and gets at least one wrong — usually the focus trap, and usually only
 * for keyboard users, who are exactly the people it was supposed to help.
 *
 * Arrow keys move between images, because in a gallery they are what everybody
 * reaches for.
 *
 * It lived inside `Gallery` while the carousel on the front page was the only
 * thing that opened one. The gallery page shows the same nine photographs as a
 * wall rather than a reel and needs exactly this behaviour, and a second
 * implementation of a focus-trapping modal is the last thing any codebase needs
 * two of — so it moved here and both call it. The `photos` array is a parameter
 * for that reason and not because anything else is expected to pass a different
 * one: the wall filters the set down, so the arrows have to step through what
 * the reader is actually looking at rather than through all nine.
 */
export function Lightbox({
  photos,
  index,
  onClose,
}: {
  /** What the arrows step through — the visible set, not necessarily all of them. */
  photos: readonly (SitePhoto & { key: string })[];
  index: number;
  onClose: () => void;
}) {
  const t = useTranslations('site');
  const ref = useRef<HTMLDialogElement>(null);
  const [current, setCurrent] = useState(index);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();

    // The native close — Escape, or the backdrop handler below — has to tell
    // React, or reopening the same image does nothing because state still says
    // it is open.
    const onCloseEvent = () => onClose();
    dialog.addEventListener('close', onCloseEvent);
    return () => dialog.removeEventListener('close', onCloseEvent);
  }, [onClose]);

  const step = useCallback(
    (by: number) => {
      setCurrent((value) => (value + by + photos.length) % photos.length);
    },
    [photos.length],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'ArrowLeft') step(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [step]);

  const photo = photos[current];
  if (!photo) return null;

  // The backdrop is part of the dialog's own box, so a click landing on the
  // element itself rather than on anything inside it is a backdrop click — the
  // standard way to close one, with no second overlay element needed.
  //
  // The two rules disabled below want a keyboard handler beside that click, and
  // they are right about a `<div>`. A `<dialog>` opened with `showModal()`
  // already closes on Escape natively, and there is a labelled close button
  // inside it as well — so the keyboard path exists twice over, and this handler
  // is a pointer convenience rather than the only way out. Satisfying the linter
  // here would mean duplicating behaviour the platform already provides.
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close();
      }}
      className="m-auto max-h-[92vh] w-[min(92vw,64rem)] bg-transparent p-0 backdrop:bg-navy/85 backdrop:backdrop-blur-sm"
    >
      <div className="relative">
        {/* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */}
        <img
          src={photo.src}
          width={photo.width}
          height={photo.height}
          alt={t(`gallery.alt.${photo.key}`)}
          className="max-h-[80vh] w-full rounded-xl object-contain"
        />

        <div className="mt-4 flex items-center justify-between gap-4">
          <p className="text-[0.95rem] text-white">{t(`gallery.alt.${photo.key}`)}</p>
          <p className="shrink-0 text-[0.9rem] text-navy-ink-soft tabular-nums">
            {current + 1} / {photos.length}
          </p>
        </div>

        <button
          type="button"
          onClick={() => ref.current?.close()}
          aria-label={t('gallery.close')}
          className="absolute -top-3 -right-3 grid size-11 place-items-center rounded-full bg-white text-bone-ink shadow-pop"
        >
          <X size={20} aria-hidden />
        </button>

        {/* Only where there is somewhere to go. Filtering the wall to a group of
            one leaves a pair of arrows that step from a photograph back to
            itself, which reads as broken rather than as exhausted. */}
        {photos.length > 1 ? (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label={t('gallery.previous')}
              className="absolute top-1/2 -left-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-bone-ink shadow-pop sm:-left-5"
            >
              <ArrowLeft size={20} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label={t('gallery.next')}
              className="absolute top-1/2 -right-3 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-bone-ink shadow-pop sm:-right-5"
            >
              <ArrowRight size={20} aria-hidden />
            </button>
          </>
        ) : null}
      </div>
    </dialog>
  );
}
