'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FIRST_VISIT_PHOTOS } from '@/components/site/photos';
import { Reveal } from '@/components/site/Reveal';
import { Watermark } from '@/components/site/Watermark';
import { cn } from '@/lib/utils';

/**
 * What actually happens the first time somebody sits in the chair.
 *
 * This is the section a dental practice's website nearly always leaves out, and
 * it is the one the nervous half of its readers came for. The rest of the site
 * answers *what we do* and *what it costs in time*; nobody had answered **what
 * is going to happen to me in the next hour**, which is the question that
 * actually decides whether a person who has not been to a dentist in six years
 * rings or closes the tab.
 *
 * Five steps, and the last one is the point of the other four: nothing starts
 * until the patient says so. That is the practice's own stated rule — it is
 * written on the front page as "nobody leaves without knowing what is going to
 * be done, how many visits it takes and what it costs" — and this is that
 * sentence taken apart into the order it happens in.
 *
 * **The picture follows the reading.** The list used to occupy the left half of
 * a very wide band with nothing at all in the right half — five short paragraphs
 * and then a column of empty cream to the edge of the screen. Now a photograph
 * sits there and changes as the cursor moves down the steps, which fills the
 * space with something that is *about* the step being read rather than with
 * decoration that happens to be nearby.
 *
 * **The panel is `aria-hidden` and pointer-driven only, and that is the whole
 * accessibility argument.** The photographs carry no information — every one of
 * them illustrates a sentence printed directly beside it — so a keyboard or
 * screen-reader user who never triggers the panel has lost nothing. The
 * alternative, making each step a `<button>` so it can be focused, would wrap a
 * heading and a paragraph in a control and have a screen reader announce the
 * whole step as the name of a button that does nothing but swap a decorative
 * image. Hover-only is the honest choice here; it would be the wrong one the
 * moment a picture said something the text does not.
 *
 * **The line still draws itself as you read.** A bronze hairline runs down the
 * left of the list and is walked from nothing to its full height across the
 * section's pass through the viewport, and each numbered node warms from cream
 * to bronze as it arrives. Both are scroll-*driven* rather than
 * scroll-*triggered*: scroll back up and the line un-draws. There is no
 * JavaScript in either, and a browser without scroll-driven animations draws the
 * finished line and the finished nodes — every effect on this site fails to the
 * completed state rather than to an invisible one. See `.thread` in globals.css.
 *
 * **An ordered list, because it is one.** The numbers are in the markup as
 * numbers rather than drawn in a pseudo-element, so a screen reader announces
 * "list of 5 items" and reads them in order, which is the whole content of the
 * section.
 */

/** The five, in the order they happen. Wording lives in `messages`. */
const STEPS = ['listen', 'examine', 'record', 'plan', 'decide'] as const;

export function FirstVisit() {
  const t = useTranslations('site');

  /**
   * Which step the panel is showing. It starts at the first rather than at
   * nothing: a reader arriving at this section should find a photograph already
   * there, not an empty frame that rewards them for moving the mouse.
   */
  const [active, setActive] = useState(0);

  return (
    <section
      id="first-visit"
      // `clip` and never `hidden`: the line and every node inside are on
      // `view()` timelines, and `hidden` would make this section their scroll
      // container and freeze all six. See the note on `.drift` in globals.css.
      className="relative scroll-mt-20 overflow-clip px-5 py-band sm:px-8"
    >
      <Watermark className="-top-24 -left-28 w-[30rem] text-gilt/[0.05]" />

      <div className="relative mx-auto w-full max-w-6xl">
        <Reveal>
          <h2 className="type-section max-w-[18ch] text-bone-ink">
            {t('pages.practice.first.title')}
          </h2>
          <p className="mt-5 max-w-[54ch] text-body leading-relaxed text-bone-ink-soft">
            {t('pages.practice.first.lede')}
          </p>
        </Reveal>

        <div className="mt-14 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:items-start lg:gap-16">
          {/* A wrapper rather than the list itself, because the drawn line has to
              be a sibling of the steps and an `<ol>` may only contain `<li>`. The
              positioning context is this box: the grey track is its `::before` and
              the bronze is the span below, both hung off the same corner. */}
          <div className="thread">
            {/* A real element rather than a second pseudo-element: a pseudo's own
                `view()` timeline resolves against its originating box, and this
                one needs the whole list's. */}
            <span aria-hidden className="thread-draw" />

            <ol>
              {STEPS.map((step, index) => (
                <li
                  key={step}
                  className="thread-step"
                  // `pointerenter` rather than `mouseenter`: it fires for a pen
                  // as well as a mouse, and unlike `mouseover` it does not fire
                  // again for every child element the cursor crosses inside the
                  // step.
                  onPointerEnter={() => setActive(index)}
                >
                  <span aria-hidden className="thread-node">
                    {index + 1}
                  </span>

                  {/*
                   * The step's own panel, and the only thing that marks which
                   * one the picture is showing. It is a background and a left
                   * edge rather than a border on all four sides — a full box
                   * drawn around one item in a list of five reads as that item
                   * being selected in a form.
                   */}
                  <div
                    className={cn(
                      'min-w-0 rounded-r-xl border-l-2 py-1 pb-10 pl-4 transition-colors duration-300 motion-reduce:transition-none',
                      index === active
                        ? 'border-gilt bg-bone-soft/70'
                        : 'border-transparent bg-transparent',
                    )}
                  >
                    <h3 className="text-lead font-bold text-bone-ink">
                      {t(`pages.practice.first.steps.${step}.title`)}
                    </h3>
                    <p className="mt-2.5 max-w-[52ch] text-body leading-relaxed text-bone-ink-soft">
                      {t(`pages.practice.first.steps.${step}.body`)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/*
           * The panel. Hidden below `lg` — on a phone the list is the whole
           * width and there is no cursor to follow it with, so a photograph
           * there would be five images a reader scrolls past rather than a
           * picture that answers where they are.
           *
           * Sticky, so it stays beside whichever step is being read on a screen
           * tall enough to show the whole list at once and on one that is not.
           * The offset is the condensed masthead plus air.
           */}
          <div aria-hidden className="hidden lg:sticky lg:top-28 lg:block">
            <div className="drift-clip relative overflow-hidden rounded-2xl border border-bone-deep bg-navy shadow-lift">
              {/*
               * Every photograph is rendered and stacked; `opacity` is what
               * changes. Swapping one `<img>`'s `src` would show the frame go
               * blank for as long as the next file takes to decode, which on a
               * cold cache is exactly the first time anybody sees the effect.
               * All five are in the document from the start and cross-fade
               * against each other.
               *
               * The first is `relative` and the rest are absolute over it: that
               * is what gives the box its height without hard-coding one, so the
               * panel is whatever aspect the photographs are.
               */}
              {STEPS.map((step, index) => {
                const photo = FIRST_VISIT_PHOTOS[step];

                return (
                  /* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */
                  <img
                    key={step}
                    src={photo.src}
                    width={photo.width}
                    height={photo.height}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    sizes="(min-width: 1024px) 460px, 0px"
                    className={cn(
                      'aspect-4/5 w-full object-cover transition-opacity duration-500 ease-out motion-reduce:transition-none',
                      index === 0 ? 'relative block' : 'absolute inset-0',
                      index === active ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                );
              })}

              {/* The caption, on the same gradient the treatment cards use, so
                  the two devices on this site that set type over a photograph
                  set it over the same darkness. */}
              {/* Deeper than the treatment cards' version of the same gradient,
                  and it has to be: those sit on photographs chosen to be dark at
                  the bottom, and two of these five are bright almost to the last
                  row of pixels. At `navy/70` the bronze ordinal disappeared into
                  a lightbox full of radiographs. */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy from-12% via-navy/88 via-48% to-transparent to-90% p-6 pt-20">
                <p className="font-display text-body tracking-[0.28em] text-gilt">
                  {String(active + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
                </p>
                <p className="mt-2 text-lead font-bold text-white">
                  {t(`pages.practice.first.steps.${STEPS[active]}.title`)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
