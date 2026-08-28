/**
 * The four pages the masthead links to, in the order it prints them.
 *
 * One array, read by three components on both sides of the network — the
 * masthead's own row (`SiteNav`, a client component), the phone menu behind it
 * (`SiteMenu`, also client) and the footer (`SiteFooter`, a server component).
 * Two lists of pages drift the first time one is added, and the drift is
 * invisible: a page reachable from the bar and not from the footer looks like a
 * footer nobody bothered with rather than like a bug.
 *
 * **It lives in a module of its own, and that is not tidiness.** It was declared
 * in `SiteNav` first, which carries `'use client'` — and every export of a
 * client module reaches a server component as a *client reference* rather than
 * as the value. `SITE_PAGES.map` in the footer would have thrown at render, on
 * the server, for a plain array of four objects. A file with no directive is
 * imported by whichever side asks for it, which is what a shared constant
 * wants.
 *
 * `key` is the `site.nav.*` key each is titled by, and not a label: the bar and
 * the footer are read in three languages and neither of them may hold English.
 *
 * This is the *navigation's* list. What is publicly readable is a different
 * question with a different answer, and it lives in `lib/site-paths.ts` — they
 * agree today and there is no reason they must.
 *
 * **`/gallery` was folded into `/practice` and `/abroad` took the slot.** The
 * first two were the same destination written twice — see the note on
 * `PhotoWall`. What replaced them is not another way of saying "the practice":
 * `/abroad` is the only page here addressed to somebody who is not in Albania,
 * and it answers the two things the rest of the bar cannot — how many trips a
 * treatment takes, and what happens after the last one. See the note on that
 * route for why it was carved out of `/visit` rather than invented.
 *
 * The order is a funnel and not an alphabet: what the practice does, who does
 * it, where the door is, and how you reach it from the other side of the
 * Adriatic. `/abroad` last because it is the most specific — a reader who needs
 * it knows they need it, and a reader who does not should not meet it first.
 */
export const SITE_PAGES = [
  { href: '/treatments', key: 'treatments' },
  { href: '/practice', key: 'practice' },
  { href: '/visit', key: 'visit' },
  { href: '/abroad', key: 'abroad' },
] as const;
