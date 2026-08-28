import { ArrowRight, MapPin, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ClinicMap } from '@/components/site/ClinicMap';
import { OpenStatus } from '@/components/site/OpenStatus';
import { OpeningHours } from '@/components/site/OpeningHours';
import { PageHero } from '@/components/site/PageHero';
import { PHOTOS } from '@/components/site/photos';
import { WhyUs } from '@/components/site/WhyUs';
import { Link } from '@/i18n/navigation';
import { getSiteData } from '@/lib/site';
import { sitePageMetadata } from '@/lib/site-meta';

/**
 * The practice, the week, the town, and where the door is.
 *
 * The front page carries the whole of this in one section at the bottom, which
 * is the right amount for a page whose job is to introduce the practice. It is
 * the wrong amount for the reader who has already decided — and for the share of
 * this practice's patients who are deciding whether to get on a boat, "Rruga e
 * Re, Vlorë" and a week of opening hours is not an answer to anything they are
 * asking.
 *
 * **It stopped being only a contact page.** Everything on this route was
 * logistics: hours, a telephone number, three ways into the city. That assumes a
 * decision the commonest reader here has not made — somebody who arrived from a
 * search for a dentist in Vlorë and is comparing three of them. So the page now
 * argues before it directs. `WhyUs` states the practice's case, `OpeningHours`
 * gives the week the weight it has on a page somebody opened to read it, and
 * `ClinicMap` ends on the pin rather than on a street name.
 *
 * **Then it stopped being two pages.** `Directions`, `TripPlanner` and
 * `VloreCity` were here and are now on `/abroad`, because this route had been
 * answering two readers who want almost nothing in common: one in Vlorë who
 * needs an address and today's hours, and one in Bari working out whether an
 * implant is worth two crossings of the Adriatic. The local was scrolling past
 * ferry routes; the traveller was scrolling past a timetable. The full argument
 * is on that route; what stays here is the half a contact page is for, and a
 * line pointing the other reader at the page written for them.
 *
 * **The order is the order the questions get asked in:** why you, when are you
 * open, where exactly are you. Grounds alternate through it so no two dark
 * bands touch.
 *
 * **`BrandStrip` is deliberately gone from this route.** It is the practice's
 * six phrases as a marquee, and `WhyUs` now makes four of those six as an
 * argument with reasons under them. A page that states its case and then slides
 * the same case past in a band is a page agreeing with itself out loud.
 *
 * **This page used to own `#request`, and no longer does.** Every "book a visit"
 * on the site pointed at `/visit#request` and landed on a form at the foot of
 * this route. Booking is a page now — `/book`, with the practice's own calendar
 * on it — and what stands in the form's place here is the door to it. The
 * argument for the move is written up in `(site)/book/page.tsx`; the short
 * version is that the most valuable URL a clinic has is the one it can print on
 * a card, and a fragment inside a contact page is not it.
 *
 * **There is no closing call-to-action band, and its absence is deliberate.**
 * Every other page ends with one because there is nothing else to do at the foot
 * of them. This page carries the telephone number and the address in the
 * opening band, and a button under `WhyUs`. A band underneath asking a reader
 * to get in touch is the kind of thing that makes a site feel like it is
 * selling rather than answering.
 *
 * `dynamic = 'force-dynamic'` for the same reason the front page carries it and
 * no other: the open/closed sentence in the opening band has to be true at the
 * minute it is read. The rows behind it are cached for five minutes — see
 * `lib/site.ts` — so this costs a React render and no database.
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
    path: '/visit',
    title: t('pages.visit.metaTitle'),
    description: t('pages.visit.metaDescription'),
    image: PHOTOS.surgeryWide,
  });
}

export default async function VisitPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('site');
  const { contact, hours } = await getSiteData();

  const mapsHref = contact.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${contact.name} ${contact.address}`,
      )}`
    : null;

  return (
    <>
      <PageHero
        eyebrow={t('nav.visit')}
        title={t('pages.visit.title')}
        lede={t('pages.visit.lede')}
        // The room rather than the bay. `vloreBay` moved to `/abroad` with
        // the sections it illustrates — its own note in `photos.ts` reserves it
        // for "where the page talks about travelling here" — and two routes
        // opening on one photograph is the collision `/gallery` and `/practice`
        // were merged to end.
        photo={PHOTOS.surgery}
      >
        <div className="flex flex-col gap-5">
          {/*
           * The one sentence on this site that has to be true at the minute it
           * is read, and the reason this route is rendered per request. It is
           * the front page's own rail — the same component, the same three
           * tones, the same once-a-minute recheck in the browser — set as a
           * plaque rather than as a full-width band, because on a navy opening
           * a cream strip running edge to edge would read as the end of the
           * section rather than as part of it.
           *
           * `overflow-clip` and not `hidden`: nothing inside is on a scroll
           * timeline today, and the house rule is that the next thing put in
           * here must not have to discover why that matters. See `.drift`.
           */}
          {hours ? (
            <div className="status-rail relative w-fit max-w-full overflow-clip rounded-2xl text-bone-ink">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 px-5 py-4">
                <OpenStatus live={hours.live} initial={hours.now} />

                {/* Down the page rather than to another one: the week has a
                    section of its own on this route, two below. */}
                <a href="#hours" className="status-week group">
                  {t('hours.seeWeek')}
                  <ArrowRight
                    size={13}
                    aria-hidden
                    className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                  />
                </a>
              </div>
            </div>
          ) : null}

          {/* The address, in the opening band rather than only in the section
              below it. Somebody who followed a search result to this page is
              usually looking for exactly one line of text, and making them
              scroll for it is the commonest way a contact page fails. */}
          {contact.address ? (
            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[1.02rem] text-navy-ink">
              <MapPin size={18} aria-hidden className="shrink-0 text-gilt" />
              {contact.address}
              {mapsHref ? (
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-white underline underline-offset-4 focus-visible:outline-white"
                >
                  {t('visit.openInMaps')}
                </a>
              ) : null}
            </p>
          ) : null}

          {contact.telHref ? (
            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[1.02rem] text-navy-ink">
              <Phone size={18} aria-hidden className="shrink-0 text-gilt" />
              <a
                href={contact.telHref}
                className="font-semibold text-white underline underline-offset-4 focus-visible:outline-white"
              >
                {contact.phone}
              </a>
            </p>
          ) : null}
        </div>
      </PageHero>

      {/* First after the opening band, because it answers the question the
          reader who found this page in a search result is actually holding:
          not where are you, but why you. */}
      <WhyUs />

      {/* The week, navy, with its own heading — the section the rail above
          links down to. On the front page the same seven rows are a ruled list
          in a column, which is the right weight when the hours are one fact
          among several; on the page somebody opened to read them, they are the
          subject. See `OpeningHours` for why there is no second status rail
          inside it. */}
      {hours ? <OpeningHours hours={hours} /> : null}

      {/*
       * The way across to `/abroad`, in the place the three sections it now
       * holds used to sit.
       *
       * A rule and a sentence rather than a section, and that is the point: a
       * reader who is already in Vlorë should be able to pass this without
       * reading it, and a reader who is not should not have to find the
       * masthead to discover the page exists. A full band here would be this
       * page arguing for a different one.
       */}
      <section className="px-5 sm:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-10 gap-y-5 border-t border-bone-deep py-11">
          <p className="max-w-[52ch] text-[1.05rem] leading-relaxed text-bone-ink-soft">
            {t('pages.visit.fromAbroad')}
          </p>

          <Link
            href="/abroad"
            className="group inline-flex min-h-11 shrink-0 items-center gap-2 text-[1rem] font-semibold text-bone-ink no-underline underline-offset-4 transition-colors hover:text-gilt-deep hover:underline"
          >
            {t('nav.abroad')}
            <ArrowRight
              size={17}
              aria-hidden
              className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
            />
          </Link>
        </div>
      </section>

      {/* Last, as the reader asked for it: the pin, and the two links that hand
          the same address to whatever they navigate with. Cream, so the page
          does not end on a dark band butted against the navy footer. */}
      <ClinicMap contact={contact} />
    </>
  );
}
