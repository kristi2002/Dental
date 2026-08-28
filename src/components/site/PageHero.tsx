import { ChevronRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { CSSProperties, ReactNode } from 'react';
import { Ambience } from '@/components/site/Ambience';
import { srcSetFor, type SitePhoto } from '@/components/site/photos';
import { Watermark } from '@/components/site/Watermark';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';

/**
 * The opening band of every page that is not the front page.
 *
 * The storefront was one long page for its whole life, and the four words in the
 * masthead were anchors into it. They are routes now — a reader who wants to
 * know what an implant involves gets a page about implants rather than a card in
 * a grid — and the moment a site has more than one page it needs the thing a
 * one-pager never does: a way of saying, in the first screen, *which* page this
 * is and where it sits.
 *
 * That is all this component is, and it is deliberately one component rather
 * than four hand-built headers. Four pages that each invent their own opening is
 * how a site stops looking like one site, and it is the failure mode a
 * storefront grown page by page always has.
 *
 * **It is not a second hero.** The front page opens on a film that fills the
 * screen; if this did anything like that, every page would be a front page and
 * none of them would be. So it is a band — tall enough to be a proper opening,
 * short enough that the content underneath is on screen before the reader has
 * scrolled — and it carries no photograph of its own unless the page hands it
 * one through `aside`.
 *
 * **`id="hero"`** for the same reason the real hero has one: `BookFab` watches
 * for it and shows the floating booking button only once it has gone by. Without
 * it the button would either never appear on these pages or would sit over the
 * opening headline, which are the two states that component exists to avoid.
 *
 * The top padding is the masthead's problem made visible. The bar is fixed and
 * two-tiered at rest — it condenses as the page is scrolled, so at the very top
 * of a page it is at its tallest, which is exactly when this band is being read.
 * The figures clear it at every width with a little air, and are the one thing
 * in this file to check if the masthead's own scale changes again.
 */
export async function PageHero({
  /** Small capitals over the title — what kind of page this is. */
  eyebrow,
  title,
  lede,
  /** The meta row under the lede: chips, a status rail, a pair of buttons. */
  children,
  /** An optional figure to the right of the type, from `lg` up. */
  aside,
  /**
   * A photograph to run edge to edge behind the whole band.
   *
   * Optional, and the band works without it exactly as it did before — a page
   * that has no photograph worth the width should not be given a weak one.
   */
  photo,
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: string;
  children?: ReactNode;
  aside?: ReactNode;
  photo?: SitePhoto;
  className?: string;
}) {
  const t = await getTranslations('site');

  return (
    <section
      id="hero"
      className={cn(
        // `clip` and never `hidden` — the watermark and the aside both hang off
        // this box, and `hidden` would make it a scroll container and freeze
        // every `view()` timeline inside it. The whole argument is on `.drift`
        // in globals.css.
        'relative overflow-clip bg-navy px-5 pt-28 pb-14 text-white sm:px-8 sm:pt-36 sm:pb-16 lg:pt-40 lg:pb-20',
        className,
      )}
    >
      {/*
       * The photograph, and the two gradients that make type survivable on it.
       *
       * **A picture behind a headline is a contrast problem before it is a
       * decoration.** White text on an unmodified photograph is legible over
       * whichever part of it happens to be dark and illegible everywhere else,
       * and which part that is changes with the crop at every viewport width.
       * So the image never appears at full strength: it is dimmed globally, and
       * then a second gradient pours navy in from the left — the side the type
       * is on — so the words always sit on near-solid colour while the right of
       * the band keeps the picture.
       *
       * The vertical gradient underneath is doing a different job: it lands the
       * band on whatever follows it, so the photograph stops *on* the next
       * section rather than being cut off by it.
       *
       * `object-cover` with no art direction is deliberate — these are 4:3 and
       * 16:9 files behind a band that is much wider than it is tall at every
       * size, so the crop is always the middle of the picture, which is where
       * every one of these has its subject.
       */}
      {photo ? (
        <div aria-hidden className="absolute inset-0">
          {/* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */}
          <img
            src={photo.src}
            srcSet={srcSetFor(photo)}
            width={photo.width}
            height={photo.height}
            alt=""
            decoding="async"
            sizes="100vw"
            className="h-full w-full scale-105 object-cover opacity-75"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-navy from-8% via-navy/78 via-42% to-navy/15" />
          <div className="absolute inset-0 bg-gradient-to-t from-navy from-1% via-transparent via-48% to-navy/55" />
        </div>
      ) : null}

      <Ambience />

      {/* The lamp the front page's hero uses, at the same angle. Two navy bands
          on the same site lit from different corners read as two sites. */}
      <div
        aria-hidden
        className="drift-light absolute inset-0 bg-[radial-gradient(115%_95%_at_12%_-5%,var(--color-navy-soft),transparent_58%)]"
      />

      <Watermark className="-top-20 -right-24 w-[26rem] text-white/[0.04] sm:w-[34rem]" />

      {/* Two columns only when there is a second column. Left unconditional,
          a page that passes no `aside` gets its type squeezed into 1.15fr of a
          72rem measure with half the band empty beside it — which reads as a
          figure that failed to load rather than as restraint. */}
      <div
        className={cn(
          'relative mx-auto grid w-full max-w-6xl gap-10 lg:items-end lg:gap-14',
          // A ternary rather than `&&`: `ReactNode` includes `0`, and a falsy
          // `aside` of that shape would hand `cn` a number rather than nothing.
          aside ? 'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]' : undefined,
        )}
      >
        <div className="min-w-0">
          {/*
           * A breadcrumb of two, which is the whole depth this site has. It
           * exists for the reader who arrived from a search result rather than
           * from the front page: they are one press from the practice's own
           * opening, and without this the only way back is the lockup, which
           * looks like decoration until you try it.
           *
           * `aria-label` rather than a visually hidden heading — a nav landmark
           * named "Breadcrumb" is what a screen reader's landmark list expects
           * to find here.
           */}
          <nav aria-label={t('pages.breadcrumb')} className="rise" style={{ '--i': '0' } as CSSProperties}>
            <ol className="flex flex-wrap items-center gap-1.5 text-[0.76rem] font-semibold tracking-[0.14em] uppercase">
              <li>
                <Link
                  href="/"
                  className="text-navy-ink-soft no-underline transition-colors hover:text-white focus-visible:outline-white"
                >
                  {t('pages.home')}
                </Link>
              </li>
              <li aria-hidden className="text-gilt">
                <ChevronRight size={13} />
              </li>
              <li className="text-gilt">{eyebrow}</li>
            </ol>
          </nav>

          <h1
            className="type-lead rise mt-5 max-w-[15ch] text-white"
            style={{ '--i': '1' } as CSSProperties}
          >
            {title}
          </h1>

          {lede ? (
            <p
              className="rise mt-6 max-w-[54ch] text-[1.06rem] leading-relaxed text-navy-ink"
              style={{ '--i': '2' } as CSSProperties}
            >
              {lede}
            </p>
          ) : null}

          {children ? (
            <div className="rise mt-9" style={{ '--i': '3' } as CSSProperties}>
              {children}
            </div>
          ) : null}
        </div>

        {aside ? (
          <div className="rise min-w-0" style={{ '--i': '2' } as CSSProperties}>
            {aside}
          </div>
        ) : null}
      </div>
    </section>
  );
}
