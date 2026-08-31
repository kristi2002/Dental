'use client';

import { CalendarCheck, CheckCircle2, Paperclip, Sunrise, Sunset } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDateNames } from '@/components/shared/DateNamesProvider';
import { BookingCalendar } from '@/components/site/BookingCalendar';
import { RequestFiles } from '@/components/site/RequestFiles';
import { useTopicChoice } from '@/components/site/TopicChoice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { fromDateKey } from '@/lib/dates';
import { requestAppointment } from '@/lib/actions/site';
import { IDLE_STATE } from '@/lib/actions/types';
import {
  MIDDAY_MINUTES,
  REQUEST_LIMITS,
  REQUEST_TOPICS,
  type PreferredTime,
} from '@/lib/site-content';
import type { SiteBookingWindow } from '@/lib/site';

/**
 * The booking page's one form: when, and who.
 *
 * This is what the callback form grew into when it stopped being a panel that
 * slid over the page and became a route of its own. The fields are the same four
 * — a name, a number, optionally an address and a sentence — and two things
 * beside them are newer: the calendar, which asks the two questions the desk
 * used to have to ring back for, against the practice's own opening hours; and
 * `RequestFiles`, which takes the X-ray somebody already has in their hand
 * instead of making the desk ask for it by email afterwards.
 *
 * **It still does not book anything, and it says so three times.** In the lede
 * above the columns, on the plaque under the calendar, and again in the
 * confirmation. A form that looks like a booking and turns out to be a callback
 * request is how somebody misses an appointment they thought they had, and a
 * calendar makes that misreading far easier — which is exactly why the wording
 * had to get *more* explicit as the interface got more convincing, not less.
 *
 * **One `<form>`, two columns.** The day, the half-day and the details are one
 * submission, so they are one element; the columns are a grid on it rather than
 * two forms that would have to be reconciled somewhere. A second consequence
 * worth stating: everything here posts as ordinary named fields, so the action
 * reads `FormData` and nothing on the submit path depends on JavaScript having
 * run.
 *
 * **The day is optional, deliberately.** A visitor with no JavaScript gets the
 * current month and no way to page past it; somebody who simply has no
 * preference should not be made to invent one. Either way what arrives is the
 * request this form took before it had a calendar, which is why the columns are
 * not a wizard and why the submit button is never blocked on a date.
 *
 * The `website` field is a honeypot — hidden from people and from assistive
 * technology, left empty by every human being, filled in by most of the things
 * that are not. `requestAppointment` reports success and writes nothing when it
 * arrives full; a bot told that it failed comes back and tries a different
 * shape.
 */
export function BookingForm({
  window,
  className,
}: {
  /**
   * The next eight weeks. Null when the database could not be reached — the
   * page then drops the calendar entirely rather than drawing a grid of
   * guesses, and the form carries on as the callback request it has always
   * been. See `getBookingWindow`.
   */
  window: SiteBookingWindow | null;
  className?: string;
}) {
  const t = useTranslations('site');
  const dates = useDateNames();
  const [state, formAction] = useActionState(requestAppointment, IDLE_STATE);

  /** The chosen day as `YYYY-MM-DD`, or empty for "whenever suits you". */
  const [date, setDate] = useState('');
  const [half, setHalf] = useState<PreferredTime | ''>('');

  // Shared with `ConcernPicker` and every "ask about this" on the treatment
  // pages: somebody who said what brings them in should find the box already
  // filled in when they get here. Empty until they do, which is what the server
  // renders too.
  const { topic, setTopic } = useTopicChoice();

  /**
   * How many files were attached, kept here rather than in `RequestFiles`
   * because the confirmation outlives it: the panel below replaces the whole
   * form, input and all, and "we have your two files" is the half of the receipt
   * that says the upload actually arrived.
   */
  const [attached, setAttached] = useState(0);
  const onAttachedChange = useCallback((count: number) => setAttached(count), []);

  const headingRef = useRef<HTMLHeadingElement>(null);

  const chosen = useMemo(
    () => window?.days.find((day) => day.date === date) ?? null,
    [window, date],
  );

  /**
   * Which halves of the chosen day the practice is actually open for.
   *
   * A morning chip offered on a Wednesday the surgery opens at two is a
   * preference the desk cannot honour, and the reader finds that out on the
   * telephone rather than on the page. Derived from the same minute ranges the
   * opening hours are printed from, so the two can never disagree.
   */
  const halves = useMemo(() => {
    const ranges = chosen?.ranges ?? [];
    return {
      morning: ranges.some((range) => range.start < MIDDAY_MINUTES),
      afternoon: ranges.some((range) => range.end > MIDDAY_MINUTES),
    };
  }, [chosen]);

  // A half-day that has stopped existing must not stay ticked. Somebody who
  // asked for a morning and then moved to a Saturday that shuts at one would
  // otherwise submit a preference the disabled chip is no longer showing them.
  useEffect(() => {
    if (half && !halves[half]) setHalf('');
  }, [half, halves]);

  // The panel swaps to a confirmation in place, which a screen reader has no way
  // of noticing on its own — the button that was pressed is simply gone. Moving
  // focus to the new heading is what announces it.
  useEffect(() => {
    if (state.status === 'ok') headingRef.current?.focus();
  }, [state]);

  if (state.status === 'ok') {
    return (
      <div id="request" className={className}>
        <div className="book-sent mx-auto max-w-2xl rounded-2xl px-6 py-12 text-center sm:px-10 sm:py-16">
          <CheckCircle2 size={40} aria-hidden className="mx-auto text-gilt-deep" />
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="type-section mt-6 text-bone-ink"
          >
            {t('form.sentTitle')}
          </h2>

          {/* What they asked for, read back. A confirmation that repeats the day
              is the difference between "something was sent" and "we have
              Thursday" — and it is the last chance to correct the one thing
              this form can get wrong without anybody noticing. */}
          {chosen ? (
            <p className="mt-5 inline-flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 rounded-full border border-gilt/40 bg-gilt-soft/70 px-5 py-2.5 text-body font-semibold text-bone-ink">
              <CalendarCheck size={18} aria-hidden className="text-gilt-deep" />
              <span className="first-letter:uppercase">
                {dates.date(fromDateKey(chosen.date), 'weekdayLongDayMonthLongYear')}
              </span>
              {half ? <span className="text-bone-ink-soft">· {t(`book.half.${half}`)}</span> : null}
            </p>
          ) : null}

          {/* The receipt for the upload. A file that silently failed to attach
              is the one thing on this form somebody would never find out about
              — they pressed the button, they saw a confirmation, and the desk
              rings back asking for an X-ray they believe they already sent. */}
          {attached > 0 ? (
            <p className="mt-4 flex items-center justify-center gap-2 text-body font-semibold text-bone-ink">
              <Paperclip size={16} aria-hidden className="text-gilt-deep" />
              {t('form.sentFiles', { count: attached })}
            </p>
          ) : null}

          <p className="mx-auto mt-6 max-w-[46ch] text-body leading-relaxed text-bone-ink-soft">
            {t('form.sentBody')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      id="request"
      action={formAction}
      className={className}
    >
      {/* Not a person's field. `hidden` keeps it off the screen and out of the
          accessibility tree; `tabIndex` keeps it out of the keyboard's path even
          if a stylesheet fails to load. */}
      <div className="hidden" aria-hidden>
        <label htmlFor="request-website">Website</label>
        <input id="request-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.98fr)_minmax(0,1.02fr)] lg:gap-14">
        {/* --- One: when ----------------------------------------------------
         *
         * `lg:pt-8` is the panel's own padding, paid back. The details on the
         * right are inside a surface with 2rem of it, so without this the two
         * step labels — which are a numbered pair and read as one row — sit
         * 34 pixels out of line with each other, which is exactly the sort of
         * near-miss that makes a careful layout look careless.
         *
         * There is deliberately no `position: sticky` here, and it is worth
         * saying why: the obvious move is to pin this column while the reader
         * fills in the other, and it cannot work. The section around it carries
         * `overflow-clip` — which it must, because the ghost word behind the
         * type hangs off its box — and a clipping ancestor becomes the sticky
         * element's scrollport, so it would pin against a box that never
         * scrolls and simply never move. A class that does nothing is worse
         * than no class: the next person to read it believes the layout has a
         * behaviour it has never had.
         */}
        {window ? (
          <div className="lg:pt-8">
            <p className="book-step-label">
              <span aria-hidden className="book-step-number">
                01
              </span>
              {t('book.stepWhen')}
            </p>

            <h2 id="book-when" className="type-section mt-4 text-bone-ink">
              {t('book.whenTitle')}
            </h2>
            <p className="mt-3 max-w-[44ch] text-body leading-relaxed text-bone-ink-soft">
              {t('book.whenLede')}
            </p>

            <BookingCalendar
              className="mt-7"
              days={window.days}
              name="preferredDate"
              value={date}
              onPick={(next) => setDate((current) => (current === next ? '' : next))}
              labelledBy="book-when"
            />

            {/* --- The plaque -------------------------------------------------
             *
             * One line, and it is the line that keeps the calendar honest: what
             * was chosen, what time the practice is open that day, and the
             * reminder that none of it is booked yet. Before a day is picked it
             * says so rather than collapsing — a panel that appears out of
             * nowhere under a grid is a layout shift, and this one carries the
             * "we ring you back" sentence that has to be read *before* the
             * choice, not after it.
             */}
            <div className="book-chosen mt-5 rounded-2xl px-5 py-4" aria-live="polite">
              {chosen ? (
                <>
                  <p className="text-body font-bold text-bone-ink first-letter:uppercase">
                    {dates.date(fromDateKey(chosen.date), 'weekdayLongDayMonthLongYear')}
                  </p>
                  <p className="mt-1 text-body text-bone-ink-soft tabular-nums">
                    {t('book.openThatDay', { hours: chosen.hours })}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-body font-bold text-bone-ink">
                    {t('book.noDayTitle')}
                  </p>
                  <p className="mt-1 text-body text-bone-ink-soft">
                    {t('book.noDayBody')}
                  </p>
                </>
              )}
            </div>

            {/* --- Half a day -------------------------------------------------
             *
             * Deliberately not a list of times. Offering 09:20 on a public form
             * is a promise nobody has checked against the book, and the desk
             * would be ringing back to take it away. Morning or afternoon is the
             * most precise question a practice can answer before it has looked,
             * and each chip is disabled on a day the practice is not open for
             * that half.
             */}
            <fieldset className="mt-6 min-w-0 border-0" disabled={!chosen}>
              <legend className="field-label">{t('book.halfTitle')}</legend>

              <div className="mt-2 flex flex-wrap gap-2.5">
                <label className="half" data-state={half === '' ? 'chosen' : 'open'}>
                  <input
                    type="radio"
                    name="preferredTime"
                    value=""
                    checked={half === ''}
                    onChange={() => setHalf('')}
                    className="half-input"
                  />
                  <span className="half-face">{t('book.half.any')}</span>
                </label>

                <label
                  className="half"
                  data-state={half === 'morning' ? 'chosen' : halves.morning ? 'open' : 'closed'}
                >
                  <input
                    type="radio"
                    name="preferredTime"
                    value="morning"
                    checked={half === 'morning'}
                    disabled={!halves.morning}
                    onChange={() => setHalf('morning')}
                    className="half-input"
                  />
                  <span className="half-face">
                    <Sunrise size={16} aria-hidden />
                    {t('book.half.morning')}
                  </span>
                </label>

                <label
                  className="half"
                  data-state={
                    half === 'afternoon' ? 'chosen' : halves.afternoon ? 'open' : 'closed'
                  }
                >
                  <input
                    type="radio"
                    name="preferredTime"
                    value="afternoon"
                    checked={half === 'afternoon'}
                    disabled={!halves.afternoon}
                    onChange={() => setHalf('afternoon')}
                    className="half-input"
                  />
                  <span className="half-face">
                    <Sunset size={16} aria-hidden />
                    {t('book.half.afternoon')}
                  </span>
                </label>
              </div>
            </fieldset>
          </div>
        ) : (
          // No window means the database could not be reached. The calendar is
          // dropped rather than drawn from a default week — a public page
          // guessing at opening hours costs somebody a journey — and the column
          // says what to do instead.
          <div className="lg:pt-8">
            <p className="book-step-label">{t('book.stepWhen')}</p>
            <h2 className="type-section mt-4 text-bone-ink">{t('book.noCalendarTitle')}</h2>
            <p className="mt-3 max-w-[46ch] text-body leading-relaxed text-bone-ink-soft">
              {t('book.noCalendarBody')}
            </p>
          </div>
        )}

        {/* --- Two: who ------------------------------------------------------ */}
        <div className="book-panel rounded-2xl p-6 sm:p-8">
          <p className="book-step-label">
            <span aria-hidden className="book-step-number">
              02
            </span>
            {t('book.stepWho')}
          </p>

          <h2 className="type-section mt-4 text-bone-ink">{t('book.whoTitle')}</h2>
          <p className="mt-3 text-body leading-relaxed text-bone-ink-soft">
            {t('book.whoLede')}
          </p>

          <div className="mt-7 space-y-5">
            <div>
              <label htmlFor="request-name" className="field-label">
                {t('form.name')}
              </label>
              <input
                id="request-name"
                name="name"
                required
                maxLength={REQUEST_LIMITS.name}
                autoComplete="name"
                className="field-input"
              />
            </div>

            <div>
              <label htmlFor="request-phone" className="field-label">
                {t('form.phone')}
              </label>
              <input
                id="request-phone"
                name="phone"
                type="tel"
                required
                maxLength={REQUEST_LIMITS.phone}
                autoComplete="tel"
                className="field-input"
              />
              <p className="mt-1.5 text-meta text-bone-ink-soft">{t('form.phoneHint')}</p>
            </div>

            <div>
              <label htmlFor="request-email" className="field-label">
                {t('form.email')}{' '}
                <span className="font-normal text-bone-ink-soft">{t('form.optional')}</span>
              </label>
              <input
                id="request-email"
                name="email"
                type="email"
                maxLength={REQUEST_LIMITS.email}
                autoComplete="email"
                className="field-input"
              />
            </div>

            <div>
              <label htmlFor="request-topic" className="field-label">
                {t('form.topic')}
              </label>
              {/* Controlled rather than `defaultValue`, and that is the whole
                  reason the topic lives in a context: an uncontrolled select
                  cannot be changed by a button on another page. It still submits
                  as an ordinary form field. */}
              <select
                id="request-topic"
                name="topic"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                className="field-input"
              >
                <option value="">{t('form.topicAny')}</option>
                {REQUEST_TOPICS.map((option) => (
                  <option key={option} value={option}>
                    {t(`topics.${option}`)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="request-message" className="field-label">
                {t('form.message')}{' '}
                <span className="font-normal text-bone-ink-soft">{t('form.optional')}</span>
              </label>
              <textarea
                id="request-message"
                name="message"
                rows={4}
                maxLength={REQUEST_LIMITS.message}
                className="field-input resize-y"
              />
            </div>

            {/* --- What they already have ---------------------------------
             *
             * Under the message box on purpose: it is the attachment to the
             * sentence above it, and somebody who has written "here is the
             * X-ray from my dentist at home" should find the field for it in
             * the next place they look.
             *
             * Optional like everything below the telephone number. A form that
             * required a radiograph would turn away the nervous local patient
             * this practice mostly sees, in order to serve the visitor from
             * abroad who has one.
             */}
            <RequestFiles onCountChange={onAttachedChange} />

            {state.status === 'error' ? (
              <p
                role="alert"
                className="rounded-lg border border-danger bg-danger-soft px-4 py-3 font-semibold text-danger"
              >
                {state.message}
              </p>
            ) : null}

            {/* Bronze rather than the app's teal: this is the storefront's one
                call to action and it is the same button as the hero's. The
                utility classes land in a later layer than `btn-primary`, so they
                win. */}
            <SubmitButton
              label={t('form.submit')}
              pendingLabel={t('form.submitting')}
              icon={<CalendarCheck size={20} aria-hidden />}
              className="w-full border-gilt bg-gilt text-navy hover:border-gilt hover:bg-gilt"
            />

            <p className="text-meta leading-relaxed text-bone-ink-faint">
              {t('form.privacy')}
            </p>
          </div>
        </div>
      </div>
    </form>
  );
}
