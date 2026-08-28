'use client';

import { ArrowLeft, ArrowRight, Expand } from 'lucide-react';
import useEmblaCarousel from 'embla-carousel-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { Lightbox } from '@/components/site/Lightbox';
import { PhotoMark } from '@/components/site/PhotoMark';
import { Reveal } from '@/components/site/Reveal';
import { SectionEyebrow } from '@/components/site/SectionEyebrow';
import { GALLERY } from '@/components/site/photos';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

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
 *
 * **This reel is a teaser and now says so.** It ran for a while as a heading,
 * nine photographs and a row of dots, which left it the one section on the page
 * that gave a reader nothing to read and nowhere to go: the practice page holds
 * the same nine in a sortable wall, and nothing on the front page pointed at it.
 * A lede and a link to the whole set is most of what was wrong here, and neither
 * is decoration — see `PhotoWall` for why a reel and a wall are answering two
 * different questions.
 */
export function Gallery() {
  const t = useTranslations('site');
  /**
   * `inViewThreshold: 0.9` is doing work for the captions below rather than for
   * the scrolling: it is what makes `slidesInView` mean "you can read all of
   * this one" instead of "a sliver of it is on screen". The default counts a
   * slide the moment one pixel of it clears the edge, which is the wrong
   * question to ask before printing a sentence across the bottom of it.
   */
  const [emblaRef, embla] = useEmblaCarousel({
    loop: true,
    align: 'start',
    dragFree: false,
    inViewThreshold: 0.9,
  });
  const [selected, setSelected] = useState(0);
  const [inView, setInView] = useState<number[]>([]);
  const [open, setOpen] = useState<number | null>(null);

  const scrollPrev = useCallback(() => embla?.scrollPrev(), [embla]);
  const scrollNext = useCallback(() => embla?.scrollNext(), [embla]);

  useEffect(() => {
    if (!embla) return;
    const onSelect = () => setSelected(embla.selectedScrollSnap());
    const onInView = () => setInView(embla.slidesInView());
    onSelect();
    onInView();
    embla.on('select', onSelect).on('slidesInView', onInView).on('reInit', onInView);
    return () => {
      embla.off('select', onSelect).off('slidesInView', onInView).off('reInit', onInView);
    };
  }, [embla]);

  return (
    <section id="gallery" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto mb-12 w-full max-w-6xl px-5 sm:px-8">
        <Reveal>
          <SectionEyebrow className="text-gilt-deep">{t('gallery.eyebrow')}</SectionEyebrow>

          {/* The arrows sit on the heading's line and not on the lede's.
              `items-end` against a two- or three-line paragraph left them
              hanging in the middle of an empty half of the row; against the
              heading they land on its baseline, which is the alignment the
              eyebrow was pulled out of the row to make possible. */}
          <div className="mt-5 flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
            <h2 className="type-section max-w-[16ch] text-bone-ink">{t('gallery.title')}</h2>

            {/* Beside the heading rather than under the track: on a desktop the
                arrows are the affordance that says this moves at all, and under
                a 1200px-wide carousel nobody sees them.

                And desktop is the whole of what they are for. On a telephone
                the reel is swiped, the steps below it are pressable, and two
                48px circles wrapped onto a line of their own between the
                heading and the lede — a control nobody needs, inserted into the
                one place it breaks the reading order. */}
            <div className="hidden gap-2 sm:flex">
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

          <p className="mt-5 max-w-[56ch] text-[1.05rem] text-bone-ink-soft">
            {t('gallery.lede')}
          </p>
        </Reveal>
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
                  /* The focus ring is drawn *inside* the slide. The page's
                     global one sits 2px outside the element, and 2px outside a
                     slide is inside the carousel's viewport clip — so a
                     keyboard arriving at the first or the last visible
                     photograph got three of its four edges and the one at the
                     bleeding edge got almost none. Negative offset puts the
                     whole ring on the photograph, where nothing can crop it. */
                  className="group relative block w-full cursor-pointer overflow-hidden rounded-2xl bg-navy focus-visible:outline-offset-[-4px]"
                >
                  {/* `alt=""` and not a repeat of the description, because the
                      button around it already carries the whole sentence in its
                      label and the caption below prints it in ink. A screen
                      reader hearing "a treatment room with an orange chair"
                      three times for one photograph is the cost of describing
                      the same image in three places. */}
                  {/* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */}
                  <img
                    src={photo.src}
                    width={photo.width}
                    height={photo.height}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="aspect-3/2 w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  />

                  {/* The caption is on the photograph rather than appearing
                      under a cursor. Half the people who see this page are
                      holding it, and a hover-only caption is a caption they
                      never get — which left the reel a run of unlabelled
                      pictures on exactly the devices it matters most on.

                      It fades with the slide instead, because this track runs
                      off the right of the screen on purpose: a caption printed
                      on the half-slide at the edge is a sentence chopped
                      mid-word, and that reads as a bug rather than as a bleed.
                      So the text belongs to whichever slides are all the way
                      in — see `inViewThreshold` above.

                      The gradient is what makes white type legible over a
                      bright treatment room and a dark one both, and it has to
                      be taller and weaker than it looks like it should be: a
                      short strong one ends while it is still dark and leaves a
                      visible seam across the middle of the photograph. */}
                  <span
                    aria-hidden
                    className={cn(
                      'absolute inset-x-0 bottom-0 flex h-3/5 items-end bg-gradient-to-t from-navy/78 via-navy/16 via-42% to-transparent p-4 pr-16 text-left text-[0.84rem] leading-snug font-medium text-white transition-opacity duration-500 sm:p-5 sm:pr-18 motion-reduce:transition-none',
                      inView.includes(index) ? 'opacity-100' : 'opacity-0',
                    )}
                  >
                    {t(`gallery.alt.${photo.key}`)}
                  </span>

                  <PhotoMark />

                  {/* What "this opens" looks like. It was a navy wash over the
                      whole photograph with a glyph in the middle of it, which
                      hid the thing the reader was pointing at in order to tell
                      them they could look at it more closely. */}
                  <span
                    aria-hidden
                    className="reveal-on-hover absolute top-3.5 right-3.5 grid size-10 place-items-center rounded-full bg-navy/50 text-white opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
                  >
                    <Expand size={18} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Where you are in the reel, and where the rest of them live.
       *
       * The steps are left-aligned rather than centred, because the track they
       * describe is left-aligned too — it starts under the heading and runs off
       * the right edge of the screen. Nine dots centred in the page measure sat
       * under nothing in particular and read as the end of the section rather
       * than as part of the carousel.
       *
       * They are still buttons, and still one per photograph: a progress
       * indicator you cannot press is a tease. Drawn as a rule rather than a
       * dot only because a rule can widen to show which one is current, which
       * is a stronger signal at this size than a colour change alone. */}
      <div className="mx-auto mt-8 flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-10 gap-y-1 px-5 sm:px-8">
        {/* Full width on a phone so the nine targets below can divide it
            between them; content-width and tightly spaced from `sm`, which is
            the composition this row was drawn as. */}
        <div className="flex w-full items-center sm:w-auto sm:gap-1.5">
          {GALLERY.map((photo, index) => (
            <button
              key={photo.key}
              type="button"
              onClick={() => embla?.scrollTo(index)}
              aria-label={t('gallery.goTo', { number: index + 1 })}
              aria-current={index === selected}
              // The rule this draws is 3px tall and 20px wide, and on a phone
              // that was also the whole target: 21×29, which a thumb misses
              // and which fails the 24×24 minimum outright with its
              // neighbours six pixels away.
              //
              // So below `sm` the nine of them share the row — `flex-1` gives
              // each about 39px on a 390px screen and 31 on a 320px one, all
              // of them 44 tall — and the mark inside is still the rule as
              // drawn, centred in a box you can actually hit. A fixed 44px
              // square each would have been the obvious fix and is the wrong
              // one: nine of them is 396px, which is wider than the screen.
              //
              // From `sm` the original geometry is restored exactly: content
              // width, `py-3`, and the 6px gap the container puts back.
              className="group/step flex min-h-11 flex-1 cursor-pointer items-center justify-center sm:min-h-0 sm:flex-none sm:py-3"
            >
              <span
                aria-hidden
                className={cn(
                  'block h-[3px] rounded-full transition-all duration-300 motion-reduce:transition-none',
                  index === selected
                    ? 'w-10 bg-gilt-deep'
                    : 'w-5 bg-bone-ink-faint/30 group-hover/step:bg-bone-ink-faint/60',
                )}
              />
            </button>
          ))}
        </div>

        {/* The wall, which used to be a page of its own at `/gallery` and is now
            a section of the practice page — hence the fragment. Without it this
            link lands the reader at the top of a page whose photographs are four
            screens down, which is the commonest way a "see all" goes wrong. */}
        <Link
          href="/practice#wall"
          className="group/all inline-flex min-h-11 items-center gap-2 text-[0.98rem] font-semibold text-bone-ink no-underline underline-offset-4 transition-colors hover:text-gilt-deep hover:underline"
        >
          {t('gallery.all', { count: GALLERY.length })}
          <ArrowRight
            size={17}
            aria-hidden
            className="transition-transform group-hover/all:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover/all:translate-x-0"
          />
        </Link>
      </div>

      {open !== null ? (
        <Lightbox photos={GALLERY} index={open} onClose={() => setOpen(null)} />
      ) : null}
    </section>
  );
}
