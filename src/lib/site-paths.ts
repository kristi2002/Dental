/**
 * Every route in this deployment a stranger is allowed to read.
 *
 * There are six, and they are all storefront: the practice's front page, the
 * four pages the masthead links to, and the booking page its call-to-action
 * points at. Everything else is a clinic's records system behind a sign-in, or a
 * link addressed to one person by a signed token.
 *
 * **It is one list because two lists disagree.** `robots.ts` refuses everything
 * by default and names the exceptions; `sitemap.ts` publishes the exceptions.
 * Written separately, the failure is silent and specific: a page ships, somebody
 * adds it to the sitemap, nobody remembers the robots file, and a crawler is
 * handed a URL it has been told not to fetch. It resolves that contradiction by
 * ignoring the sitemap entry, so the symptom is a page that simply never appears
 * in a search result and no error anywhere.
 *
 * Paths are written under the locale, with a leading slash — the empty string is
 * the front page, which is `/sq`, `/en` or `/it` once a locale is in front of it.
 * They are hard-coded rather than derived from `SITE_PAGES` because that array
 * carries the *masthead's* four links, which is a design decision about what a
 * navigation bar has room for; this is the list of what is public, which is a
 * security-adjacent one. `/book` is the case that proves the point: it is one of
 * the most important pages on this site and it is deliberately not in the bar,
 * because it is the call to action beside it rather than a section of the
 * site.
 *
 * **The treatment pages are derived, and that is the opposite call made for a
 * reason.** There are eleven of them, they are generated from one route, and
 * nobody navigates to them from a bar — so there is no design decision here to
 * disagree with, only a list. Written out by hand, the failure is the silent one
 * this file exists to prevent: a twelfth treatment ships with a page a crawler
 * has been told not to fetch, and the symptom is a page that never appears in a
 * search result and no error anywhere.
 *
 * This is why the module now has one import where it had none. The constraint
 * that mattered was never "no imports" — it is that both readers are Next
 * metadata routes evaluated at build time with no request in scope, so nothing
 * here may reach for a database, a header or a session. `site-content.ts` is a
 * pure constants module with no server import of its own, which is exactly the
 * kind of thing that stays safe to read here.
 */

import { TREATMENT_KEYS, treatmentPath } from '@/lib/site-content';

export const PUBLIC_PATHS = [
  '',
  '/treatments',
  ...TREATMENT_KEYS.map(treatmentPath),
  '/practice',
  '/visit',
  '/abroad',
  '/book',
] as const;
