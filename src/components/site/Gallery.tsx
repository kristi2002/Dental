'use client';

import { ArrowLeft, ArrowRight, Expand } from 'lucide-react';
import useEmblaCarousel from 'embla-carousel-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { Lightbox } from '@/components/site/Lightbox';
import { PhotoMark } from '@/components/site/PhotoMark';
import { GALLERY } from '@/components/site/photos';

/**
 * The practice, as a room you can look around.
 *
 * Embla rather than a hand-rolled scroller, and rather than one of the heavier
 * carousels: it is about 5KB, it has no opinion about how anything looks, and —
 * the part that actually matters — it is built on native scroll-snap with
 * pointer events, so it drags with a mouse, swipes with a thumb, and honours the
 * platform's own momentum instead of reimplementing it badly. A carousel that
 * feels wrong under a thumb is worse than a static grid.
 *
 * `dragFree: false` snaps to a slide; `loop` means the arrows never dead-end,
 * which is the failure that makes people stop pressing them.
 *
 * Every slide carries the practice's mark in the corner — see the note on the
 * watermark below.
 */
export function Gallery() {
  const t = useTranslations('site');
  const [emblaRef, embla] = useEmblaCarousel({ loop: true, align: 'start', dragFree: false });
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState<number | null>(null);

  const scrollPrev = useCallback(() => embla?.scrollPrev(), [embla]);
  const scrollNext = useCallback(() => embla?.scrollNext(), [embla]);

  useEffect(() => {
    if (!embla) return;
    const onSelect = () => setSelected(embla.selectedScrollSnap());
    onSelect();
    embla.on('select', onSelect);
    return () => {
      embla.off('select', onSelect);
    };
  }, [embla]);

  return (
    <section id="gallery" className="scroll-mt-20 bg-bone-soft py-20 sm:py-28">
      <div className="mx-auto mb-10 w-full max-w-6xl px-5 sm:px-8">
        <div className="mt-5 flex flex-wrap items-end justify-between gap-6">
          <h2 className="type-section max-w-[16ch] text-bone-ink">
            {t('gallery.title')}
          </h2>

          {/* Beside the heading rather than under the track: on a desktop the
              arrows are the affordance that says this moves at all, and under a
              1200px-wide carousel nobody sees them. */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={scrollPrev}
              aria-label={t('gallery.previous')}
              className="btn btn-secondary size-12 rounded-full p-0"
            >
              <ArrowLeft size={20} aria-hidden />
            </button>
            <button
              type="button"
              onClick={scrollNext}
              aria-label={t('gallery.next')}
              className="btn btn-secondary size-12 rounded-full p-0"
            >
              <ArrowRight size={20} aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {/* Deliberately edge-to-edge and not inside the page measure: a carousel
          whose slides run off the side of the screen says "there is more this
          way" without a single arrow being pressed. The left inset lines the
          first slide up with the heading above it. */}
      <div className="overflow-hidden pl-5 sm:pl-8 lg:pl-[max(2rem,calc((100vw-72rem)/2))]">
        <div ref={emblaRef} className="overflow-hidden">
          <ul className="flex touch-pan-y gap-4">
            {GALLERY.map((photo, index) => (
              <li
                key={photo.key}
                className="min-w-0 shrink-0 grow-0 basis-[82%] sm:basis-[48%] lg:basis-[38%]"
              >
                <button
                  type="button"
                  onClick={() => setOpen(index)}
                  aria-label={t('gallery.openImage', { name: t(`gallery.alt.${photo.key}`) })}
                  className="group relative block w-full overflow-hidden rounded-2xl bg-navy"
                >
                  {/* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */}
                  <img
                    src={photo.src}
                    width={photo.width}
                    height={photo.height}
                    alt={t(`gallery.alt.${photo.key}`)}
                    loading="lazy"
                    decoding="async"
                    className="aspect-3/2 w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  />

                  <PhotoMark />

                  <span
                    aria-hidden
                    className="absolute inset-0 grid place-items-center bg-navy/35 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                  >
                    <Expand size={26} className="text-white" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Where you are in the reel. Dots rather than a count, and they are
          buttons — a progress indicator you cannot press is a tease. */}
      <div className="mx-auto mt-8 flex w-full max-w-6xl justify-center gap-2 px-5 sm:px-8">
        {GALLERY.map((photo, index) => (
          <button
            key={photo.key}
            type="button"
            onClick={() => embla?.scrollTo(index)}
            aria-label={t('gallery.goTo', { number: index + 1 })}
            aria-current={index === selected}
            className={
              index === selected
                ? 'h-2 w-7 rounded-full bg-gilt-deep transition-all'
                : 'h-2 w-2 rounded-full bg-bone-deep transition-all hover:bg-bone-ink-faint'
            }
          />
        ))}
      </div>

      {open !== null ? (
        <Lightbox photos={GALLERY} index={open} onClose={() => setOpen(null)} />
      ) : null}
    </section>
  );
}
