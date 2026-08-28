import { ExternalLink, MapPin, Navigation } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { GhostWord } from '@/components/site/GhostWord';
import { Reveal } from '@/components/site/Reveal';
import { SectionEyebrow } from '@/components/site/SectionEyebrow';
import type { SiteContact } from '@/lib/site';

/**
 * The map, at the foot of the visit page.
 *
 * ⚠️ **This is the one third-party thing on the whole storefront, and it was a
 * deliberate exception rather than an oversight.** Every other byte this site
 * serves comes from its own origin — `next/font` self-hosts Poppins, the
 * barcode decoder's WebAssembly is copied into `public/` rather than pulled off
 * a CDN, there is no analytics and there was, until this section, no embedded
 * anything. `VisitUs` still says as much in its own note, and the argument it
 * makes is still a good one: a link out to whatever maps application the reader
 * already uses works on every device and reports nothing back to anybody.
 *
 * What that argument does not cover is the reader this page is actually for. A
 * link out is a link *away* — it hands somebody who is halfway to deciding to
 * the Google Maps app and hopes they come back. And "Rruga e Re, Vlorë" is a
 * street, not a doorway; a patient flying in with a taxi driver who does not
 * read Latin street names wants to see the pin, on the page, before they
 * travel. So the frame is here and the links out are here too, a thumb's width
 * to the left of it.
 *
 * **What it costs, said plainly.** Loading this section contacts Google, and
 * Google will know the reader looked at this page. That is why `frame-src` in
 * `next.config.ts` names exactly two Google hosts rather than being opened up,
 * why the frame is `loading="lazy"` so it is not fetched for somebody who never
 * scrolls this far, why `referrerPolicy` repeats the app's own `no-referrer`
 * rather than inheriting it, and why the note under the frame tells the reader
 * in words. Nothing else on this site may follow it through that hole without
 * making the same argument again.
 *
 * **No API key, and that is on purpose.** `output=embed` on an ordinary maps
 * URL is a plain document; the Maps Embed API would put a billable credential
 * in a public page and give the practice a console to keep an eye on for a
 * static pin. There is nothing here that needs one.
 *
 * Renders nothing at all without an address. A map section built around an
 * empty query is a frame showing the middle of the Atlantic.
 */
export async function ClinicMap({ contact }: { contact: SiteContact }) {
  const t = await getTranslations('site');
  const locale = await getLocale();

  if (!contact.address) return null;

  // Name *and* street, as everywhere else this site links to a map: the name is
  // what has a pin on it, and the street is what disambiguates if it does not.
  const query = `${contact.name} ${contact.address}`;
  const searchHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    query,
  )}`;
  // `hl` so the frame's own furniture is drawn in the language the rest of the
  // page is being read in — the site answers in three and a map captioned in a
  // fourth is the seam showing.
  const embedSrc = `https://www.google.com/maps?q=${encodeURIComponent(
    query,
  )}&hl=${encodeURIComponent(locale)}&z=16&output=embed`;

  return (
    <section
      id="map"
      // Cream, and the page's last section before a navy footer. `clip` and
      // never `hidden` — see the note under `.drift`.
      className="relative scroll-mt-20 overflow-clip px-5 py-20 sm:px-8 sm:py-24"
    >
      <GhostWord className="-left-[5vw] top-8 hidden text-navy/[0.045] lg:block">Locus</GhostWord>

      <div className="relative mx-auto w-full max-w-6xl">
        <Reveal>
          <SectionEyebrow className="text-gilt-deep">{t('pages.visit.map.eyebrow')}</SectionEyebrow>
          <h2 className="type-section mt-5 max-w-[16ch] text-bone-ink">
            {t('pages.visit.map.title')}
          </h2>
          <p className="mt-5 max-w-[56ch] text-[1.05rem] leading-relaxed text-bone-ink-soft">
            {t('pages.visit.map.lede')}
          </p>
        </Reveal>

        <div className="mt-12 grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-start lg:gap-10">
          <Reveal className="lg:sticky lg:top-28">
            {/* The address as type, above the frame rather than only inside it.
                A pin is not selectable and cannot be pasted into a taxi app;
                the line under it can. */}
            <p className="flex gap-3 text-[1.08rem] leading-relaxed font-semibold text-bone-ink">
              <MapPin size={20} aria-hidden className="mt-1 shrink-0 text-gilt" />
              <span>{contact.address}</span>
            </p>

            <div className="mt-7 flex flex-col gap-3">
              {/* Directions first and filled: somebody reading a map section on
                  a clinic's page is far more often working out how to get there
                  than confirming where it is. */}
              <a
                href={directionsHref}
                target="_blank"
                rel="noreferrer"
                className="cta-fill group inline-flex min-h-13 items-center justify-center gap-2.5 rounded-full bg-gilt px-7 text-[1rem] font-bold text-navy no-underline hover:text-bone focus-visible:text-bone"
              >
                <Navigation size={18} aria-hidden />
                {t('pages.visit.map.directions')}
              </a>

              <a
                href={searchHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-13 items-center justify-center gap-2.5 rounded-full border border-bone-deep bg-bone-soft px-7 text-[1rem] font-semibold text-bone-ink no-underline transition-colors hover:border-gilt"
              >
                <ExternalLink size={17} aria-hidden />
                {t('visit.openInMaps')}
              </a>
            </div>

            {/* The disclosure, in the place a reader is standing when the frame
                beside them loads — not in a policy page nobody opens. */}
            <p className="mt-7 border-t border-bone-deep pt-6 text-[0.92rem] leading-relaxed text-bone-ink-faint">
              {t('pages.visit.map.privacy')}
            </p>
          </Reveal>

          <Reveal step={1}>
            <div className="overflow-clip rounded-2xl border border-bone-deep bg-bone-soft shadow-lift">
              <iframe
                // Named, because an unlabelled frame is announced as "frame" and
                // nothing else — and this one is the only frame on the site.
                title={t('pages.visit.map.frameTitle', { clinic: contact.name })}
                src={embedSrc}
                // Not fetched at all for a reader who never scrolls this far,
                // which on a page this long is a good share of them.
                loading="lazy"
                // The app sends `Referrer-Policy: no-referrer` for every
                // response; saying it again on the element is what keeps it true
                // if that header is ever relaxed for something else.
                referrerPolicy="no-referrer"
                // Scripts, because a map that cannot run any is a grey square,
                // and popups so "View larger map" and the directions arrow still
                // go somewhere. Everything else is withheld: the frame cannot
                // navigate the page around it, submit a form, start a download
                // or lock the pointer.
                //
                // `allow-same-origin` is deliberately *not* here. The reflex is
                // to grant it alongside `allow-scripts` because most embeds
                // break without it — this one was checked and does not, pin,
                // labels, zoom and all. Granting both is also the pairing that
                // makes a sandbox worth nothing against a same-origin frame,
                // which is what the linter objects to and it is right to.
                sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
                className="block h-[21rem] w-full border-0 sm:h-[26rem] lg:h-[31rem]"
              />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
