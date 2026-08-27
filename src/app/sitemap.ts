import type { MetadataRoute } from 'next';
import { PUBLIC_PATHS } from '@/lib/site-paths';
import { locales, routing } from '@/i18n/routing';

/**
 * Fifteen URLs: the five public pages, in each of the three languages they are
 * written in.
 *
 * Nothing else in this app belongs in a sitemap — every other route is either
 * behind a sign-in or addressed to one person by a signed token. A sitemap
 * listing forty screens that all answer with a redirect to the login pad would
 * be a list of things a crawler is being asked to try and refused.
 *
 * The list of what *is* public lives in `lib/site-paths.ts`, which `robots.ts`
 * reads too. Two hand-maintained lists of the same five paths is how a page ends
 * up in the sitemap and refused by the robots file at the same time — a
 * contradiction a crawler resolves by ignoring the sitemap entry.
 *
 * The `alternates` block is the half that matters. Without it a search engine
 * sees three pages saying much the same thing in three languages and has to
 * guess whether they are translations or duplicates; with it, an Italian reader
 * is offered the Italian page and the three do not compete with one another. It
 * repeats what the `<link rel="alternate">` tags on the page itself say, which
 * is deliberate — the two are read by different parts of the pipeline.
 *
 * Empty when `NEXT_PUBLIC_APP_URL` is unset: a sitemap of `localhost` URLs is
 * worse than no sitemap, and that variable is a **build**-time one, so a
 * deployment that forgot it has a rebuild to do anyway (see `docs/DEPLOYMENT`).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || '';
  if (!origin) return [];

  return PUBLIC_PATHS.flatMap((path) => {
    // The same page in the other two languages, which is what stops a search
    // engine reading three translations as three near-duplicates and picking one
    // to show everybody.
    const languages = Object.fromEntries(
      locales.map((locale) => [locale, `${origin}/${locale}${path}`]),
    );

    return locales.map((locale) => ({
      url: `${origin}/${locale}${path}`,
      changeFrequency: 'monthly' as const,
      // The front page leads, and within a page the practice's own language
      // leads. The other two are the same page and say so through `alternates`,
      // so this is a ranking hint rather than a claim that one is more current
      // than another.
      priority:
        (path === '' ? 1 : 0.8) * (locale === routing.defaultLocale ? 1 : 0.9),
      alternates: { languages },
    }));
  });
}
