import { ArrowRight, MessageCircle, PhoneCall } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BookingForm } from '@/components/site/BookingForm';
import { GhostWord } from '@/components/site/GhostWord';
import { OpenStatus } from '@/components/site/OpenStatus';
import { PageHero } from '@/components/site/PageHero';
import { PHOTOS } from '@/components/site/photos';
import { Reveal } from '@/components/site/Reveal';
import { SectionEyebrow } from '@/components/site/SectionEyebrow';
import { Watermark } from '@/components/site/Watermark';
import { getBookingWindow, getSiteData } from '@/lib/site';
import { sitePageMetadata } from '@/lib/site-meta';

/**
 * Booking, as a page.
 *
 * It was a drawer for most of this storefront's life — every "book a visit"
 * anywhere on the site opened a panel that slid in over whatever the reader was
 * looking at, with the form inside it. That was the right shape while the form
 * was four fields and the storefront was one document: it kept somebody four
 * screens into the gallery from being thrown to the bottom of the page.
 *
 * It stopped being the right shape for three reasons, and they are worth writing
 * down because "make it a modal" is the reflex the drawer came from.
 *
 * **A panel cannot be linked to.** The single most valuable URL a clinic has is
 * the one it puts on a card, in an Instagram bio and at the end of a telephone
 * call — "shehudental.com/book". A drawer has no address, so there was nothing
 * to print. It is also nothing a search engine can index, which for a page whose
 * whole purpose is being found is the expensive half of that.
 *
 * **A panel cannot hold a calendar.** 34rem of width with a form already in it
 * leaves no room for a month grid, and the grid is the point: the practice's own
 * `ClinicHours` and `Closure` rows are on this page now, so a visitor picks a
 * day the door is actually open instead of the desk ringing back to ask. That is
 * two questions taken out of the call.
 *
 * **A panel over a page is a page a reader has half left.** The drawer's own
 * argument — don't lose their place — assumes booking is an interruption. On a
 * clinic's site it is the destination; everything else on the storefront exists
 * to get somebody here. Giving the errand a room of its own says that, and the
 * masthead's own back-link is how they return.
 *
 * **`dynamic = 'force-dynamic'`** for the reason the front page and the visit
 * page carry it: the open/closed sentence in the opening band has to be true at
 * the minute it is read, and the calendar's window must start at today rather
 * than at whichever day the page was last built. The rows behind both are cached
 * for five minutes — see `lib/site.ts` — so this costs a React render and no
 * database.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'site' });

  return sitePageMetadata({
    locale,
    path: '/book',
    title: t('pages.book.metaTitle'),
    description: t('pages.book.metaDescription'),
    image: PHOTOS.surgeryWide,
  });
}

export default async function BookPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('site');

  // Both in parallel: the contact details and the hours come out of one cached
  // read, and the eight-week window out of another. Neither depends on the
  // other, and a booking page that waited for them in turn would be two round
  // trips deep before it drew anything.
  const [{ contact, hours }, window] = await Promise.all([getSiteData(), getBookingWindow()]);

  return (
    <>
      <PageHero
        eyebrow={t('nav.book')}
        title={t('pages.book.title')}
        lede={t('pages.book.lede')}
        photo={PHOTOS.surgery}
      >
        <div className="flex flex-col gap-5">
          {/* The one sentence on this site that has to be true at the minute it
              is read, and on this page it is doing a second job: somebody who
              can see the practice is open right now has a better option than any
              form, and the number is a thumb's width below it. */}
          {hours ? (
            <div className="status-rail relative w-fit max-w-full overflow-clip rounded-2xl text-bone-ink">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2.5 px-5 py-4">
                <OpenStatus live={hours.live} initial={hours.now} />
              </div>
            </div>
          ) : null}

          {/* --- Ring, rather than write ---------------------------------
           *
           * On a page built around a form these are the controls that let
           * somebody not use it, and they are in the opening band rather than at
           * the foot for exactly that reason. A nervous person who came here to
           * telephone should not have to scroll past a calendar to find the
           * number.
           *
           * WhatsApp beside `tel:` for the reason every screen in this app
           * offers it: `wa.me` is an ordinary HTTPS URL and works on a desk
           * machine that has nothing registered for the telephone scheme.
           */}
          {contact.telHref || contact.whatsappHref ? (
            <div className="flex flex-wrap items-center gap-3">
              {contact.telHref ? (
                <a
                  href={contact.telHref}
                  className="inline-flex min-h-12 items-center gap-2.5 rounded-full border border-white/30 px-5 text-[1rem] font-semibold text-white no-underline transition-colors hover:bg-white/10 focus-visible:outline-white"
                >
                  <PhoneCall size={17} aria-hidden className="text-gilt" />
                  {contact.phone}
                </a>
              ) : null}

              {contact.whatsappHref ? (
                <a
                  href={contact.whatsappHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-12 items-center gap-2.5 rounded-full border border-white/30 px-5 text-[1rem] font-semibold text-white no-underline transition-colors hover:bg-white/10 focus-visible:outline-white"
                >
                  <MessageCircle size={17} aria-hidden className="text-gilt" />
                  {t('visit.whatsappLabel')}
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </PageHero>

      {/* --- The desk ------------------------------------------------------
       *
       * No ground of its own: the layout carries one cream for the whole
       * storefront and one fixed light behind it, so this section is
       * transparent and the light runs through it. See `(site)/layout.tsx`.
       *
       * `overflow-clip` and never `hidden` — the ghost word hangs off this box,
       * and `hidden` would make the section a scroll container and freeze every
       * `view()` timeline inside it. The whole argument is on `.drift` in
       * `globals.css`.
       */}
      <section
        id="desk"
        className="relative scroll-mt-24 overflow-clip px-5 py-16 sm:px-8 sm:py-20 lg:py-24"
      >
        {/* Latin, untranslated, one per section — the house rule in `GhostWord`.
            A long word on purpose: these bleed off the right edge by design, and
            a short one is cut into something that reads as a truncation rather
            than as a texture. */}
        <GhostWord className="-right-[7vw] top-6 text-navy/[0.04]">Horarium</GhostWord>
        <Watermark className="-bottom-32 -left-28 w-[26rem] text-gilt/[0.07]" />

        <div className="relative mx-auto w-full max-w-6xl">
          <Reveal className="max-w-3xl">
            <SectionEyebrow className="text-gilt-deep">{t('book.eyebrow')}</SectionEyebrow>
            <p className="mt-5 text-[1.06rem] leading-relaxed text-balance text-bone-ink-soft">
              {t('book.lede')}
            </p>
          </Reveal>

          <BookingForm className="mt-12" window={window} />
        </div>
      </section>

      {/* --- What happens next ---------------------------------------------
       *
       * Navy, and last. The page has asked somebody to hand over a telephone
       * number, and the question immediately after pressing the button is always
       * the same one: what now, and how long. Three sentences answer it, and the
       * band's own colour closes the page rather than letting the cream run into
       * the footer.
       *
       * It is deliberately not a call-to-action band. Every other deep page ends
       * with one because there is nothing else to do at the foot of it; this
       * page *is* the call to action, and a second "book a visit" four hundred
       * pixels under the form would be the site asking twice.
       */}
      <section className="relative overflow-clip bg-navy px-5 py-16 text-white sm:px-8 sm:py-20">
        <Watermark className="-top-24 -right-24 w-[24rem] text-white/[0.045]" />

        <div className="relative mx-auto w-full max-w-6xl">
          <Reveal>
            <SectionEyebrow className="text-gilt">{t('book.nextEyebrow')}</SectionEyebrow>
            <h2 className="type-section mt-5 max-w-[18ch] text-white">
              {t('book.nextTitle')}
            </h2>
          </Reveal>

          <ol className="mt-11 grid gap-6 sm:grid-cols-3 sm:gap-8">
            {(['one', 'two', 'three'] as const).map((step, index) => (
              <Reveal as="li" key={step} step={index} className="glass-card relative p-6">
                <p
                  aria-hidden
                  className="font-display text-[2.4rem] leading-none text-gilt/70 tabular-nums"
                >
                  {`0${index + 1}`}
                </p>
                <h3 className="mt-4 text-[1.08rem] font-bold text-white">
                  {t(`book.next.${step}.title`)}
                </h3>
                <p className="mt-2.5 text-[0.99rem] leading-relaxed text-navy-ink">
                  {t(`book.next.${step}.body`)}
                </p>
              </Reveal>
            ))}
          </ol>

          {/* Where to go if the answer to "what now" is "I would rather not
              wait". The same pair the opening band offers, repeated at the foot
              because this is where somebody who has read the three steps decides
              the form is not fast enough. */}
          {contact.telHref ? (
            <Reveal className="mt-10 flex flex-wrap items-center gap-3">
              <a
                href={contact.telHref}
                className="cta-fill group inline-flex min-h-13 items-center gap-2.5 rounded-full bg-gilt px-7 text-[1rem] font-bold text-navy no-underline hover:text-bone focus-visible:text-bone focus-visible:outline-white"
              >
                <PhoneCall size={18} aria-hidden />
                {t('book.callInstead')}
                <ArrowRight
                  size={17}
                  aria-hidden
                  className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                />
              </a>
            </Reveal>
          ) : null}
        </div>
      </section>
    </>
  );
}
