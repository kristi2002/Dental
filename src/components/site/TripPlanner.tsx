'use client';

import { CalendarCheck, CalendarDays, Repeat } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useTopicChoice } from '@/components/site/TopicChoice';
import {
  estimateTrip,
  PRICES_REVIEWED,
  priceFloor,
  TREATMENT_KEYS,
  type TreatmentKey,
} from '@/lib/site-content';
import { cn } from '@/lib/utils';

/**
 * How long a trip to Vlorë would take, for somebody deciding whether to book a
 * flight.
 *
 * The practice already promises this in prose — `visit.travelBody` says "write
 * to us before you travel: we will tell you how many visits it takes, how many
 * days it keeps you here and what it costs". A good share of the patients here
 * fly in from Italy and the UK, and the question that decides whether they come
 * is not what a crown costs but whether they have to make the trip twice. This
 * answers that before they have to write to anybody.
 *
 * **What this deliberately does not do is quote a price.** That was the other
 * half of the request, and building it would have meant inventing two numbers:
 * a tariff this codebase does not hold, and a "standard European price" to
 * compare it against that nobody has sourced. `TREATMENT_TIMING` sets out the
 * whole argument. A calculator that tells a patient an implant is €X here
 * against €Y in Milan, with both figures made up, is not a marketing feature —
 * it is a fabricated comparison on a page somebody is using to make a medical
 * decision.
 *
 * ⚠️ **The timings are provisional.** They are ordinary textbook figures for
 * each procedure rather than this practice's own measured turnaround, and they
 * need Dr. Shehu's sign-off before this is shown to the public. That is why the
 * panel says, on the page and in every language, that the estimate is indicative
 * and confirmed in writing at the first visit — which is the practice's own
 * stated rule, not a disclaimer bolted on.
 *
 * **Ranges rather than a single figure**, everywhere. "Four to six days" is what
 * a dentist would actually say, and a page that answers "5 days" to a question
 * whose real answer is a range has stopped estimating and started promising.
 */
/** `[2, 2]` reads "2", `[2, 3]` reads "2–3". A range of one is not a range. */
function span([low, high]: readonly [number, number]): string {
  return low === high ? String(low) : `${low}–${high}`;
}

export function TripPlanner() {
  const t = useTranslations('site');
  const locale = useLocale();
  const { setTopic } = useTopicChoice();
  const [picked, setPicked] = useState<TreatmentKey[]>([]);

  const estimate = estimateTrip(picked);
  // Null unless the practice has published a floor for every treatment ticked —
  // see `TREATMENT_PRICES`. Nothing is guessed and no partial total is shown.
  const floor = priceFloor(picked);

  function toggle(key: TreatmentKey) {
    setPicked((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
    );
  }

  return (
    <section
      id="trip"
      className="scroll-mt-20 bg-bone-soft px-5 py-16 sm:px-8 sm:py-20"
    >
      <div className="mx-auto w-full max-w-6xl">
        <h2 className="type-section max-w-[20ch] text-bone-ink">
          {t('trip.title')}
        </h2>
        <p className="mt-5 max-w-[56ch] text-[1.03rem] leading-relaxed text-bone-ink-soft">
          {t('trip.lede')}
        </p>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:gap-12">
          {/*
           * A real fieldset of real checkboxes. The obvious build here is a row
           * of `aria-pressed` buttons, which looks identical and describes
           * something else — these are a set of choices that combine, which is
           * what a checkbox group is, and a screen reader announcing "3 of 8
           * selected" for free is the whole argument.
           */}
          <fieldset className="min-w-0">
            <legend className="text-[0.95rem] font-semibold text-bone-ink-soft">
              {t('trip.pick')}
            </legend>

            <div className="mt-4 flex flex-wrap gap-2">
              {TREATMENT_KEYS.map((key) => {
                const on = picked.includes(key);
                return (
                  <label
                    key={key}
                    className={cn(
                      'inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-[0.92rem] font-semibold transition-colors',
                      // `has-[:focus-visible]` puts the ring on the pill rather
                      // than on the input, which is visually hidden — without it
                      // a keyboard user tabbing through eight treatments gets no
                      // indication of where they are at all.
                      'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gilt-deep',
                      on
                        ? 'border-gilt-deep bg-gilt text-navy'
                        : 'border-bone-deep bg-bone text-bone-ink-soft hover:border-gilt hover:text-bone-ink',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(key)}
                      className="sr-only"
                    />
                    {t(`topics.${key}`)}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/*
           * The answer. `aria-live="polite"` because the numbers change in place
           * as treatments are ticked and nothing else announces it — a sighted
           * reader sees three figures move, and without this a screen reader
           * user gets silence and has to go looking for what their tick did.
           */}
          <div
            aria-live="polite"
            className="card p-6 sm:p-7"
          >
            {picked.length === 0 ? (
              <p className="text-[1rem] leading-relaxed text-bone-ink-soft">{t('trip.empty')}</p>
            ) : (
              <>
                <dl className="space-y-5">
                  <Figure
                    icon={<CalendarCheck size={18} aria-hidden />}
                    label={t('trip.visits')}
                    value={span(estimate.visits)}
                  />
                  <Figure
                    icon={<CalendarDays size={18} aria-hidden />}
                    label={t('trip.days')}
                    value={span(estimate.days)}
                  />
                  {/* Only when there is one. A row reading "0 months" on a
                      check-up and a filling is noise pretending to be data. */}
                  {estimate.months[1] > 0 ? (
                    <Figure
                      icon={<Repeat size={18} aria-hidden />}
                      label={t('trip.months')}
                      value={span(estimate.months)}
                    />
                  ) : null}
                </dl>

                {/*
                 * Only when every treatment ticked has a published floor. An
                 * empty price table — which is what ships today — means this
                 * never renders, and the section answers the question it can
                 * answer honestly rather than inventing the one it cannot. The
                 * whole argument is on `TREATMENT_PRICES`.
                 */}
                {floor ? (
                  <p className="mt-6 border-t border-bone-deep pt-5">
                    <span className="font-display text-[1.7rem] text-bone-ink tabular-nums">
                      {t('trip.fromPrice', {
                        amount: new Intl.NumberFormat(locale, {
                          style: 'currency',
                          currency: floor.currency,
                          maximumFractionDigits: 0,
                        }).format(floor.total),
                      })}
                    </span>
                    {PRICES_REVIEWED ? (
                      <span className="mt-1 block text-[0.86rem] text-bone-ink-faint">
                        {t('trip.pricesReviewed', { date: PRICES_REVIEWED })}
                      </span>
                    ) : null}
                  </p>
                ) : null}

                <p className="mt-6 border-t border-bone-deep pt-5 text-[0.95rem] leading-relaxed text-bone-ink">
                  {estimate.trips === 2 ? t('trip.twoTrips') : t('trip.oneTrip')}
                </p>

                <a
                  href="#request"
                  // The first thing they ticked, so the form opens on something
                  // they actually said rather than on "I am not sure".
                  onClick={() => setTopic(picked[0])}
                  className="mt-6 inline-flex min-h-12 items-center gap-2.5 rounded-full bg-gilt px-6 text-[0.96rem] font-bold text-navy no-underline transition-transform hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
                >
                  <CalendarCheck size={18} aria-hidden />
                  {t('trip.ask')}
                </a>
              </>
            )}

            {/* Shown whether or not anything is ticked. The estimate above is a
                range of ordinary figures for each procedure, and the sentence
                that makes publishing it honest is the practice's own rule: the
                plan and the price are agreed in writing at the first visit. */}
            <p className="mt-6 text-[0.87rem] leading-relaxed text-bone-ink-faint">
              {t('trip.caveat')}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** One figure and its label — a `dt`/`dd` pair, because that is what it is. */
function Figure({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-baseline gap-4">
      <span aria-hidden className="translate-y-1 text-gilt-deep">
        {icon}
      </span>
      {/* `dt` before `dd` in the markup, because a definition list requires it,
          and reversed in the flow so the figure reads above its label. Writing
          them the other way round renders identically and is invalid. */}
      <div className="flex flex-col-reverse">
        <dt className="mt-1.5 text-[0.9rem] text-bone-ink-soft">{label}</dt>
        <dd className="font-display text-[2rem] leading-none tabular-nums text-bone-ink">{value}</dd>
      </div>
    </div>
  );
}
