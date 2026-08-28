import { ArrowRight, CalendarCheck, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { GhostWord } from '@/components/site/GhostWord';
import { PHOTOS, srcSetFor } from '@/components/site/photos';
import { SectionEyebrow } from '@/components/site/SectionEyebrow';
import { Watermark } from '@/components/site/Watermark';
import { Link } from '@/i18n/navigation';
import { dateNamesFor } from '@/lib/date-names';
import type { SiteContact, SiteHours } from '@/lib/site';
import { cn } from '@/lib/utils';

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
 * No embedded map *in this section*, and the address is a link out instead. It
 * works on every device, it opens whatever maps application the reader already
 * has, and it contacts nobody unless it is pressed — which on the front page,
 * where this section is one of nine and the reader has not asked to be shown a
 * map, is the whole of the argument.
 *
 * The visit page does now carry a real frame, at the foot of it, and `ClinicMap`
 * sets out why that reader is a different reader and what it cost in
 * `next.config.ts` to allow. This section is not it and should not grow one: two
 * maps of the same door is one more than there is a door.
 */
export async function VisitUs({
  contact,
  hours,
  showHours = true,
  showTravelCard = true,
}: {
  contact: SiteContact;
  hours: SiteHours | null;
  /**
   * Whether to print the week in the left-hand column.
   *
   * On by default, because on the front page this section *is* where the hours
   * are. The visit page turns it off: that route gives the week a navy section
   * of its own directly above this one — see `OpeningHours` — and two copies of
   * a timetable on one page is exactly the duplication the note above warns
   * about, arriving from the other direction.
   *
   * A flag rather than `hours={null}`, which would have done the same thing with
   * no new prop and is the wrong instruction: `null` means the practice has no
   * hours to show, and the day this component wants them for something else — a
   * badge on the booking panel, say — the visit page would silently lose it.
   */
  showHours?: boolean;
  /**
   * Whether to print the "coming from abroad" photo card under the address.
   *
   * On by default; the front page turns it off by request, since the page
   * already carries its own `TripPlanner` section further down that answers
   * the same question in more detail.
   */
  showTravelCard?: boolean;
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
    <section
      id="visit"
      // `relative` for the word, which is absolutely positioned, and
      // `overflow-clip` so it is cut at the section edge rather than hanging
      // over the footer. `clip` and never `hidden`: the "coming from abroad"
      // photograph inside is on a `view()` timeline, and `hidden` would freeze
      // it by making this its scroll container. See `.drift` in globals.css.
      //
      // No ground: the page wrapper carries the one cream for the whole
      // storefront, so the fixed light behind it runs through this section and
      // the two either side of it without a seam. See `(site)/layout.tsx`.
      className="relative scroll-mt-20 overflow-clip px-5 py-20 sm:px-8 sm:py-24"
    >
      {/* Top right, clear of the heading on the left and above the hours table
          rather than across it — a grey word behind a column of opening times
          is the one place on this page a texture would actually cost legibility.
          Latin, untranslated, one per section: see `GhostWord`. */}
      <GhostWord className="-right-[6vw] top-10 text-navy/[0.045]">Adventus</GhostWord>

      {/* `relative` so the column paints over the light. */}
      <div className="relative mx-auto w-full max-w-6xl">
        <SectionEyebrow className="text-gilt-deep">{t('visit.eyebrow')}</SectionEyebrow>
        <h2 className="type-lead mt-5 max-w-[14ch] text-bone-ink">{t('visit.title')}</h2>

        {/*
         * Facts on the left, the one thing to *do* on the right.
         *
         * The right-hand column held the request form itself while the
         * storefront had nowhere else to put it. Booking is a route now — see
         * `(site)/book/page.tsx` — and the form went with it, along with the
         * calendar it needed room for. What is left here is the door to it, and
         * the column narrowed to match: a panel with one button in it does not
         * need more width than a week of opening times.
         */}
        <div className="mt-12 grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <div>
            {/* --- Opening hours ------------------------------------------
             *
             * A ruled list on the section's own ground rather than a table in a
             * card. The same seven rows are drawn in the staff app inside a
             * box; on the front page a box makes them look like software.
             */}
            {hours && showHours ? (
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
              // The gap belongs to the week above, not to the tiles: with
              // `showHours` off these are the first thing in the column, and a
              // 2.25rem margin on the first child is 2.25rem of nothing under
              // the heading. See the `showHours` note on the signature.
              <div
                className={cn(
                  'grid gap-3 sm:grid-cols-2',
                  hours && showHours && 'mt-9',
                )}
              >
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

            {showTravelCard ? (
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
                  <h3 className="text-[1.05rem] font-bold text-bone-ink">
                    {t('visit.travelTitle')}
                  </h3>
                  <p className="mt-2 text-[0.99rem] leading-relaxed text-bone-ink-soft">
                    {t('visit.travelBody')}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {/* --- The door to the booking page ---------------------------
           *
           * Navy, and it is the only navy object in a cream section, which is
           * the whole of the design argument: this is the one thing on the page
           * a visitor can act on, and everything around it is a fact they read.
           * A third cream card here would have made three surfaces of equal
           * weight and no subject — the failure this section was rebuilt to fix
           * the first time.
           *
           * `self-start` so the panel is as tall as its own contents rather than
           * stretched to the height of the week beside it — a navy rectangle
           * with three hundred pixels of empty blue under the button reads as a
           * panel that failed to fill rather than as a panel.
           */}
          <div className="relative self-start overflow-clip rounded-2xl bg-navy p-7 text-white sm:p-9">
            <Watermark className="-top-16 -right-16 w-[16rem] text-white/[0.05]" />

            {/* The same lamp, at the same angle, as every other navy surface on
                this site. Two dark panels lit from different corners read as two
                sites. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_10%_-10%,var(--color-navy-soft),transparent_60%)]"
            />

            <div className="relative">
              <SectionEyebrow className="text-gilt">{t('visit.bookEyebrow')}</SectionEyebrow>

              <h3 className="type-section mt-5 max-w-[16ch] text-white">
                {t('visit.bookTitle')}
              </h3>
              <p className="mt-4 max-w-[42ch] text-[1.02rem] leading-relaxed text-navy-ink">
                {t('visit.bookBody')}
              </p>

              <Link
                href="/book"
                // The storefront's one call to action, in the class that owns
                // its hover outright rather than in the three utilities that
                // used to fight over it. See `.cta-fill` in globals.css.
                className="cta-fill group mt-8 inline-flex min-h-13 items-center gap-2.5 rounded-full bg-gilt px-7 text-[1rem] font-bold text-navy no-underline hover:text-bone focus-visible:text-bone focus-visible:outline-white"
              >
                <CalendarCheck size={18} aria-hidden />
                {t('nav.book')}
                <ArrowRight
                  size={17}
                  aria-hidden
                  className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                />
              </Link>

              {/* Not everybody wants a form. The number is already a tile on the
                  left of this section, and it is repeated here in reference
                  weight because this is the moment somebody decides between the
                  two — a line rather than a second button, so the pair above it
                  keeps its one obvious answer. */}
              {contact.telHref ? (
                <p className="mt-6 border-t border-navy-line/60 pt-5 text-[0.97rem] text-navy-ink-soft">
                  {t('visit.bookOrCall')}{' '}
                  <a
                    href={contact.telHref}
                    className="font-semibold text-white underline underline-offset-4 focus-visible:outline-white"
                  >
                    {contact.phone}
                  </a>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
