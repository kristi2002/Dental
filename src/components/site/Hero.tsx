import { ArrowDown, ArrowRight, Phone, Star } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ClinicLogo } from '@/components/brand/ClinicLogo';
import { HeroStage } from '@/components/site/HeroStage';
import { OpenStatus } from '@/components/site/OpenStatus';
import { Link } from '@/i18n/navigation';
import type { SiteContact, SiteHours } from '@/lib/site';

/**
 * The top of the practice's public page, built around two rules.
 *
 * **It is exactly one screen tall, and nothing in it is cut off.** That is why
 * this file was rewritten the first time. The old hero was a two column grid
 * with its own padding, a photograph that overhung its container by forty
 * pixels, and an opening-hours strip bolted underneath — the height of it was
 * whatever those pieces happened to add up to, which on a laptop was about a
 * screen and a quarter. So the first thing every visitor saw was a headline with
 * its bottom third below the fold and a photograph sliced through the middle. A
 * hero that does not fit is not a hero; it is the top of a long page.
 *
 * The section is `min-h-svh` and a flex column, and the three parts share that
 * height rather than accumulating into it: the type takes the middle and is
 * centred in whatever is left, the status rail is pinned to the bottom edge, and
 * the masthead's own height is the only padding at the top. `svh` rather than
 * `vh` is load-bearing on a phone — `100vh` is measured against the browser
 * chrome *retracted*, so a `vh` hero is always about eighty pixels taller than
 * the screen it is on, which is the single commonest way a hero gets clipped.
 *
 * **The film is the whole frame and the type is centred on it.** That is the
 * second rewrite and it replaced a split — headline on navy at the left, a
 * photograph occupying the right 54% — which was a good arrangement for a still
 * and the wrong one for footage. A moving picture cropped to half the screen is
 * a television in the corner of a room; the same footage full-bleed is the room.
 * So there is one composition now instead of two, at every width, and the panel
 * seam that the split needed a graduated scrim to dissolve does not exist.
 *
 * The lockup leads it. The practice's identity is a drawn wordmark and this is
 * the one place on the page with room to set it at the size it was drawn for —
 * a nameplate over the film, with the town under it, and the sentence that
 * explains what this is directly below. The masthead carries the same lockup in
 * the same gilt frame at a fifth of the size, which is the relationship a
 * cover has with a running head rather than a logo repeated twice.
 */
export async function Hero({
  contact,
  hours,
}: {
  contact: SiteContact;
  hours: SiteHours | null;
}) {
  const t = await getTranslations('site');

  return (
    <section
      // `id` is here for `BookFab`, which watches the hero and the request form
      // and shows itself only when neither is on screen. Not a link target —
      // nothing navigates to it — but an id is the cheapest handle an observer
      // can take, and giving the section one costs the markup nothing.
      id="hero"
      className="relative flex min-h-svh flex-col overflow-hidden bg-navy text-white"
    >
      {/*
       * The film, full-bleed at every width. `aria-hidden` because a moving
       * picture of a room is one impression rather than a set of facts — the
       * reasoning is set out at the top of `HeroStage`, and `HeroFilmPlayer`
       * repeats it for the video.
       *
       * `overflow-clip` because the stage inside grows 8% as it parks and would
       * otherwise paint past this box. `clip`, not `hidden`: `hidden` would make
       * this a scroll container, and while `.hero-park` names `scroll(root)`
       * explicitly and would survive it, the next thing put in here would not.
       * See `.drift` in globals.css.
       */}
      <div aria-hidden className="hero-film absolute inset-0 overflow-clip">
        <div className="hero-park absolute inset-0">
          <HeroStage />
        </div>
      </div>

      {/*
       * The scrim, and getting it right took two goes. The type used to sit on
       * flat navy with the picture beside it; it now sits *on* the picture at
       * every width, and the footage is a white room — the brightest thing that
       * has ever been behind this headline. The first pass answered that with a
       * heavy wash at 82–94% navy the whole way down, and the result was a hero
       * with no film in it: the room was a rumour behind a navy rectangle, which
       * is a strange thing to spend 1.6MB on.
       *
       * The darkening moved to the footage itself instead — `.hero-film` takes
       * it to 55% brightness and desaturates it, so it is genuinely dark rather
       * than hidden — and what is left here is shaped rather than flat. Real
       * navy at the top where the masthead's links sit, thin through the middle
       * where the picture should be visible, and deep again at the foot where
       * the cream status rail meets it.
       */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-navy/72 via-navy/34 via-45% to-navy/86"
      />

      {/* The lamp: light gathered up and to the left, over everything. One
          gradient, no image — the same device the first draft of this page
          used, kept because it is the cheapest depth there is. */}
      <div
        aria-hidden
        className="drift-light absolute inset-0 bg-[radial-gradient(115%_95%_at_12%_-5%,var(--color-navy-soft),transparent_58%)]"
      />

      {/* The grain the rest of the navy now carries. On the hero it is doing a
          second job as well as breaking the gradient up: the lamp above and the
          scrim below are both very wide, very dark falloffs, which is precisely
          the case eight-bit colour bands in — and the band ran straight through
          the headline. See `.grain`. */}
      <div aria-hidden className="grain pointer-events-none absolute inset-0" />

      {/*
       * The ground the masthead does not have.
       *
       * At the top of the page the header is deliberately transparent — the
       * lockup floats on the film, and a bar there would throw the whole
       * masthead idea away. The catch is that the navigation then has to be
       * legible against whatever the footage happens to be showing, and this
       * footage is a white room throughout. A gradient band is the standard
       * answer and the right one: it gives the header its own falloff without
       * giving it an edge, so the type has something to sit on and the picture
       * still runs to the top of the screen. It costs nothing once the page is
       * scrolled, because by then the masthead's real veil is opaque navy and
       * this is behind it.
       */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-52 bg-gradient-to-b from-navy/78 via-navy/38 to-transparent"
      />

      {/*
       * Two bands, not one column.
       *
       * The first pass stacked everything down the middle — nameplate, town,
       * headline, paragraph, four pills, two buttons, rating — and the result
       * was a hero with eight things competing to be looked at first, in which
       * the logo happened to be the tallest rather than the subject. A focal
       * point is not a size; it is the absence of rivals.
       *
       * So the lockup takes the upper band alone and is centred in whatever
       * height is left over, and everything that is *words* drops to a band
       * along the bottom — the argument on the left, the credentials on the
       * right, the middle deliberately empty so the eye running down from the
       * nameplate has somewhere to land.
       *
       * Two things went entirely. The four treatment pills were shortcuts to a
       * grid the masthead's own first link already reaches, and the long lede
       * became one line: `hero.ledeShort` says the single thing that decides
       * whether somebody flies in for treatment, and the full sentence still
       * does its work in the page description a search engine reads.
       */}
      <div className="relative flex flex-1 flex-col px-5 pt-[4.6rem] pb-6 sm:px-8 sm:pt-[7.6rem] sm:pb-9 lg:pt-[8.6rem]">
        {/* `hero-lift` is on the wrapper rather than on its children because
            every child already carries `.rise`, and an element can only run one
            animation per property. Nesting the two puts the timer-driven arrival
            and the scroll-driven departure on separate elements, where they
            compose instead of overwriting each other. */}
        <div className="hero-lift hero-column flex flex-1 flex-col">
          {/*
           * The nameplate, alone in the upper band and centred in it.
           *
           * It is an `<img>` of artwork that spells the practice's name, and the
           * `<h1>` below says the same name — so `alt=""` and the lockup is
           * decorative here, exactly as it is in the masthead. A screen reader
           * that announced it would read the practice's name, then a headline
           * saying it again, before reaching a single fact.
           *
           * `min(vw, svh)` so it is bounded by the shorter dimension too: a
           * 12vw lockup is right on a 1440×900 laptop and far too tall on a
           * 1280×720 one, where the whole hero has 180 fewer pixels to live in.
           *
           * **No frame.** It wore the masthead's gilt outline for one draft, on
           * the reasoning that the two lockups being the same shape at different
           * scales is what stops the second reading as the logo pasted in twice.
           * It was the wrong instinct at this size: a border is a way of saying
           * *this is a thing on the page*, and at 144 pixels tall in the middle
           * of an otherwise empty screen the lockup does not need permission to
           * be looked at — the box only fenced it in and put a second rectangle
           * on a page whose hero is already a rectangle of film. The bar keeps
           * its frame, where the lockup is small and does need one.
           *
           * `hero-mark` carries no styling of its own. It is a hook for the
           * short-screen tiers in globals.css, which need something to take the
           * height down by.
           */}
          <div className="flex flex-1 items-center justify-center">
            <div style={{ '--i': 0 } as React.CSSProperties} className="rise hero-mark">
              <ClinicLogo
                variant="inverse"
                alt=""
                className="h-[clamp(4.6rem,min(12vw,16svh),12rem)] w-auto"
              />
            </div>
          </div>

          {/*
           * The band. One column on a phone, two from `lg` — and the right-hand
           * one is `auto` rather than a fraction, so the credentials take
           * exactly the width they need and the headline gets the rest instead
           * of the two being handed half a screen each.
           */}
          <div className="hero-band mx-auto grid w-full max-w-6xl items-end gap-x-10 gap-y-7 pt-8 sm:pt-10 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <h1 className="font-display text-[clamp(1.85rem,min(4.4vw,5.8svh),3.4rem)] leading-[1.05] font-normal tracking-[-0.015em] text-balance">
                <span className="hero-line" style={{ '--i': 1 } as React.CSSProperties}>
                  <span className="hero-line-ink">{t('hero.titleLead')}</span>
                </span>
                <span className="hero-line" style={{ '--i': 2 } as React.CSSProperties}>
                  <span className="hero-line-ink text-navy-ink-soft">{t('hero.titleTurn')}</span>
                </span>
              </h1>

              <p
                style={{ '--i': 3 } as React.CSSProperties}
                className="rise mt-3.5 max-w-[46ch] text-body leading-relaxed text-navy-ink sm:text-body"
              >
                {t('hero.ledeShort')}
              </p>

              <div
                style={{ '--i': 4 } as React.CSSProperties}
                className="rise hero-actions mt-6 flex flex-wrap items-center gap-3"
              >
                {/* `cta-fill` carries the hover outright — the navy rising into
                    the pill, and the half-step lift this button already had. It
                    replaces the three utilities that used to do the last of
                    those, because a transform declared in the component class
                    and a `hover:-translate-y-0.5` utility are two rules fighting
                    over one property and the utility layer always wins.
                    That same precedence is why the label's two colours stay
                    here as utilities rather than moving into the class with
                    everything else: `text-navy` beats a `color` set on
                    `.cta-fill:hover`, and the first version of this had the
                    label going navy-on-navy — a bronze pill that turned blank
                    when you pointed at it. See `.cta-fill` in globals.css. */}
                <Link
                  href="/book"
                  className="cta-fill group inline-flex min-h-13 items-center sm:min-h-14 gap-2.5 rounded-full bg-gilt px-7 text-body font-bold text-navy no-underline hover:text-bone focus-visible:text-bone focus-visible:outline-white"
                >
                  {t('hero.book')}
                  <ArrowRight
                    size={18}
                    aria-hidden
                    className="transition-transform group-hover:translate-x-1 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                  />
                </Link>

                {/* Only when there is a number behind it. A `tel:` to nothing is
                    a dead button, and on a desktop with nothing registered for
                    the scheme it is a silently dead one. */}
                {contact.telHref ? (
                  <a
                    href={contact.telHref}
                    className="inline-flex min-h-13 items-center sm:min-h-14 gap-2.5 rounded-full border border-white/30 px-6 text-body font-semibold text-white no-underline transition-colors hover:bg-white/10 focus-visible:outline-white"
                  >
                    <Phone size={18} aria-hidden />
                    {contact.phone}
                  </a>
                ) : null}
              </div>
            </div>

            {/*
             * The other side of the balance: where the practice is, and what
             * other people have said about it. Both are facts *about* the
             * practice rather than things it is claiming, which is why they sit
             * apart from the argument on the left rather than inside it.
             *
             * Right-aligned only from `lg`. Below that the band is one column,
             * and a right-aligned block under a left-aligned one reads as a
             * mistake rather than as a composition.
             */}
            <div
              style={{ '--i': 5 } as React.CSSProperties}
              className="rise hero-extra flex flex-col gap-2.5 lg:items-end lg:text-right"
            >
              {/*
               * White, not bronze — a measurement rather than a taste.
               *
               * This line was `text-gilt` for as long as it sat on flat navy,
               * where the palette records bronze at 5.8:1 and it passes
               * comfortably. It now sits on film, and film is not a colour:
               * sampled behind these twelve pixels of type the ground runs to
               * rgb(68 74 82), where gilt is 3.4:1 and fails AA outright. The
               * text is 0.72rem and bold, nowhere near large enough for the 3:1
               * exception.
               *
               * The page has made this trade before in the other direction:
               * bronze type on cream uses `gilt-deep` because the bright one is
               * 2.1:1 there and hopeless. Same rule, same conclusion. The bronze
               * stays in the rule beside it, which is decoration and carries no
               * contrast requirement.
               */}
              <p className="flex items-center gap-3 text-micro font-semibold tracking-[0.28em] text-white uppercase">
                <span aria-hidden className="h-px w-8 bg-gilt" />
                {t('hero.eyebrow')}
              </p>

              {/*
               * The rating, once.
               *
               * It used to be written into this file twice — a frosted card
               * floating over the photograph on wide screens, a line of type on
               * phones — because the split hero had a corner going spare on one
               * and ninety vertical pixels it could not afford on the other.
               * This band has a right-hand column that wants exactly this, so
               * the duplicate is gone.
               *
               * The number is Google's and it says so. A 4.9 on a practice's own
               * front page with no source attached is a claim the practice is
               * making about itself; the same 4.9 with "Google" beside it is a
               * citation. That distinction is also why there is no
               * `aggregateRating` in this page's structured data — restating
               * somebody else's rating as your own review markup is specifically
               * what Google's guidelines forbid. See `page.tsx`.
               */}
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-navy-ink lg:justify-end">
                <span aria-hidden className="flex gap-0.5 text-gilt">
                  {[0, 1, 2, 3, 4].map((star) => (
                    <Star key={star} size={13} fill="currentColor" strokeWidth={0} />
                  ))}
                </span>
                <span className="font-bold text-white">4.9</span>
                {t('hero.ratingSource')}
                <span aria-hidden className="text-navy-line">
                  ·
                </span>
                <span className="text-navy-ink-soft">{t('hero.ratingCount')}</span>
              </p>
            </div>
          </div>
        </div>

        {/* `xl` only now. The band below the nameplate reaches much closer to
            the foot of the hero than the old centred column did, and on a
            1280-wide screen the cue was landing on top of the booking button. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-2 hidden justify-center xl:flex">
          <ArrowDown size={20} aria-hidden className="cue text-white/40" />
        </div>
      </div>

      <StatusRail hours={hours} />
    </section>
  );
}

/**
 * The foot of the hero: cream, full width, and the last thing above the fold.
 *
 * It does three jobs at once, which is why it is worth a strip of its own.
 *
 * It **answers the question** — whether the door is open at this minute — and
 * that half is `OpenStatus`, the page's one genuinely live component. The rail
 * around it is server-rendered furniture.
 *
 * It **ends the hero**, in the page's warm paper rather than in its navy, so
 * the eye is handed down into the sections below instead of hitting a hard edge
 * where the picture stops.
 *
 * And it **guarantees the fold**. Because the rail is the last child of a
 * `min-h-svh` flex column, its bottom edge and the bottom of the screen are the
 * same line — so there is always a strip of cream visible under the film saying,
 * without a scroll cue, that the page continues.
 *
 * The whole rail disappears when `hours` is null — the database was unreachable,
 * and a front door that guesses at opening times is worse than one that does not
 * mention them. See `SiteData.hours`.
 */
async function StatusRail({ hours }: { hours: SiteHours | null }) {
  const t = await getTranslations('site');
  if (!hours) return null;

  return (
    <div className="status-rail relative text-bone-ink">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-5 gap-y-2.5 px-5 py-3.5 sm:px-8 sm:py-4">
        <OpenStatus live={hours.live} initial={hours.now} />

        <a href="#visit" className="status-week group ml-auto">
          {t('hours.seeWeek')}
          <ArrowRight
            size={13}
            aria-hidden
            className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
          />
        </a>
      </div>
    </div>
  );
}
