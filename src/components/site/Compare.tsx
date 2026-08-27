'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import type { SitePhoto } from '@/components/site/photos';

/**
 * A before-and-after photograph, revealed by dragging a handle across it.
 *
 * ⚠️ **Nothing renders this yet, and nothing should until the practice has real
 * photographs.** That is not an oversight — it is the reason the component
 * exists in this state rather than not existing.
 *
 * Every image in `public/site/` is free-licence stock, and `photos.ts` says so
 * at the top of the file: none of it is Shehu Dental and none of the faces has
 * ever sat in that chair. A stock "before" beside a stock "after", captioned as
 * a case, is a **fabricated clinical record** — a stronger claim than any other
 * placeholder on this page, because the whole rhetorical force of a
 * before-and-after is that it happened to a real person here. `photos.ts` refuses
 * the same thing twice already: no stock portrait under Dr. Shehu's name, and no
 * stock grid presented as the practice's Instagram feed. This is that rule
 * applied to the one image type where breaking it would matter most.
 *
 * There is a second reason to wait. Advertising dental before-and-afters is
 * regulated across most of the EU and the UK — the markets this page is
 * translated for — and the rules generally require the patient's documented
 * consent, comparable conditions, and no retouching. Those are the practice's
 * obligations to meet, and the component cannot meet them on its behalf.
 *
 * **To ship it**: put consented pairs in `public/site/`, add them to `photos.ts`
 * with `source: null`, add the alt text and the captions to `messages/*.json`,
 * and render this from `page.tsx`. The interaction below is finished and needs
 * nothing.
 *
 * ---
 *
 * **How it works.** A range input drives one custom property, and the "after"
 * layer is clipped to it. No drag handling, no pointer maths, no listener on the
 * window — the browser already knows how to drag a slider, and it knows how to
 * do it with a finger, with a mouse, and with the arrow keys.
 *
 * That last one is the whole argument for building it this way. The usual
 * before-and-after slider is a `div` with `pointerdown`/`pointermove` on it,
 * which works beautifully for the pointer it was tested with and is completely
 * unusable without one: no focus, no keyboard, nothing announced. A native
 * `<input type="range">` is operable by everybody, exposes its value, and reads
 * as "slider, 50%" to a screen reader — which is exactly what it is.
 *
 * The value is state rather than a bare uncontrolled input because the clip has
 * to follow it. One number, no layout read, and the clip is a compositor
 * operation.
 */
export function Compare({
  before,
  after,
  beforeAlt,
  afterAlt,
  caption,
  simulated = false,
}: {
  before: SitePhoto;
  after: SitePhoto;
  beforeAlt: string;
  afterAlt: string;
  caption: string;
  /**
   * Tints the base layer to stand in for a "before" the practice does not have.
   *
   * Set only where `before` and `after` are **the same photograph** — it is a
   * demonstration of the control, not a case. Two different stock faces labelled
   * before and after would be a fabricated clinical record, which is the one
   * thing this component must never be used to build; see the note at the top of
   * this file. Passing a real consented pair leaves this false.
   */
  simulated?: boolean;
}) {
  const t = useTranslations('site');
  const [position, setPosition] = useState(50);
  const id = useId();

  return (
    <figure className="w-full">
      <div
        className="relative overflow-hidden rounded-2xl border border-bone-deep bg-bone-soft"
        style={{ '--reveal': `${position}%` } as React.CSSProperties}
      >
        {/* The "before" sits underneath at full size and is what gives the box
            its height — so the container needs no aspect ratio of its own and
            the pair cannot disagree about one. */}
        {/* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */}
        <img
          src={before.src}
          width={before.width}
          height={before.height}
          alt={beforeAlt}
          loading="lazy"
          decoding="async"
          // A tint, not a retouch: the two layers are one file, so nothing here
          // can imply an outcome. See `simulated`.
          style={
            simulated
              ? { filter: 'sepia(0.5) saturate(0.8) brightness(0.93) contrast(0.95)' }
              : undefined
          }
          className="block w-full object-cover"
        />

        {/* The "after" is laid over it and clipped from the left to `--reveal`.
            `inset()` rather than a width: clipping does not reflow the image, so
            the two stay in register at every position — animating a width
            would squash the top layer as the handle moved. */}
        {/* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */}
        <img
          src={after.src}
          width={after.width}
          height={after.height}
          alt={afterAlt}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 block h-full w-full object-cover"
          style={{ clipPath: 'inset(0 0 0 var(--reveal))' }}
        />

        {/* The seam. Decorative — the slider below is the control, and this is
            only where the eye expects the join to be. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-px bg-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"
          style={{ left: 'var(--reveal)' }}
        />

        {/* Left of the seam is the base layer and right of it is the clipped
            overlay, so these two are not interchangeable — they were the wrong
            way round in the first draft, which labelled the untouched half
            "after". */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-4 left-4 rounded-full bg-navy/75 px-3 py-1 text-[0.78rem] font-bold tracking-[0.1em] text-white uppercase backdrop-blur-sm"
        >
          {t('compare.before')}
        </span>
        <span
          aria-hidden
          className="pointer-events-none absolute top-4 right-4 rounded-full bg-navy/75 px-3 py-1 text-[0.78rem] font-bold tracking-[0.1em] text-white uppercase backdrop-blur-sm"
        >
          {t('compare.after')}
        </span>
      </div>

      {/* Deliberately a visible control under the picture rather than an
          invisible one stretched across it. A slider a reader cannot see is a
          slider they have to discover by accident, and the transparent-input
          trick also swallows every tap on the photograph itself. */}
      <label htmlFor={id} className="sr-only">
        {t('compare.slider')}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        step={1}
        value={position}
        onChange={(event) => setPosition(Number(event.target.value))}
        // The percentage means nothing said aloud. What a reader needs to know
        // is which of the two they are looking at more of.
        aria-valuetext={t('compare.valueText', { percent: 100 - position })}
        className="mt-4 w-full accent-gilt-deep"
      />

      <figcaption className="mt-3 text-[0.88rem] text-bone-ink-faint">{caption}</figcaption>
    </figure>
  );
}
