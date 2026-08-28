import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Aftercare } from '@/components/site/Aftercare';
import { CtaBand } from '@/components/site/CtaBand';
import { Directions } from '@/components/site/Directions';
import { PageHero } from '@/components/site/PageHero';
import { PHOTOS } from '@/components/site/photos';
import { TripPlanner } from '@/components/site/TripPlanner';
import { VloreCity } from '@/components/site/VloreCity';
import { getSiteContact } from '@/lib/site';
import { sitePageMetadata } from '@/lib/site-meta';

/**
 * For the patient who is not in Albania yet.
 *
 * **This was carved out of `/visit`, which had been two pages sharing a
 * route.** That page served a reader who wanted an address and today's hours —
 * somebody in Vlorë, deciding where to drive — *and* a reader in Bari working
 * out whether an implant is worth two crossings of the Adriatic. Those two want
 * almost nothing in common: the first needs one line of text and a map pin, the
 * second needs a schedule, a route and a reason to trust a clinic they cannot
 * walk past. Serving both from one route meant the local scrolled past ferry
 * timetables and the traveller scrolled past opening hours.
 *
 * So `/visit` keeps the pin, the week and the practice's case for itself, and
 * this route takes the journey. Nothing was written twice to do it — `Directions`,
 * `TripPlanner` and `VloreCity` moved here whole, in the order they already sat
 * in, and they are better company for each other than they were for a map.
 *
 * **The one new section is `Aftercare`, and it is the reason this page is worth
 * a slot in the masthead rather than a heading on another page.** The site could
 * already tell somebody how many appointments and how many days; it could not
 * tell them what happens when the crown they flew home with starts to ache. That
 * is the question the whole trip actually turns on, and it had no answer
 * anywhere on this storefront. See the note on that component — including why
 * the guarantee half of it renders nothing until Dr. Shehu supplies terms.
 *
 * **The order is the reader's own sequence of questions.** How do I get there;
 * how long does it keep me; what happens when I am home again; and — only then,
 * once the practical answers are in — what is Vlorë actually like. `VloreCity`
 * last is deliberate: it is the only one of the four that is not a question
 * somebody is anxious about, and putting the pretty section before the reassuring
 * one is how a clinic page turns into a holiday brochure.
 */

/**
 * Rendered per request, as every storefront route is, and for the same reason.
 *
 * The words here change about twice a year and it still may not prerender: **the
 * build has no database.** `Dockerfile` hands `prisma generate` a deliberately
 * unreachable `DATABASE_URL`, so anything baked at build time is baked with no
 * telephone number. This page ends on a band offering the practice's number;
 * prerendered, it would offer it to nobody. See `(site)/page.tsx` for the long
 * form of that argument.
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
    path: '/abroad',
    title: t('pages.abroad.metaTitle'),
    description: t('pages.abroad.metaDescription'),
    image: PHOTOS.vloreBay,
  });
}

export default async function AbroadPage({
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
      {/* The bay, and it belongs to this route now rather than to `/visit`. Its
          own note in `photos.ts` says why: it is the one photograph on this site
          genuinely of the right place, "used where the page talks about
          travelling here rather than as decoration". This is that page. */}
      <PageHero
        eyebrow={t('nav.abroad')}
        title={t('pages.abroad.title')}
        lede={t('pages.abroad.lede')}
        photo={PHOTOS.vloreBay}
      />

      {/* Air, sea and road. First because it is the only question on this page
          with a factual answer the reader does not have to decide anything to
          use. */}
      <Directions />

      {/* Then the arithmetic: tick a treatment and it says how many
          appointments, how many days in Vlorë, and whether that is one trip or
          two. Its button carries the ticked treatment across to the booking
          form — see `TopicChoice` on the storefront layout. */}
      <TripPlanner />

      {/* Directly under the planner, and that adjacency is the argument. The
          planner has just told somebody an implant is two trips three to six
          months apart; "and in between, when I am at home?" is the next thought
          they have, not a later one. */}
      <Aftercare />

      {/* Navy, last, and the only dark band between the opening and the closing
          one — it breaks a long cream run at the point the subject stops being
          the treatment and starts being the town. */}
      <VloreCity />

      <CtaBand contact={contact} />
    </>
  );
}
