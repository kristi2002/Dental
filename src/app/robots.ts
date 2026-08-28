import type { MetadataRoute } from 'next';
import { PUBLIC_PATHS } from '@/lib/site-paths';
import { locales } from '@/i18n/routing';

/**
 * Six pages are public. Everything else is a clinic's records system.
 *
 * Until the storefront shipped there was no `robots.txt` at all, which was
 * survivable only because every screen behind `/[locale]/(app)` bounces a
 * signed-out visitor to the sign-in pad — a crawler could list the URLs and read
 * none of them. That is a weaker position than it sounds: a search result
 * reading "Patients · Shehu Dental" is an invitation, and the appointment
 * confirmation links carry a signature in the path.
 *
 * So the default is now "no", and the storefront is the exception — the front
 * page, the four pages the masthead links to and the booking page beside them,
 * in each of the three languages, which is the same list `sitemap.ts`
 * publishes. It has to be the same list:
 * a page in the sitemap that this file refuses is a page a crawler is told about
 * and then told not to fetch, and it resolves that by dropping the entry
 * silently. `lib/site-paths.ts` is the one place either of them reads.
 *
 * `$` anchors the match to the end of the path, which is what makes `/sq/visit`
 * allowed while `/sq/patients` stays refused; it is an extension rather than
 * part of the original standard, and it is honoured by Google and Bing, which is
 * the whole of the traffic this practice will ever see. A crawler that ignores
 * it falls back to `Disallow: /` and indexes nothing, which is the safe way
 * round for that to fail.
 *
 * `/api` is named separately rather than left to the blanket rule, because it is
 * the one prefix a crawler might reach without a locale in front of it.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || '';

  return {
    rules: [
      {
        userAgent: '*',
        // The locale-less root redirects into one of the pages below, and is
        // allowed so that the redirect is followed rather than refused.
        allow: [
          '/$',
          ...locales.flatMap((locale) =>
            PUBLIC_PATHS.map((path) => `/${locale}${path}$`),
          ),
        ],
        disallow: ['/', '/api/'],
      },
    ],
    ...(origin ? { sitemap: `${origin}/sitemap.xml`, host: origin } : {}),
  };
}
