import { CalendarCheck, Mail, MessageCircle, Phone } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { GhostWord } from '@/components/site/GhostWord';
import { Reveal } from '@/components/site/Reveal';
import { SectionEyebrow } from '@/components/site/SectionEyebrow';
import { Link } from '@/i18n/navigation';
import type { SiteContact } from '@/lib/site';

/**
 * The four ways in, and which one is which.
 *
 * ⚠️ **The hole this fills is that `/visit` was a contact page carrying half the
 * practice's contacts.** `VisitUs` on the front page offers four routes in —
 * telephone, WhatsApp, the address, the email — and `SiteFooter` prints the
 * same four at the foot of every page on the site. This route, the one named
 * after reaching the practice and the one every "get in touch" points at, had
 * the address and the telephone number in its opening band and nothing else at
 * all. `contact.whatsappHref` and `contact.mailtoHref` have been on
 * `SiteContact` the whole time; nobody had put them here.
 *
 * That matters more than a missing row usually would. WhatsApp is not a
 * courtesy channel for this practice's patients — it is a free line from Italy
 * and Britain for people who would otherwise pay international call charges to
 * ask one question, and it is the channel that still works at eleven at night,
 * when the rail at the top of this page has just told somebody the clinic is
 * shut.
 *
 * **Four cards rather than four links, because the useful part is not the
 * number.** A reader who has scrolled this far knows the practice has a
 * telephone. What they do not know is which door to knock on for the thing they
 * actually want — and a page that lists four channels without saying makes
 * everybody ring, including the person who wanted an invoice. So each card
 * carries one line about when it is the right one: the telephone for today,
 * WhatsApp for abroad and after hours, email for anything that has to be in
 * writing, the booking page for choosing a day.
 *
 * ⚠️ **None of those four lines promises a reply, and that is deliberate.** "We
 * answer WhatsApp within an hour" is a service level, and a service level is the
 * practice's to set rather than a website's to invent — the argument written out
 * at length on `TREATMENT_GUARANTEES`. What is claimed here is true of the
 * *channel*: that `wa.me` is an ordinary HTTPS link costing nothing from abroad,
 * that email leaves a record. Nothing is said about what happens at the other
 * end.
 *
 * **The address and the telephone stay in the opening band as well, and that is
 * not a duplication to be tidied away.** The page's own header explains why:
 * somebody who followed a search result here is usually after exactly one line
 * of text, and making them scroll for it is the commonest way a contact page
 * fails. The band answers *what is the number*. This section answers *which of
 * these should I use*. They are different questions and the second is worth a
 * section.
 *
 * Cream, between the navy timetable above and the navy questions below.
 */
export async function ReachUs({ contact }: { contact: SiteContact }) {
  const t = await getTranslations('site');

  return (
    <section
      id="reach"
      // `clip` and never `hidden`, as everywhere on this storefront: see the
      // note under `.drift` in globals.css. Nothing inside is on a scroll
      // timeline today and the next thing put here must not have to discover
      // why that matters.
      className="relative scroll-mt-20 overflow-clip px-5 py-20 sm:px-8 sm:py-24"
    >
      {/* Latin, untranslated, one per section — the talking. */}
      <GhostWord className="-right-[5vw] top-8 text-navy/[0.045]">Colloquium</GhostWord>

      <div className="relative mx-auto w-full max-w-6xl">
        <Reveal>
          <SectionEyebrow className="text-gilt-deep">
            {t('pages.visit.reach.eyebrow')}
          </SectionEyebrow>

          <h2 className="type-section mt-5 max-w-[17ch] text-bone-ink">
            {t('pages.visit.reach.title')}
          </h2>

          <p className="mt-5 max-w-[58ch] text-[1.05rem] leading-relaxed text-bone-ink-soft">
            {t('pages.visit.reach.lede')}
          </p>
        </Reveal>

        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:gap-6">
          {/* Each renders only where the detail behind it exists, as everywhere
              on this site that touches `SiteContact`: a practice that has not
              filled in an email address gets three cards rather than a card
              offering a `mailto:` to nothing. */}
          {contact.telHref ? (
            <ChannelCard
              href={contact.telHref}
              icon={<Phone size={20} />}
              label={t('visit.callLabel')}
              value={contact.phone ?? ''}
              body={t('pages.visit.reach.phone')}
            />
          ) : null}

          {contact.whatsappHref ? (
            <ChannelCard
              href={contact.whatsappHref}
              external
              step={1}
              icon={<MessageCircle size={20} />}
              label={t('visit.whatsappLabel')}
              value={t('visit.whatsappValue')}
              body={t('pages.visit.reach.whatsapp')}
            />
          ) : null}

          {contact.mailtoHref ? (
            <ChannelCard
              href={contact.mailtoHref}
              step={2}
              icon={<Mail size={20} />}
              label={t('pages.visit.reach.emailLabel')}
              value={contact.email ?? ''}
              body={t('pages.visit.reach.email')}
            />
          ) : null}

          {/* Always present, and the only one of the four that is an internal
              route: the booking page is the practice's own calendar and does
              not depend on a settings row being filled in. `Link` rather than
              `<a>` so it carries the locale — see `i18n/navigation`. */}
          <ChannelCard
            internal
            href="/book"
            step={3}
            icon={<CalendarCheck size={20} />}
            label={t('nav.book')}
            value={t('pages.visit.reach.bookValue')}
            body={t('pages.visit.reach.book')}
          />
        </ul>
      </div>
    </section>
  );
}

/**
 * One channel.
 *
 * The whole card is the target rather than the value inside it, which is the
 * `contact-tile` rule one size up: on a telephone, a card that only responds
 * along the twelve pixels of a telephone number is a link that misses.
 *
 * `break-words` on the value because an email address at a narrow width is the
 * one string on this site long enough to push a card past the viewport.
 */
function ChannelCard({
  href,
  icon,
  label,
  value,
  body,
  step = 0,
  external = false,
  internal = false,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  value: string;
  body: string;
  step?: number;
  /** `wa.me` opens away from the site, so it opens in its own tab. */
  external?: boolean;
  /** An app route rather than a URL — routed through `Link`, for the locale. */
  internal?: boolean;
}) {
  const inner = (
    <>
      <span
        aria-hidden
        className="grid size-11 shrink-0 place-items-center rounded-full border border-gilt/50 bg-gilt-soft text-gilt-deep transition-colors group-hover:border-gilt"
      >
        {icon}
      </span>

      <span className="mt-5 block">
        <span className="contact-tile-label">{label}</span>
        <span className="contact-tile-value break-words text-bone-ink">{value}</span>
      </span>

      <span className="mt-3 block text-[1rem] leading-relaxed text-bone-ink-soft">{body}</span>
    </>
  );

  // `h-full` because the grid stretches the `li` to the tallest card in the row
  // and stops there — the anchor inside it keeps its own content height, so a
  // two-line card sitting beside a three-line one ends short of the row and the
  // pair reads as a ragged edge rather than as a row.
  const className =
    'card group flex h-full flex-col p-6 no-underline transition-colors hover:border-gilt sm:p-7';

  return (
    <Reveal as="li" step={step}>
      {internal ? (
        <Link href={href} className={className}>
          {inner}
        </Link>
      ) : (
        <a
          href={href}
          className={className}
          {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
        >
          {inner}
        </a>
      )}
    </Reveal>
  );
}
