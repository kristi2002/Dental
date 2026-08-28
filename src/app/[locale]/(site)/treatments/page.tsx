import { ArrowUpRight } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AskAbout } from '@/components/site/AskAbout';
import { ConcernPicker } from '@/components/site/ConcernPicker';
import { CtaBand } from '@/components/site/CtaBand';
import { PageHero } from '@/components/site/PageHero';
import { TREATMENT_PHOTOS } from '@/components/site/photos';
import { Reveal } from '@/components/site/Reveal';
import { Swash } from '@/components/site/Swash';
import { TimingMeter } from '@/components/site/TimingMeter';
import { TreatmentIndex } from '@/components/site/TreatmentIndex';
import { Watermark } from '@/components/site/Watermark';
import { Link } from '@/i18n/navigation';
import { getSiteContact } from '@/lib/site';
import {
  TREATMENT_KEYS,
  TREATMENT_TIMING,
  treatmentPath,
  type TreatmentKey,
} from '@/lib/site-content';
import { sitePageMetadata } from '@/lib/site-meta';
import { cn } from '@/lib/utils';

/**
 * Every treatment the practice does, one entry each.
 *
 * The front page shows the same eight as a wall of photographs, and that is the
 * right thing for a front page: a glance, a shape, eight things this practice
 * does. It is also the whole of what it can be — a card is a title and two
 * lines, and "root canal treatment" answered in two lines is a heading, not an
 * answer. The question a person actually arrives with is *what does this involve
 * and how long will it keep me here*, and there was nowhere on this site it was
 * asked.
 *
 * This is that page. One entry per treatment, alternating side to side so the
 * eye has a rhythm to follow down six screens; the photograph the card used, at
 * a size worth looking at; the two lines the card carried, and then the
 * paragraph it had no room for; and the timings, drawn.
 *
 * **The order is the front page's order and must stay that way.** It is clinical
 * rather than commercial — what is checked, what is repaired, what is replaced,
 * then what is straightened and brightened — and `TREATMENT_KEYS` is the single
 * list both pages read. The note on it says the rest: a list that opens with
 * implants is a price list.
 *
 * **There are no prices here and that is deliberate.** `TREATMENT_PRICES` ships
 * empty and carries the full argument; the short version is that this repository
 * holds no tariff, and a figure invented for an implant on a real clinic's
 * website is a quotation the practice would be held to. What the page can answer
 * honestly — visits, days, months — it answers, with the practice's own caveat
 * under it.
 */

/**
 * Rendered per request, exactly as the front page is, and for the same reason.
 *
 * The obvious move is to let this prerender — the words on it change about twice
 * a year. It is wrong here for the reason `(site)/page.tsx` sets out at length:
 * **the build has no database.** `Dockerfile` hands `prisma generate` a
 * deliberately unreachable `DATABASE_URL`, because a build must not need the
 * practice's server to be up, so anything baked at build time is baked with no
 * telephone number and no opening hours. This page ends on a band offering the
 * practice's number; prerendered, it would offer it to nobody.
 *
 * The rows behind it are cached for five minutes — see `lib/site.ts` — so
 * "dynamic" costs a React render and no database.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'site' });

  return sitePageMetadata({
    locale,
    path: '/treatments',
    title: t('pages.treatments.metaTitle'),
    description: t('pages.treatments.metaDescription'),
    image: TREATMENT_PHOTOS.implants,
  });
}

/**
 * One treatment, as a spread.
 *
 * `index` decides three things at once and they are deliberately tied together:
 * which side the photograph sits on, which way the bronze frame behind it is
 * offset, and which of the two creams the band is set on. Alternating all three
 * from one number is what stops the page reading as sixteen decisions; it is one
 * decision, made eight times.
 *
 * The scroll margin is the sticky index bar's height plus the condensed
 * masthead's. Without it, following a link from that bar lands the entry's
 * heading underneath the two things that are fixed to the top of the screen.
 */
async function TreatmentEntry({
  treatmentKey,
  index,
}: {
  treatmentKey: TreatmentKey;
  index: number;
}) {
  const t = await getTranslations('site');
  const photo = TREATMENT_PHOTOS[treatmentKey];
  const flipped = index % 2 === 1;

  return (
    <section
      id={`t-${treatmentKey}`}
      className={cn(
        'relative scroll-mt-32 overflow-clip px-5 py-16 sm:px-8 sm:py-20',
        flipped ? 'bg-bone-soft' : 'bg-bone',
      )}
    >
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <Reveal as="figure" className={cn('relative min-w-0', flipped && 'lg:order-2')}>
          {/*
           * A bronze rule offset behind the photograph — the cheapest depth
           * there is and the one device on this site that costs no bytes at all.
           * It points outward, away from the text, so on a flipped row it
           * offsets the other way: a frame that always sat bottom-right would
           * read as a drop shadow on one side of the page and as a mistake on
           * the other.
           */}
          <div
            aria-hidden
            className={cn(
              'absolute inset-0 hidden rounded-2xl border border-gilt/45 sm:block',
              flipped ? '-translate-x-4 translate-y-4' : 'translate-x-4 translate-y-4',
            )}
          />

          {/* The clip carries the corner so the photograph inside can be a plain
              rectangle that grows past its own edges. See `.drift`. */}
          <div className="drift-clip relative rounded-2xl border border-bone-deep bg-navy shadow-lift">
            {/* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */}
            <img
              src={photo.src}
              width={photo.width}
              height={photo.height}
              alt=""
              loading="lazy"
              decoding="async"
              sizes="(min-width: 1024px) 560px, calc(100vw - 2.5rem)"
              className="drift block aspect-4/3 w-full object-cover"
            />
          </div>
        </Reveal>

        <Reveal className={cn('min-w-0', flipped && 'lg:order-1')}>
          {/*
           * The ordinal, in the display serif and set in bronze. It is doing a
           * real job as well as a decorative one: on a page of eight nearly
           * identical spreads it is the only thing that tells a reader how far
           * through they are without looking at a scrollbar.
           */}
          <p aria-hidden className="font-display text-[1.05rem] tracking-[0.28em] text-gilt-deep">
            {String(index + 1).padStart(2, '0')} / {String(TREATMENT_KEYS.length).padStart(2, '0')}
          </p>

          {/*
           * The heading is the link to the treatment's own page, and it is the
           * heading rather than a "read more" under the paragraph on purpose:
           * a screen reader listing this page's headings gets eleven links to
           * eleven pages, which is the table of contents this page actually is.
           */}
          <h2 className="type-section mt-3 max-w-[16ch] text-bone-ink">
            <Link
              href={treatmentPath(treatmentKey)}
              className="group inline-flex items-start gap-2 text-bone-ink no-underline transition-colors hover:text-gilt-deep focus-visible:outline-gilt-deep"
            >
              {t(`treatments.${treatmentKey}.title`)}
              <ArrowUpRight
                size={22}
                aria-hidden
                className="mt-2 shrink-0 text-gilt opacity-0 transition-opacity group-hover:opacity-100"
              />
            </Link>
          </h2>

          <p className="mt-5 max-w-[52ch] text-[1.08rem] leading-relaxed text-bone-ink">
            {t(`treatments.${treatmentKey}.body`)}
          </p>

          <p className="mt-4 max-w-[54ch] text-[1.01rem] leading-relaxed text-bone-ink-soft">
            {t(`pages.treatments.detail.${treatmentKey}`)}
          </p>

          <TimingMeter timing={TREATMENT_TIMING[treatmentKey]} className="mt-8" />

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <AskAbout topic={treatmentKey} label={t('pages.treatments.ask')} />

            {/* The second way through to the same page, for the reader who is
                not ready to press a booking button — which on a survey page is
                most of them. */}
            <Link
              href={treatmentPath(treatmentKey)}
              className="inline-flex min-h-12 items-center gap-2 rounded-full border border-bone-deep px-5 text-[0.95rem] font-semibold text-bone-ink no-underline transition-colors hover:border-gilt hover:text-gilt-deep focus-visible:outline-gilt-deep"
            >
              {t('pages.treatment.more')}
              <ArrowUpRight size={17} aria-hidden className="text-gilt-deep" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default async function TreatmentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('site');
  const contact = await getSiteContact();

  return (
    <>
      {/*
       * The count is interpolated rather than written into the sentence.
       *
       * It read "Eight treatments" in three languages for as long as there were
       * eight, and the day a ninth was added that headline was wrong in three
       * languages at once with nothing to catch it — a translated string is
       * exactly where a fact goes stale unnoticed. `TREATMENT_KEYS.length` is the
       * same list the entries below are rendered from, so the number and the
       * page cannot disagree.
       */}
      <PageHero
        eyebrow={t('nav.treatments')}
        title={t('pages.treatments.title', { count: TREATMENT_KEYS.length })}
        lede={t('pages.treatments.lede', { count: TREATMENT_KEYS.length })}
        photo={TREATMENT_PHOTOS.implants}
      >
        <ul className="flex flex-wrap gap-2.5">
          {['one', 'two', 'three'].map((key) => (
            <li
              key={key}
              className="inline-flex min-h-9 items-center rounded-full border border-navy-line px-3.5 text-[0.86rem] font-semibold text-navy-ink"
            >
              {t(`strip.${key}`)}
            </li>
          ))}
        </ul>
      </PageHero>

      {/*
       * The index and the entries share one box, and that is what makes the bar
       * stop. A sticky element is held by its own parent's box, so an index left
       * as a sibling of the whole page went on hovering over the closing band
       * and the footer — an index of eight treatments, pinned to the top of a
       * screen with no treatments on it. Wrapped, it unsticks exactly where the
       * eighth entry ends.
       */}
      <div>
        <TreatmentIndex />

        {TREATMENT_KEYS.map((key, index) => (
          <TreatmentEntry key={key} treatmentKey={key} index={index} />
        ))}
      </div>

      {/*
       * The practice's own caveat, once, where the timings end — rather than
       * repeated under all eight of them. It is the same sentence the trip
       * planner carries, and it is the practice's stated rule rather than a
       * disclaimer bolted on: what it actually takes depends on the examination,
       * and the plan is written down at the first visit.
       */}
      <section className="relative overflow-clip bg-bone px-5 pb-16 sm:px-8 sm:pb-20">
        <Watermark className="-right-28 -bottom-32 w-[26rem] text-gilt/[0.05]" />

        <div className="relative mx-auto w-full max-w-6xl">
          <Swash />
          <p className="mt-8 max-w-[62ch] text-[0.95rem] leading-relaxed text-bone-ink-faint">
            {t('trip.caveat')}
          </p>
        </div>
      </section>

      {/* The way in for somebody who does not know what any of it is called.
          After the list rather than before it, which is the other way round from
          the front page — a reader who has just scrolled eight treatments and is
          still unsure is exactly who this is for. */}
      <ConcernPicker />

      <CtaBand contact={contact} />
    </>
  );
}
