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
 * to read.
 *
 * **The booking link is `/visit#request`, not `#request`.** On the front page
 * the form is in the document and a bare fragment is right; here it is on
 * another route, and a link to a fragment that does not exist scrolls nowhere at
 * all. Written this way it works with no JavaScript — the browser loads the
 * visit page and lands on the form — and `BookDrawer` still intercepts it and
 * opens the panel in place for everybody else. See the note on its delegated
 * listener for why it matches on the end of the href rather than the whole of
 * it.
 *
 * The telephone row renders only where there is a number to ring. The practice's
 * details come out of Settings, and a page that prints "Telephone" over an empty
 * string is worse than one that prints nothing.
 */
export async function CtaBand({ contact }: { contact: SiteContact }) {
  const t = await getTranslations('site');

  return (
    <section className="relative overflow-clip bg-bone-soft px-5 py-18 sm:px-8 sm:py-24">
      <Watermark className="-bottom-28 -left-24 w-[28rem] text-gilt/[0.06]" />

      <div className="relative mx-auto w-full max-w-6xl">
        <Reveal className="mx-auto max-w-3xl text-center">
          <h2 className="type-section mx-auto max-w-[18ch] text-bone-ink">
            {t('pages.cta.title')}
          </h2>
          <p className="mx-auto mt-5 max-w-[52ch] text-[1.04rem] leading-relaxed text-bone-ink-soft">
            {t('pages.cta.body')}
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/visit#request"
              className="group inline-flex min-h-13 items-center gap-2.5 rounded-full bg-gilt px-7 text-[1rem] font-bold text-navy no-underline transition-transform hover:-translate-y-0.5 focus-visible:outline-gilt-deep motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              {t('nav.book')}
              <ArrowRight
                size={18}
                aria-hidden
                className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
              />
            </Link>

            {contact.telHref ? (
              <a
                href={contact.telHref}
                className="inline-flex min-h-13 items-center gap-2.5 rounded-full border border-bone-deep px-6 text-[1rem] font-semibold text-bone-ink no-underline transition-colors hover:border-gilt hover:bg-gilt-soft"
              >
                <Phone size={17} aria-hidden className="text-gilt-deep" />
                {contact.phone}
              </a>
            ) : null}

            {contact.whatsappHref ? (
              <a
                href={contact.whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-13 items-center gap-2.5 rounded-full border border-bone-deep px-6 text-[1rem] font-semibold text-bone-ink no-underline transition-colors hover:border-gilt hover:bg-gilt-soft"
              >
                <MessageCircle size={17} aria-hidden className="text-gilt-deep" />
                {t('visit.whatsappLabel')}
              </a>
            ) : null}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
