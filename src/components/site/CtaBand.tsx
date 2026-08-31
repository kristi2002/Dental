import { ArrowRight, MessageCircle, Phone } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Reveal } from '@/components/site/Reveal';
import { Watermark } from '@/components/site/Watermark';
import { Link } from '@/i18n/navigation';
import type { SiteContact } from '@/lib/site';

/**
 * The last thing on every page that is not the front page: ask, or ring.
 *
 * A deep page ends somewhere. On the front page that somewhere is the request
 * form itself — the whole document is built to arrive there — but a reader who
 * has just finished the treatments page or the gallery has reached the bottom of
 * something with no next move offered, and a page that ends in a footer is a
 * page that ends in an address and a language list.
 *
 * So: one band, the same on all four, carrying the two things this practice
 * actually wants somebody to do. It is the same pair the hero offers and in the
 * same order, which is deliberate — a reader who has scrolled a whole page
 * should meet a control they already recognise rather than a new one they have
 * to read. That recognition used to be an intention the copy stated and the
 * markup didn't keep: a bone-bordered pill on cream is not the control the hero
 * shows on navy, whatever the two are named. The panel below is `bg-navy` for
 * exactly that reason — it lets the telephone and WhatsApp pills be the hero's
 * own classes, not a cream-toned cousin of them, and it borrows the same
 * bronze-on-navy lamp `VisitUs` and `TripPlanner` already light every other dark
 * panel with, so a reader who has met either of those meets a third instance of
 * a rule rather than a fourth invention.
 *
 * **The booking link is a route, `/book`.** It was a bare `#request` while the
 * storefront was one document, then `/visit#request` while the form sat at the
 * foot of the visit page and a drawer caught the click. It is a page now, and
 * this is an ordinary link to it — which is the whole gain: no JavaScript on the
 * path, an address the browser's back button understands, and one thing to
 * change if the route ever moves.
 *
 * The telephone row renders only where there is a number to ring. The practice's
 * details come out of Settings, and a page that prints "Telephone" over an empty
 * string is worse than one that prints nothing.
 */
export async function CtaBand({ contact }: { contact: SiteContact }) {
  const t = await getTranslations('site');

  return (
    <section className="relative overflow-clip px-5 py-band-aside sm:px-8">
      <div className="relative mx-auto w-full max-w-4xl">
        <Reveal className="relative overflow-clip rounded-2xl bg-navy px-7 py-14 text-center shadow-lift sm:px-16 sm:py-band-aside">
          {/* Top right, the same corner the practice's mark sits in on every
              other navy panel — see `VisitUs` and `TripPlanner`. */}
          <Watermark className="-top-16 -right-16 w-[18rem] text-white/[0.05]" />

          {/* The same lamp, at the same angle, as every other navy surface on
              this site. Two dark panels lit from different corners read as two
              sites. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_10%_-10%,var(--color-navy-soft),transparent_60%)]"
          />

          <div className="relative">
            <h2 className="type-section mx-auto max-w-[18ch] text-white">
              {t('pages.cta.title')}
            </h2>
            <p className="mx-auto mt-5 max-w-[52ch] text-body leading-relaxed text-navy-ink">
              {t('pages.cta.body')}
            </p>

            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/book"
                // Same treatment as the hero's, and deliberately the same class
                // rather than the same three utilities written out again: this is
                // the one control the whole storefront exists to get pressed, and
                // it should not be able to drift out of step with itself between
                // the front page and the deep ones. See `.cta-fill`.
                className="cta-fill group inline-flex min-h-13 items-center gap-2.5 rounded-full bg-gilt px-7 text-body font-bold text-navy no-underline hover:text-bone focus-visible:text-bone focus-visible:outline-white"
              >
                {t('nav.book')}
                <ArrowRight
                  size={18}
                  aria-hidden
                  className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                />
              </Link>

              {/* The hero's own secondary-button classes, unchanged — a white
                  hairline on navy rather than the bone one this used to carry,
                  which is what makes it the same control rather than a
                  same-named one. */}
              {contact.telHref ? (
                <a
                  href={contact.telHref}
                  className="inline-flex min-h-13 items-center gap-2.5 rounded-full border border-white/30 px-6 text-body font-semibold text-white no-underline transition-colors hover:bg-white/10 focus-visible:outline-white"
                >
                  <Phone size={17} aria-hidden />
                  {contact.phone}
                </a>
              ) : null}

              {contact.whatsappHref ? (
                <a
                  href={contact.whatsappHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-13 items-center gap-2.5 rounded-full border border-white/30 px-6 text-body font-semibold text-white no-underline transition-colors hover:bg-white/10 focus-visible:outline-white"
                >
                  <MessageCircle size={17} aria-hidden />
                  {t('visit.whatsappLabel')}
                </a>
              ) : null}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
