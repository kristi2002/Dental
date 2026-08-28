import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BrandStrip } from '@/components/site/BrandStrip';
import { CtaBand } from '@/components/site/CtaBand';
import { FirstVisit } from '@/components/site/FirstVisit';
import { HowWeWork } from '@/components/site/HowWeWork';
import { Languages } from '@/components/site/Languages';
import { PageHero } from '@/components/site/PageHero';
import { PHOTOS } from '@/components/site/photos';
import { PhotoWall } from '@/components/site/PhotoWall';
import { Practice } from '@/components/site/Practice';
import { getSiteContact } from '@/lib/site';
import { sitePageMetadata } from '@/lib/site-meta';

/**
 * Who runs the practice, how it works, and what the first hour is like.
 *
 * The front page gives this two paragraphs and three facts, which is as much as
 * a front page can spend on it. The thing those two paragraphs cannot do is
 * answer the question the nervous reader is actually asking — not *is this
 * practice any good*, which nobody expects a website to answer honestly, but
 * *what is going to happen to me*. `FirstVisit` is the section that exists for
 * that, and it is the reason this page is worth having at all.
 *
 * **There is still no photograph of Dr. Shehu, and there will not be one until
 * there is a real one.** The whole argument is in `photos.ts`: a stock portrait
 * of a stranger under a real dentist's name is a fabricated person, and no
 * framing makes that acceptable. The name is set at display size in the
 * practice's own serif instead, which is what a wordmark-led identity should do
 * with a person's name and is a better section than the headshot would have
 * been.
 *
 * **This absorbed `/gallery`, and the two were one page pretending to be two.**
 * "The place" opened on `PHOTOS.surgery` under "Have a proper look around";
 * this one opens on `PHOTOS.surgery` under a heading about the same practice.
 * Both answered *what is this place like* — one in prose and one in
 * photographs — and a clinic with a single address does not have two answers to
 * that. `PhotoWall` is the whole of what that page was; it is a section here,
 * carrying the heading its `PageHero` used to give it. `SocialGrid` was dropped
 * rather than moved, because the front page already renders it, and
 * `BeforeAfter` went to the whitening page, which is the treatment it is
 * actually about.
 *
 * **Every section here is shared with the front page except three.** `Practice`
 * and `HowWeWork` are the same components rendering the same words in both
 * places, deliberately: a second copy of what the practice says about itself is
 * a second copy to keep true. What this page adds is the material there was
 * never room for — the first visit taken apart step by step, the nine
 * photographs laid out rather than reeled past, and the three languages given
 * more than a line in a table.
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
    path: '/practice',
    title: t('pages.practice.metaTitle'),
    description: t('pages.practice.metaDescription'),
    image: PHOTOS.surgeryWide,
  });
}

export default async function PracticePage({
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
        eyebrow={t('nav.practice')}
        title={t('pages.practice.title')}
        lede={t('pages.practice.lede')}
        photo={PHOTOS.surgery}
      >
        <ul className="flex flex-wrap gap-2.5">
          {['four', 'five'].map((key) => (
            <li
              key={key}
              className="inline-flex min-h-9 items-center rounded-full border border-navy-line px-3.5 text-[0.86rem] font-semibold text-navy-ink"
            >
              {t(`strip.${key}`)}
            </li>
          ))}
        </ul>
      </PageHero>

      {/* The same component the front page renders, and deliberately the same
          words: what a practice says about itself belongs in one place. */}
      <Practice />

      <FirstVisit />

      {/* The nine photographs, which had a route of their own until this merge.
          They land after the first visit rather than before it because the
          order is an argument: who does the work, then what the appointment is,
          then the rooms it happens in. Photographs first is a brochure. */}
      <PhotoWall />

      <HowWeWork />

      <Languages />

      {/* The marquee, between the last cream section and the cream band that
          closes the page. It is the only navy left down here and it is what
          keeps three long light sections from running together. */}
      <BrandStrip />

      <CtaBand contact={contact} />
    </>
  );
}
