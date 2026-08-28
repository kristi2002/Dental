import { CalendarDays } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { GhostWord } from '@/components/site/GhostWord';
import { Reveal } from '@/components/site/Reveal';
import { SectionEyebrow } from '@/components/site/SectionEyebrow';
import { Watermark } from '@/components/site/Watermark';
import { dateNamesFor } from '@/lib/date-names';
import type { SiteHours } from '@/lib/site';

/**
 * The week, given a section of its own.
 *
 * The same seven rows `VisitUs` prints in the column beside its telephone tiles
 * — read straight out of `ClinicHours`, so a practice that decides to close at
 * two on Saturdays changes one screen in Settings and this is already true.
 * What changes here is the weight. On the front page the week is one fact among
 * several and a ruled list at reading size is the right amount of it. On the
 * page somebody opened *to find out when the door is open*, it is the subject,
 * and a nine-line list wedged between a heading and a telephone number is not
 * how a subject is set.
 *
 * **Navy, and that is the reason this exists as a section rather than a bigger
 * list.** The visit page runs cream from the clinic pitch to the map at the
 * foot of it, and a timetable is the one thing on it that genuinely wants to
 * read as a board — the object at a station, lit, with today's row picked out.
 * It also breaks the longest cream run on the page at exactly the point the
 * page changes subject, from what the practice is like to what it practically
 * does.
 *
 * **Today is filled, not striped.** `aria-current="date"` rather than a class,
 * so the row a reader is looking for first is announced as well as shaded, and
 * the chip beside the day names it in words — because colour is not read aloud
 * and `aria-current` is not read by every combination. The same rule the hours
 * list follows; see `.hours-board` in globals.css for why the fills are on the
 * cells rather than on the row.
 *
 * **No open/closed rail here.** The page already carries one, in the opening
 * band, where somebody who wants a single sentence finds it without scrolling.
 * A second live status four hundred pixels down is a second thing to keep in
 * step for no new information — and this section answers a different question
 * anyway: not *are you open now* but *when are you open at all*.
 */
export async function OpeningHours({ hours }: { hours: SiteHours }) {
  const t = await getTranslations('site');
  const locale = await getLocale();
  // Measured on the server, never in the browser: Chromium ships no Albanian
  // locale data and would rewrite "e hënë" as "Mon" after hydration. See
  // `lib/date-names.ts`.
  const names = dateNamesFor(locale);

  // From the rendered snapshot rather than a separate "today" field, as in
  // `VisitUs`: `OpenStatus` may have carried the page past midnight in the
  // reader's browser, but which of seven rows is shaded is not worth a client
  // component to keep in step.
  const todayWeekday = hours.now.weekday;

  // Whether any day this week is split by a lunch break. The footnote under the
  // board explains what a second range means, and a practice that works
  // straight through should not be shown an explanation of a thing it does not
  // do. `describeRanges` joins stretches with a comma — see `lib/site.ts`.
  const hasBreak = hours.week.some((day) => day.open && day.hours.includes(','));

  return (
    <section
      id="hours"
      // `seam` for the bronze wash at both edges every navy band on this site
      // carries, `clip` and never `hidden` for the reason given under `.drift`:
      // `hidden` would make this the scroll container for anything inside it on
      // a `view()` timeline, and freeze it.
      className="seam relative scroll-mt-20 overflow-clip bg-navy px-5 py-20 text-white sm:px-8 sm:py-24"
    >
      {/* Latin, untranslated, one per section — and hung off the left edge here
          because the board occupies the right half of this section at every
          width the word is drawn at. See `GhostWord`. */}
      <GhostWord className="-left-[4vw] top-12 hidden text-white/[0.05] lg:block">Horarium</GhostWord>

      <div className="relative mx-auto grid w-full max-w-6xl gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-start lg:gap-16">
        <Reveal>
          <SectionEyebrow className="text-gilt">{t('pages.visit.hours.eyebrow')}</SectionEyebrow>
          <h2 className="type-section mt-5 max-w-[15ch] text-white">
            {t('pages.visit.hours.title')}
          </h2>
          <p className="mt-5 max-w-[46ch] text-[1.05rem] leading-relaxed text-navy-ink">
            {t('pages.visit.hours.lede')}
          </p>

          {/* The one caveat worth printing beside a timetable, and it is printed
              rather than implied: a week of opening hours is not a list of free
              appointments, and somebody who reads it as one turns up to a full
              book. */}
          <p className="mt-7 flex gap-3.5 border-t border-navy-line/60 pt-6 text-[0.97rem] leading-relaxed text-navy-ink-soft">
            <CalendarDays size={19} aria-hidden className="mt-0.5 shrink-0 text-gilt" />
            {t('pages.visit.hours.note')}
          </p>
        </Reveal>

        <Reveal step={1} className="relative">
          {/* Behind the board rather than beside it: the tooth outline is the
              one ornament every navy panel on this site carries, at the same
              corner and the same weight. */}
          <Watermark className="-top-14 -right-10 w-[15rem] text-white/[0.04]" />

          <table className="hours-board relative">
            <caption className="sr-only">{t('pages.visit.hours.caption')}</caption>
            <tbody>
              {hours.week.map((day) => {
                const isToday = day.weekday === todayWeekday;
                return (
                  <tr
                    key={day.weekday}
                    aria-current={isToday ? 'date' : undefined}
                    // An attribute rather than a class for the same reason the
                    // status rail carries `data-tone`: the stylesheet needs to
                    // know a day is shut, and a condition expressed only as a
                    // ternary in JSX is one CSS cannot read.
                    data-closed={day.open ? undefined : ''}
                  >
                    <th scope="row">
                      {names.weekdayLong[day.weekday]}
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

          {hasBreak ? (
            <p className="mt-5 text-[0.92rem] leading-relaxed text-navy-ink-soft">
              {t('pages.visit.hours.breakNote')}
            </p>
          ) : null}
        </Reveal>
      </div>
    </section>
  );
}
