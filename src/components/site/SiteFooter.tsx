import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ClinicLogo } from '@/components/brand/ClinicLogo';
import { InstagramGlyph } from '@/components/site/InstagramGlyph';
import { SITE_PAGES } from '@/components/site/site-pages';
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from '@/components/site/photos';
import { Swash } from '@/components/site/Swash';
import { Watermark } from '@/components/site/Watermark';
import { Link } from '@/i18n/navigation';
import { localeLabels, locales } from '@/i18n/routing';
import type { SiteContact, SiteHours } from '@/lib/site';

/**
 * The one line of opening hours a footer should carry — or nothing.
 *
 * Monday to Friday, and only if all five say the same thing. Every practice this
 * size has a working week that is one shape and a Saturday that is another, so
 * the summary is right nearly always; the point of checking is the day it stops
 * being right. A footer is exactly where a wrong opening time survives longest,
 * because nobody proof-reads a footer after the week it was written.
 *
 * Weekdays are `1`–`5` in `ClinicHours`' own numbering, where `0` is Sunday.
 */
function weekdaySummary(hours: SiteHours): string | null {
  const weekdays = hours.week.filter((day) => day.weekday >= 1 && day.weekday <= 5);
  if (weekdays.length !== 5) return null;

  const first = weekdays[0];
  if (!first.open) return null;

  return weekdays.every((day) => day.open && day.hours === first.hours) ? first.hours : null;
}

/**
 * The foot of the public page — and the only door from it into the software.
 *
 * A footer on a clinic's site is not a legal afterthought; it is where somebody
 * who has scrolled the whole page and decided to come actually looks for the
 * address. So it repeats the things worth repeating — where, when, and the three
 * ways to make contact — rather than listing links to sections they have just
 * scrolled past.
 *
 * The staff link is deliberately quiet and deliberately present. Quiet, because
 * a patient has no use for it and a prominent "Staff login" on a clinic's front
 * page invites exactly the attention it should not. Present, because the people
 * who work here reach the app by typing the practice's address like everybody
 * else, and a front door with no handle sends them hunting for a URL they will
 * end up bookmarking wrongly.
 *
 * The year is not written anywhere here. A footer that says "© 2026" is a footer
 * that still says it in 2028 unless somebody remembers, and calling `new Date()`
 * in a server component to print four digits is not a trade worth making. The
 * practice's name on its own is true for as long as the practice is.
 */
export async function SiteFooter({
  contact,
  hours,
}: {
  contact: SiteContact;
  hours: SiteHours | null;
}) {
  const t = await getTranslations('site');

  return (
    <footer className="relative overflow-clip bg-navy text-navy-ink">
      <Swash className="rotate-180 opacity-40" />

      <Watermark className="-right-24 -bottom-32 w-[30rem] text-white/[0.04]" />

      <div className="relative mx-auto w-full max-w-6xl px-5 pt-10 pb-12 sm:px-8">
        <div className="grid gap-10 border-b border-navy-line pb-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {/* --- Who --------------------------------------------------- */}
          <div className="lg:col-span-1">
            <ClinicLogo variant="inverse" alt={contact.name} className="h-14 w-auto" />
            <p className="mt-5 max-w-[26ch] text-[0.97rem] leading-relaxed">{t('footer.blurb')}</p>

            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/25 px-4 text-[0.94rem] font-semibold text-white no-underline transition-colors hover:bg-white/10 focus-visible:outline-white"
            >
              <InstagramGlyph size={17} />@{INSTAGRAM_HANDLE}
            </a>
          </div>

          {/* --- Where ------------------------------------------------- */}
          <div>
            <h2 className="text-[0.78rem] font-semibold tracking-[0.2em] text-gilt uppercase">
              {t('visit.addressLabel')}
            </h2>
            {contact.address ? (
              <p className="mt-4 flex items-start gap-2.5 text-[0.97rem]">
                <MapPin size={18} aria-hidden className="mt-0.5 shrink-0 text-gilt" />
                <span>{contact.address}</span>
              </p>
            ) : null}
            {contact.address ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  `${contact.name} ${contact.address}`,
                )}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-[0.94rem] font-semibold text-white underline underline-offset-4"
              >
                {t('visit.openInMaps')}
              </a>
            ) : null}
          </div>

          {/* --- When -------------------------------------------------- */}
          <div>
            <h2 className="text-[0.78rem] font-semibold tracking-[0.2em] text-gilt uppercase">
              {t('visit.hoursTitle')}
            </h2>
            {hours ? (
              <ul className="mt-4 space-y-1.5 text-[0.95rem]">
                {/* Grouped rather than seven rows: a footer that reprints the
                    whole week table is a footer nobody reads.

                    But only when the week actually is one shape. `weekdaySummary`
                    returns null the moment Monday to Friday disagree, and then
                    this line disappears rather than printing "Monday to Friday:
                    08:00 – 19:00" over a Wednesday the practice shuts at two.
                    The link below is always there, and the real table it points
                    at is never wrong. */}
                {weekdaySummary(hours) ? (
                  <li className="flex items-start gap-2.5">
                    <Clock size={18} aria-hidden className="mt-0.5 shrink-0 text-gilt" />
                    <span>{t('footer.weekdays', { hours: weekdaySummary(hours) as string })}</span>
                  </li>
                ) : null}
                <li className={weekdaySummary(hours) ? 'pl-7' : ''}>
                  {/* A route rather than the fragment it was while the whole
                      storefront was one document: the week is on the visit page
                      now, and `#visit` resolves to nothing on four of the five
                      pages this footer appears under. */}
                  <Link href="/visit" className="text-white underline underline-offset-4">
                    {t('hours.seeWeek')}
                  </Link>
                </li>
              </ul>
            ) : null}
          </div>

          {/* --- How --------------------------------------------------- */}
          <div>
            <h2 className="text-[0.78rem] font-semibold tracking-[0.2em] text-gilt uppercase">
              {t('footer.reach')}
            </h2>
            <ul className="mt-4 space-y-2.5 text-[0.97rem]">
              {contact.telHref ? (
                <li className="flex items-center gap-2.5">
                  <Phone size={18} aria-hidden className="shrink-0 text-gilt" />
                  <a href={contact.telHref} className="text-white underline underline-offset-4">
                    {contact.phone}
                  </a>
                </li>
              ) : null}
              {contact.whatsappHref ? (
                <li className="flex items-center gap-2.5">
                  <MessageCircle size={18} aria-hidden className="shrink-0 text-gilt" />
                  <a
                    href={contact.whatsappHref}
                    target="_blank"
                    rel="noreferrer"
                    className="text-white underline underline-offset-4"
                  >
                    {t('visit.whatsapp')}
                  </a>
                </li>
              ) : null}
              {contact.mailtoHref ? (
                <li className="flex items-center gap-2.5">
                  <Mail size={18} aria-hidden className="shrink-0 text-gilt" />
                  <a
                    href={contact.mailtoHref}
                    className="break-all text-white underline underline-offset-4"
                  >
                    {contact.email}
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
        </div>

        {/*
         * The four pages, spelled out.
         *
         * A footer that lists the sections a reader has just scrolled past is
         * furniture, and this one deliberately did not have one for as long as
         * the storefront was a single document. Four routes is a different
         * thing: below `lg` the masthead has no room for them at all — they are
         * behind a menu button — so for a reader who has arrived at the bottom
         * of a page on a phone, this is the map.
         */}
        <nav aria-label={t('nav.sections')} className="mt-8 border-b border-navy-line pb-7">
          <ul className="flex flex-wrap gap-x-7 gap-y-2.5">
            {SITE_PAGES.map((page) => (
              <li key={page.href}>
                <Link
                  href={page.href}
                  className="inline-flex min-h-9 items-center text-[0.82rem] font-semibold tracking-[0.14em] text-navy-ink uppercase no-underline transition-colors hover:text-gilt focus-visible:outline-white"
                >
                  {t(`nav.${page.key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-7 flex flex-col gap-4 text-[0.88rem] text-navy-ink-soft sm:flex-row sm:items-center sm:justify-between">
          <p>{contact.name}</p>

          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {locales.map((locale, index) => (
                <span key={locale}>
                  {index > 0 ? <span aria-hidden> · </span> : null}
                  <span lang={locale}>{localeLabels[locale]}</span>
                </span>
              ))}
            </span>
            <span aria-hidden className="text-navy-line">
              |
            </span>
            <Link
              href="/dashboard"
              className="text-navy-ink-soft underline underline-offset-4 transition-colors hover:text-white focus-visible:outline-white"
            >
              {t('nav.staffSignIn')}
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
