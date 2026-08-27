import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BeforeAfter } from '@/components/site/BeforeAfter';
import { CtaBand } from '@/components/site/CtaBand';
import { PageHero } from '@/components/site/PageHero';
import { PhotoWall } from '@/components/site/PhotoWall';
import { PHOTOS, srcSetFor } from '@/components/site/photos';
import { SocialGrid } from '@/components/site/SocialGrid';
import { getSiteContact } from '@/lib/site';
import { sitePageMetadata } from '@/lib/site-meta';

/**
 * The place, as photographs — the rooms, the equipment, and the people in them.
 *
 * The front page's carousel is a glance: nine images behind an arrow, for
 * somebody scrolling past on the way to a telephone number. This is the page for
 * the reader who stopped, and it shows the same nine all at once with three
 * filters over them, which is a genuinely different thing to do with the same
 * files. `PhotoWall` carries the argument for why a wall beats a reel once
 * somebody is actually looking.
 *
 * **Everything here is still a placeholder and the page says so.** Not one of
 * these photographs is Shehu Dental — `photos.ts` records the source of every
 * file, the wall prints the practice's own "illustrative photographs" note under
 * it, and the before-and-after below is a labelled simulation rather than two
 * stock faces passed off as a patient. That combination is the reason this page
 * can ship at all before the practice has photography of its own: nothing on it
 * claims to be something it is not.
 *
 * **The Instagram grid is here rather than only on the front page**, and it
 * belongs here more than there: a reader who has just looked at nine pictures of
 * the practice is exactly the one who might follow it. It carries its own
 * caption saying the squares are illustrative and the real posts are on the
 * profile — see `photos.ts` on why that account cannot be read from a server.
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
    path: '/gallery',
    title: t('pages.place.metaTitle'),
    description: t('pages.place.metaDescription'),
    image: PHOTOS.surgeryWide,
  });
}

export default async function GalleryPage({
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
      <PageHero
        eyebrow={t('nav.gallery')}
        title={t('pages.place.title')}
        lede={t('pages.place.lede')}
        aside={
          /*
           * The treatment room, wide, above the wall — the one photograph on
           * this page shown at a size where the room is a room rather than a
           * tile. It is the same file the practice section uses and the same
           * `srcset`, so it costs a phone nothing extra to see it twice.
           */
          <figure className="drift-clip rounded-2xl border border-white/10 shadow-lift">
            {/* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */}
            <img
              src={PHOTOS.surgery.src}
              srcSet={srcSetFor(PHOTOS.surgery)}
              sizes="(min-width: 1024px) 460px, calc(100vw - 2.5rem)"
              width={PHOTOS.surgery.width}
              height={PHOTOS.surgery.height}
              alt={t('practice.surgeryAlt')}
              loading="lazy"
              decoding="async"
              className="drift block aspect-4/3 w-full object-cover"
            />
          </figure>
        }
      />

      <PhotoWall />

      {/* Navy, between two creams. It is also the right place for it on this
          page specifically — somebody who has just looked through nine pictures
          of the practice is the reader most likely to follow it. */}
      <SocialGrid />

      {/* The one thing on this site that is a demonstration rather than a claim,
          and it says on the page that it is a simulation. See `BeforeAfter` for
          why a stock "before" beside a stock "after" is the one placeholder this
          site will not print. */}
      <BeforeAfter />

      <CtaBand contact={contact} />
    </>
  );
}
