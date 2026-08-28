import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BeforeAfter } from '@/components/site/BeforeAfter';
import { BrandStrip } from '@/components/site/BrandStrip';
import { ConcernPicker } from '@/components/site/ConcernPicker';
import { DentalArch } from '@/components/site/DentalArch';
import { Gallery } from '@/components/site/Gallery';
import { Hero } from '@/components/site/Hero';
import { HowWeWork } from '@/components/site/HowWeWork';
import { PHOTOS } from '@/components/site/photos';
import { Practice } from '@/components/site/Practice';
import { SocialGrid } from '@/components/site/SocialGrid';
import { Treatments } from '@/components/site/Treatments';
import { TripPlanner } from '@/components/site/TripPlanner';
import { VisitUs } from '@/components/site/VisitUs';
import { locales } from '@/i18n/routing';
import { getSiteData, type SiteHours } from '@/lib/site';

/**
 * Rendered per request — and, since the rows behind it are cached, that now
 * costs a React render and no database at all.
 *
 * **Why not static.** The obvious move is `revalidate` and an Edge-cached page,
 * and it is wrong here for two specific reasons. There is no edge: this deploys
 * to Coolify as `output: 'standalone'`, one Node process, no CDN in front of it,
 * so there is no second machine for a cached page to sit closer to. And the
 * build has no database — `Dockerfile` hands `prisma generate` a deliberately
 * unreachable `DATABASE_URL`, because a build must not need the practice's
 * server to be up. A prerendered storefront would therefore be baked with no
 * opening hours and no telephone number, and would serve exactly that to
 * everybody who visited between a deploy and the first revalidation. A front
 * page that ships blank to save a few milliseconds is a bad trade.
 *
 * **What was actually costing something** was not the rendering. Every
 * anonymous visit ran three queries, one of which — `getClinicProfile` — is an
 * upsert, so a public page was issuing a write transaction per view. Those reads
 * are now behind `unstable_cache` for five minutes (see `lib/site.ts`), which
 * takes the database off the critical path without pretending the page is a
 * static asset.
 *
 * **The one thing that must be current** is the hero's "open now, until 19:00".
 * It is computed here at request time and then kept live in the browser by
 * `OpenStatus`, which recomputes it on the clinic's clock once a minute — so it
 * stays true for a tab left open, which a per-request render alone never
 * achieved.
 */
export const dynamic = 'force-dynamic';

/** Where this install actually answers, for canonicals and social cards. */
function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || '';
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'site' });
  const { contact } = await getSiteData();

  const origin = siteOrigin();
  const title = t('meta.title', { clinic: contact.name });
  const description = t('meta.description');

  return {
    // `absolute`, because `[locale]/layout.tsx` templates every other title as
    // "%s · Shehu Dental" — which on the practice's own front page would write
    // the name twice.
    title: { absolute: title },
    description,
    // The one indexable surface this deployment has. `robots.ts` shuts the door
    // on everything else; this opens it here, explicitly, so the two are never
    // read as an oversight in either direction.
    robots: { index: true, follow: true },
    alternates: origin
      ? {
          canonical: `${origin}/${locale}`,
          // hreflang. A practice a short flight from Italy is read in three
          // languages, and without these Google picks one and serves it to
          // everybody.
          languages: Object.fromEntries(
            locales.map((other) => [other, `${origin}/${other}`]),
          ),
        }
      : undefined,
    openGraph: {
      type: 'website',
      title,
      description,
      siteName: contact.name,
      locale,
      ...(origin
        ? {
            url: `${origin}/${locale}`,
            images: [
              {
                url: `${origin}${PHOTOS.surgeryWide.src}`,
                width: PHOTOS.surgeryWide.width,
                height: PHOTOS.surgeryWide.height,
              },
            ],
          }
        : {}),
    },
  };
}

/** Schema.org weekday names, indexed the way `ClinicHours` stores them. */
const SCHEMA_DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/**
 * What a search engine is told about the practice.
 *
 * Built from the same rows the page prints, so the two cannot disagree — which
 * is the failure mode structured data usually has, where a hand-written block
 * keeps saying eight o'clock a year after the practice started opening at nine.
 *
 * **No `aggregateRating`.** The 4.9 on this page is Google's own figure and is
 * shown with Google's name attached. Restating it as this site's structured data
 * would be claiming it as the practice's own collected reviews, which is both
 * untrue and precisely what Google's guidelines on self-serving review markup
 * forbid. A number worth quoting is worth quoting honestly, in prose.
 */
function practiceJsonLd({
  name,
  origin,
  locale,
  phone,
  email,
  address,
  city,
  hours,
}: {
  name: string;
  origin: string;
  locale: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string;
  hours: SiteHours | null;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dentist',
    name,
    ...(origin ? { url: `${origin}/${locale}`, image: `${origin}${PHOTOS.surgeryWide.src}` } : {}),
    ...(phone ? { telephone: phone } : {}),
    ...(email ? { email } : {}),
    address: {
      '@type': 'PostalAddress',
      ...(address ? { streetAddress: address } : {}),
      addressLocality: city,
      addressCountry: 'AL',
    },
    availableLanguage: [...locales],
    ...(hours
      ? {
          openingHoursSpecification: hours.week
            .filter((day) => day.open)
            .map((day) => ({
              '@type': 'OpeningHoursSpecification',
              dayOfWeek: `https://schema.org/${SCHEMA_DAYS[day.weekday]}`,
              // `describeRanges` writes "08:00 – 19:00", and a day with a lunch
              // break writes two stretches separated by a comma. Only the outer
              // bounds are published: schema.org wants one opens/closes pair per
              // entry, and splitting a break into two entries is more precision
              // than a search result can show.
              opens: day.hours.slice(0, 5),
              closes: day.hours.slice(-5),
            })),
        }
      : {}),
  };
}

export default async function StorefrontPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('site');
  const { contact, hours } = await getSiteData();

  return (
    <>
      <Hero contact={contact} hours={hours} />
      {/*
       * Before the treatment grid, because it is the way into it. A reader who
       * knows what is wrong but not what it is called gets taken to the right
       * card in one press; a reader who already knows scrolls past six pills
       * and loses nothing. Putting it after the grid would make it a summary of
       * something already read, which is the one thing it is not for.
       */}
      <ConcernPicker />
      <Treatments />
      {/*
       * Between what the practice does and who does it: the evidence sits
       * between the claim and the person making it, which is the order an
       * argument goes in. It is also the page's second navy, arriving after two
       * long cream sections and well clear of the navy strip further down —
       * putting it next to that strip merged the two into one dark block and
       * lost both.
       */}
      <HowWeWork />
      <Practice />
      {/*
       * The strip used to sit directly under the hero, on the reasoning that the
       * page needed something moving before the reader's attention went. It was
       * the wrong reasoning twice over. The hero is a film loop now, so the page
       * is already moving when it opens — and a band of slogans arriving two
       * seconds after the headline reads as an advertisement interrupting itself.
       * Worse, it announced the practice's claims ("the plan in writing", "the
       * price said up front") before the page had shown a single thing to back
       * them up, which is the order a leaflet uses and not the order a case is
       * made in.
       *
       * Here it comes *after* the treatments have been listed and the practice
       * has explained how it works — so the six phrases are a summary of
       * something the reader has just been shown rather than a promise made to a
       * stranger. It also lands where the page genuinely does need a change of
       * pace: two long cream sections have gone by, and this is the first navy
       * since the hero.
       */}
      <BrandStrip />

      {/*
       * The one ornament on this page, and it is here because this is where the
       * page runs longest without changing its ground.
       *
       * `Practice`, the strip, the gallery and the comparison are four cream
       * sections in a row — the longest unbroken stretch in the document, sitting
       * between the navy of `HowWeWork` and the navy of `SocialGrid`. Dropping a
       * dark band into the middle of that run breaks it in half and is nowhere
       * near either of the other two, which is the constraint that decided this
       * position rather than any argument about meaning. The same band placed one
       * section earlier or later would touch a navy at one end and merge with it,
       * which is the mistake `BrandStrip` was moved off navy to stop making.
       *
       * It also lands on the one seam that reads well: the strip above it is the
       * practice's own words sliding past, and the gallery below is photographs.
       * An arch of teeth between them is the subject itself, with nothing being
       * claimed about it — see `DentalArch` for why a page that has rejected
       * drawings of teeth three times can carry this one.
       */}
      <DentalArch />

      <Gallery />

      {/*
       * The one thing on this page that is a demonstration rather than a claim,
       * and it sits after the gallery because that is where a reader is already
       * looking at pictures. It is also, deliberately, a simulation and says so
       * on the page — see `BeforeAfter` for why a stock "before" beside a stock
       * "after" is the one placeholder this page will not print.
       */}
      <BeforeAfter />
      <SocialGrid />
      {/*
       * Directly before "visit us", which is where the question it answers gets
       * asked. A good share of these patients are flying in, and what decides
       * whether they come is not what a crown costs but whether the trip has to
       * be made twice — so the planner sets up the address, the map link and the
       * "coming from abroad?" card rather than repeating them.
       *
       * Cream rather than the navy it was drafted in: `SocialGrid` above it is
       * navy, and two dark bands running together would lose the break that
       * makes either of them land.
       */}
      <TripPlanner />
      <VisitUs contact={contact} hours={hours} showTravelCard={false} />

      <script
        type="application/ld+json"
        // Allowed by the app's CSP through `'unsafe-inline'`, which is already
        // there for Next's own hydration bootstrap. Nothing here is executed —
        // `application/ld+json` is data — and nothing in it comes from a visitor.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            practiceJsonLd({
              name: contact.name,
              origin: siteOrigin(),
              locale,
              phone: contact.phone,
              email: contact.email,
              address: contact.address,
              city: t('city'),
              hours,
            }),
          ),
        }}
      />
    </>
  );
}
