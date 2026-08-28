import { PHOTOS } from '@/components/site/photos';
import { locales } from '@/i18n/routing';
import type { SiteHours } from '@/lib/site';

/**
 * What a search engine is told about the practice, written once for the two
 * pages that have anything to tell it.
 *
 * This lived inside `(site)/page.tsx` and was the front page's private business
 * for as long as the front page was the only route carrying the practice's
 * details. `/visit` then became the page whose *entire content* is those
 * details — the address in the opening band, the week as a board, the pin at
 * the foot — and carried no markup at all. That is the wrong way round: the URL
 * a person searching "orari klinika dentare Vlorë" should land on was the one
 * URL saying nothing machine-readable about opening hours.
 *
 * ⚠️ **`@id` is the reason this is one module rather than two copies.** Two
 * pages each emitting a bare `Dentist` node describe *two dental practices* to a
 * crawler, which is worse than one page emitting nothing. The stable `@id`
 * below — the origin with a `#practice` fragment, a name for the business
 * rather than for a page — is what makes both emissions statements about the
 * same thing. Anything else on this site that grows structured data about the
 * practice must reuse it rather than mint another.
 *
 * **No `aggregateRating`, on either page.** The 4.9 the storefront prints is
 * Google's own figure and is shown with Google's name attached. Restating it as
 * this site's structured data would claim it as the practice's own collected
 * reviews, which is both untrue and precisely what Google's guidelines on
 * self-serving review markup forbid. A number worth quoting is worth quoting
 * honestly, in prose.
 */

/** Where this install actually answers, for canonicals and social cards. */
export function siteOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || '';
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
 * The practice, as a `Dentist`.
 *
 * Built from the same rows the page prints, so the two cannot disagree — which
 * is the failure mode structured data usually has, where a hand-written block
 * keeps saying eight o'clock a year after the practice started opening at nine.
 */
export function practiceJsonLd({
  name,
  origin,
  locale,
  phone,
  email,
  address,
  city,
  hours,
  /**
   * The URL of the page this copy is emitted on, when it is not the front page.
   * Written as `mainEntityOfPage` so a crawler holding two emissions of one
   * `@id` can still tell which document each came from.
   */
  page,
}: {
  name: string;
  origin: string;
  locale: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string;
  hours: SiteHours | null;
  page?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dentist',
    // The business, not the document — see the note at the top of this file.
    // Omitted rather than faked when the origin is unset: a relative `@id` is
    // not an identifier, and two pages agreeing on `'#practice'` across
    // different hosts would be a worse lie than no id at all.
    ...(origin ? { '@id': `${origin}/#practice` } : {}),
    name,
    ...(origin ? { url: `${origin}/${locale}`, image: `${origin}${PHOTOS.surgeryWide.src}` } : {}),
    ...(page ? { mainEntityOfPage: page } : {}),
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

/**
 * The questions and answers on `/visit`, as an `FAQPage`.
 *
 * Fed from the same array the section renders, for the reason the hours above
 * are fed from the same rows the board prints: markup that is written out by
 * hand beside a page is markup that stops being true the first time the page is
 * edited. Returns `null` for an empty list, so a route with no questions to
 * publish emits no script rather than an empty `mainEntity`.
 */
export function faqJsonLd(
  items: { question: string; answer: string }[],
): Record<string, unknown> | null {
  if (items.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}
