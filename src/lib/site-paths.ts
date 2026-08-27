/**
 * Every route in this deployment a stranger is allowed to read.
 *
 * There are five, and they are all storefront: the practice's front page and the
 * four pages the masthead links to. Everything else is a clinic's records system
 * behind a sign-in, or a link addressed to one person by a signed token.
 *
 * **It is one list because two lists disagree.** `robots.ts` refuses everything
 * by default and names the exceptions; `sitemap.ts` publishes the exceptions.
 * Written separately, the failure is silent and specific: a page ships, somebody
 * adds it to the sitemap, nobody remembers the robots file, and a crawler is
 * handed a URL it has been told not to fetch. It resolves that contradiction by
 * ignoring the sitemap entry, so the symptom is a page that simply never appears
 * in a search result and no error anywhere.
 *
 * Deliberately free of any import. Both files that read this are Next metadata
 * routes, and the value has to be usable at build time with no request in scope.
 *
 * Paths are written under the locale, with a leading slash — the empty string is
 * the front page, which is `/sq`, `/en` or `/it` once a locale is in front of it.
 * They are hard-coded rather than derived from `SITE_PAGES` because that array
 * carries the *masthead's* four links, which is a design decision about what a
 * navigation bar has room for; this is the list of what is public, which is a
 * security-adjacent one. The two happen to agree today and there is no reason
 * they must.
 */
export const PUBLIC_PATHS = ['', '/treatments', '/practice', '/gallery', '/visit'] as const;
