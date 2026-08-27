import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { PHOTOS, srcSetFor } from '@/components/site/photos';
import { RequestForm } from '@/components/site/RequestForm';
import { dateNamesFor } from '@/lib/date-names';
import type { SiteContact, SiteHours } from '@/lib/site';

/**
 * Where the practice is, when it is open, and the two ways to reach it.
 *
 * The week table is read straight out of `ClinicHours` — the same seven rows the
 * free-slot search offers appointments from. That is the argument for building
 * this page inside the app rather than beside it: a practice that decides to
 * close at two on Saturdays changes one screen in Settings, and the public page
 * is already telling the truth. A separate marketing site would still be saying
 * four o'clock a year later.
 *
 * No embedded map. The app's `Content-Security-Policy` sets `frame-src 'none'`
 * and `connect-src 'self'`, so a Google Maps iframe cannot load and a tiles
 * request cannot be made — and neither is a regrettable limitation here. This
 * app carries no third-party anything by design; an address that is a link out
 * to whatever maps application the reader already uses is the version that works
 * on every device and reports nothing back to anybody.
 */
export async function VisitUs({
  contact,
  hours,
}: {
  contact: SiteContact;
  hours: SiteHours | null;
}) {
  const t = await getTranslations('site');
  const locale = await getLocale();
  // Measured on the server, never in the browser: Chromium ships no Albanian
  // locale data and would rewrite "e hënë" as "Mon" after hydration. See
  // `lib/date-names.ts`.
  const names = dateNamesFor(locale);

  // From the live payload's rendered snapshot rather than a separate "today"
  // field: `OpenStatus` may have moved the page past midnight in the reader's
  // browser, but which row of a seven-row table is shaded is not worth a client
  // component to keep in step.
  const todayWeekday = hours?.now.weekday;

  return (
    <section id="visit" className="scroll-mt-20 bg-bone px-5 py-20 sm:px-8 sm:py-24">
      <div className="mx-auto w-full max-w-6xl">
        <h2 className="type-lead max-w-[14ch] text-bone-ink">{t('visit.title')}</h2>

        {/*
         * The form gets the wider half. It is the only thing in this section a
         * visitor can *do* on the page itself — everything to its left is a fact
         * they read and act on somewhere else — and two equal columns had it
         * sharing weight with a table of opening times.
         */}
        <div className="mt-12 grid gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:gap-14">
          <div>
            {/* --- Opening hours ------------------------------------------
             *
             * A ruled list on the section's own ground rather than a table in a
             * card. The same seven rows are drawn in the staff app inside a
             * box; on the front page a box makes them look like software.
             */}
            {hours ? (
              <div>
                <h3 className="text-[1.05rem] font-bold text-bone-ink">
                  {t('visit.hoursTitle')}
                </h3>
                <table className="hours-list mt-4 text-[1rem]">
                  <caption className="sr-only">{t('visit.hoursTitle')}</caption>
                  <tbody>
                    {hours.week.map((day) => {
                      const isToday = day.weekday === todayWeekday;
                      return (
                        <tr
                          key={day.weekday}
                          // The row a reader is looking for first. `aria-current`
                          // rather than a class, so it is announced as well as
                          // shaded — the same rule the app's segmented controls
                          // follow, and what `.hours-list [aria-current]` styles.
                          aria-current={isToday ? 'date' : undefined}
                        >
                          <th scope="row">
                            {names.weekdayLong[day.weekday]}
                            {/* Colour is not announced and `aria-current="date"`
                                is not read by every combination, so the day the
                                reader wants says so in words as well. */}
                            {isToday ? (
                              <span className="hours-today-chip">{t('visit.todayLabel')}</span>
                            ) : null}
                          </th>
                          <td>{day.open ? day.hours : t('visit.closed')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}

            {/* --- The two things somebody actually does -------------------
             *
             * A telephone number is the conversion on a clinic's page and it had
             * been set at the same size, in the same row, as the email address.
             * These are tiles; the address and the email below them are lines.
             */}
            {contact.telHref || contact.whatsappHref ? (
              <div className="mt-9 grid gap-3 sm:grid-cols-2">
                {contact.telHref ? (
                  <a href={contact.telHref} className="contact-tile">
                    <Phone size={20} aria-hidden className="shrink-0 text-gilt-deep" />
                    <span className="min-w-0">
                      <span className="contact-tile-label">{t('visit.callLabel')}</span>
                      <span className="contact-tile-value">{contact.phone}</span>
                    </span>
                  </a>
                ) : null}

                {/* Offered beside `tel:` and for the reason `VisitUs` has always
                    given: `wa.me` is an ordinary HTTPS URL and works on any
                    machine with a browser, where `tel:` depends on what the
                    reader's device has registered. */}
                {contact.whatsappHref ? (
                  <a
                    href={contact.whatsappHref}
                    target="_blank"
                    rel="noreferrer"
                    className="contact-tile"
                  >
                    <MessageCircle size={20} aria-hidden className="shrink-0 text-gilt-deep" />
                    <span className="min-w-0">
                      <span className="contact-tile-label">{t('visit.whatsappLabel')}</span>
                      <span className="contact-tile-value">{t('visit.whatsappValue')}</span>
                    </span>
                  </a>
                ) : null}
              </div>
            ) : null}

            {/* --- Reference: where, and where to write -------------------- */}
            <div className="mt-7 space-y-3.5">
              {contact.address ? (
                <p className="contact-line">
                  <MapPin size={19} aria-hidden className="mt-0.5 shrink-0 text-gilt" />
                  <span>
                    {contact.address}
                    {' · '}
                    {/* A link out rather than an embed. The app's CSP sets
                        `frame-src 'none'` and `connect-src 'self'`, so a maps
                        iframe cannot load and a tiles request cannot be made —
                        and an address that opens whatever maps application the
                        reader already uses works on every device and reports
                        nothing back to anybody. */}
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        `${contact.name} ${contact.address}`,
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t('visit.openInMaps')}
                    </a>
                  </span>
                </p>
              ) : null}

              {contact.mailtoHref ? (
                <p className="contact-line">
                  <Mail size={19} aria-hidden className="mt-0.5 shrink-0 text-gilt" />
                  <a href={contact.mailtoHref}>{contact.email}</a>
                </p>
              ) : null}
            </div>

            {/* --- Coming from further away ------------------------------- */}
            <div className="mt-10 overflow-clip rounded-2xl border border-bone-deep bg-bone-soft">
              {/* The clip is on the photograph's own box rather than on the card,
                  which also holds the heading and the paragraph: `.drift` scales
                  from the centre, so on the card it would creep a few pixels
                  down over the type underneath it. */}
              <div className="drift-clip">
                {/* Fixed asset, pre-sized — see the note in `photos.ts`.
                    The one image below the fold with a `srcset`, because it is
                    also the heaviest file the site owns and it is drawn into a
                    strip 176px tall: the 1400px original was never going to be
                    the right answer at any viewport this column reaches. */}
                {/* eslint-disable-next-line next/no-img-element, @next/next/no-img-element */}
                <img
                  src={PHOTOS.vloreBay.src}
                  srcSet={srcSetFor(PHOTOS.vloreBay)}
                  sizes="(min-width: 1024px) 500px, calc(100vw - 2.5rem)"
                  width={PHOTOS.vloreBay.width}
                  height={PHOTOS.vloreBay.height}
                  alt={t('visit.bayAlt')}
                  loading="lazy"
                  decoding="async"
                  className="drift block h-44 w-full object-cover sm:h-52"
                />
              </div>
              <div className="p-5 sm:p-6">
                <h3 className="text-[1.05rem] font-bold text-bone-ink">{t('visit.travelTitle')}</h3>
                <p className="mt-2 text-[0.99rem] leading-relaxed text-bone-ink-soft">
                  {t('visit.travelBody')}
                </p>
              </div>
            </div>
          </div>

          <RequestForm />
        </div>
      </div>
    </section>
  );
}
