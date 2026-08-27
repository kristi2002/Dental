import type { Metadata } from 'next';
import { PHOTOS, type SitePhoto } from '@/components/site/photos';
import { locales } from '@/i18n/routing';
import { getSiteContact } from '@/lib/site';

/**
 * The head of every public page, built once.
 *
 * There are five of them now — the practice's front page and the four it grew —
 * and each needs the same four things done correctly: a canonical that is this
 * page rather than the front page, `hreflang` for the other two languages, an
 * `index, follow` that is explicit rather than inherited, and a social card. Any
 * one of those written five times is one that ends up right four times.
 *
 * **The canonical and the alternates are the half that matters.** This practice
 * publishes the same page in Albanian, Italian and English, and without
 * `alternates.languages` a search engine sees three near-duplicates and picks
 * one to show everybody. The site map says the same thing again, deliberately:
 * the two are read by different parts of the pipeline and neither is a
 * substitute for the other.
 *
 * **`robots` is set here rather than left to `robots.txt`.** The file at the
 * root refuses everything by default, because everything else in this
 * deployment is a clinic's records system — see `app/robots.ts`. The public
 * pages are the exception, and an exception is worth stating on each page it
 * applies to rather than leaving as an inference from a path pattern.
 *
 * Empty `alternates` and no `openGraph.url` when `NEXT_PUBLIC_APP_URL` is unset.
 * That variable is baked in at build time, and a canonical pointing at
 * `localhost` is worse than none: it tells a crawler the real page lives
 * somewhere it cannot reach.
 */
export async function sitePageMetadata({
  locale,
  /** The path under the locale, with a leading slash. Empty for the front page. */
  path,
  title,
  description,
  /** The social card. Defaults to the surgery, which is the one wide photograph. */
  image = PHOTOS.surgeryWide,
}: {
  locale: string;
  path: string;
  title: string;
  description: string;
  image?: SitePhoto;
}): Promise<Metadata> {
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || '';
  const { name } = await getSiteContact();
  const here = `${origin}/${locale}${path}`;

  return {
    // A bare string, so `[locale]/layout.tsx` templates it as "%s · Shehu
    // Dental". That is the right shape for a deep page and the wrong one for the
    // front page, which sets its own `absolute` title because it already carries
    // the practice's name at the front of the sentence — writing it twice is
    // exactly what `absolute` exists to prevent.
    title,
    description,
    robots: { index: true, follow: true },
    alternates: origin
      ? {
          canonical: here,
          languages: Object.fromEntries(
            locales.map((other) => [other, `${origin}/${other}${path}`]),
          ),
        }
      : undefined,
    openGraph: {
      type: 'website',
      // Spelled out rather than left to the template above: `openGraph.title` is
      // its own field and a card reading only "Treatments" says nothing about
      // whose treatments they are.
      title: `${title} · ${name}`,
      description,
      siteName: name,
      locale,
      ...(origin
        ? {
            url: here,
            images: [
              { url: `${origin}${image.src}`, width: image.width, height: image.height },
            ],
          }
        : {}),
    },
  };
}
