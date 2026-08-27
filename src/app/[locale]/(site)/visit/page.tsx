import { ArrowRight, MapPin } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BrandStrip } from '@/components/site/BrandStrip';
import { Directions } from '@/components/site/Directions';
import { OpenStatus } from '@/components/site/OpenStatus';
import { PageHero } from '@/components/site/PageHero';
import { PHOTOS, srcSetFor } from '@/components/site/photos';
import { TripPlanner } from '@/components/site/TripPlanner';
import { VisitUs } from '@/components/site/VisitUs';
import { getSiteData } from '@/lib/site';
import { sitePageMetadata } from '@/lib/site-meta';

/**
 * Where the practice is, when it is open, how to get there, and the form.
 *
 * The front page carries all of this in one section at the bottom, which is the
 * right amount for a page whose job is to introduce the practice. It is the
 * wrong amount for the reader who has already decided — and for the share of
 * this practice's patients who are deciding whether to get on a boat, "Rruga e
 * Re, Vlorë" and a week of opening hours is not an answer to anything they are
 * asking.
 *
 * So the whole of `VisitUs` is here unchanged — the same seven rows out of
 * `ClinicHours`, the same telephone tiles, the same request form owning
 * `id="request"` — and underneath it the two things the front page has no room
 * for: how people actually reach Vlorë, and what a course of treatment does to
 * the length of the trip.
 *
 * **This page owns `#request`.** Every "book a visit" on the site now points at
 * `/visit#request`, which lands here with no JavaScript at all; with JavaScript,
 * `BookDrawer` catches the click and opens the form as a panel wherever the
 * reader happens to be. That is why the form is on this route and not, say, on
 * its own: a fragment needs a page to live on, and the page a booking link
 * should fall back to is the one that also answers "where are you and when are
 * you open".
 *
 * **There is no closing call-to-action band, and its absence is deliberate.**
 * Every other page ends with one because there is nothing else to do at the foot
 * of them. This page *is* the call to action: it holds the form, the telephone
 * number, the WhatsApp link and the address. A band underneath asking a reader
 * to get in touch, four hundred pixels below the box they would get in touch
 * with, is the kind of thing that makes a site feel like it is selling rather
 * than answering.
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
    image: PHOTOS.vloreBay,
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
        aside={
          /*
           * The wide crop of the treatment room — the one photograph in the set
           * that has never appeared on the site, because until now it existed
           * only as the social card. It is the right one here: a reader on the
           * "where are you" page is deciding whether to come, and the room is
           * the thing they are coming to.
           */
          <figure className="drift-clip rounded-2xl border border-white/10 shadow-lift">
            {/* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */}
            <img
              src={PHOTOS.surgeryWide.src}
              srcSet={srcSetFor(PHOTOS.surgeryWide)}
              sizes="(min-width: 1024px) 460px, calc(100vw - 2.5rem)"
              width={PHOTOS.surgeryWide.width}
              height={PHOTOS.surgeryWide.height}
              alt={t('practice.surgeryAlt')}
              loading="lazy"
              decoding="async"
              className="drift block aspect-16/10 w-full object-cover"
            />
          </figure>
        }
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

                {/* Down the page rather than to another one: the week is on
                    this route, a few hundred pixels below. */}
                <a href="#visit" className="status-week group">
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
        </div>
      </PageHero>

      {/* The same component the front page renders: one set of opening hours,
          one telephone number, one form. A second copy of any of the three is a
          second copy to keep true. */}
      <VisitUs contact={contact} hours={hours} />

      <Directions />

      {/* Navy, between the two cream sections that would otherwise run together
          — and the six phrases land well here, after the practical detail rather
          than before it. */}
      <BrandStrip />

      {/* Last, because it is the one thing on this page a reader has to have
          decided something before they can use. Its own button goes back up to
          the form above with the first treatment they ticked already filled in. */}
      <TripPlanner />
    </>
  );
}
