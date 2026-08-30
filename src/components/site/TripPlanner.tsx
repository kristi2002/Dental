'use client';

import { CalendarCheck, CalendarDays, Route } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Reveal } from '@/components/site/Reveal';
import { SectionEyebrow } from '@/components/site/SectionEyebrow';
import { useTopicChoice } from '@/components/site/TopicChoice';
import { Watermark } from '@/components/site/Watermark';
import { Link } from '@/i18n/navigation';
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
 *
 * ---
 *
 * **The shape: one instrument, not two floating things.** This was a bare
 * two-column grid — a wad of pills on the left, a white `.card` on the right —
 * and it read as cheap for reasons worth writing down, because they are the
 * reasons any tool on a page reads as cheap.
 *
 *   - **The columns could not balance.** Eleven pills are about 200px tall and
 *     the answer beside them is about 400px, so whichever state the section was
 *     in, one column ended in several hundred pixels of nothing. Both halves are
 *     inside one bordered panel now, so the panel has a height and the halves
 *     divide it instead of hanging in the section.
 *
 *   - **A ragged tag cloud is not a control.** Eleven pills of eleven different
 *     widths wrapping into three uneven rows is the shape of a blog's tag
 *     widget, and it also lied about the interaction: identical pills read as
 *     pick-one, and this is pick-several. They are a two-column list of rows
 *     with a real tick in each now — the same rectangle every time, and the
 *     control says what it does before it is pressed.
 *
 *   - **The answer had no surface of its own.** It was the app's default card,
 *     the one generic surface on a storefront where every other panel is
 *     considered. The read-out is navy now, with the same lamp and the same
 *     watermark as every other dark panel on this site: it is the instrument's
 *     screen, and it is the one dark object in a cream section rather than a
 *     ninth white box.
 *
 *   - **It skipped the page's own furniture.** No eyebrow, and less vertical
 *     padding than any section around it, so it sat tighter and read as a lesser
 *     thing than the sections it is more useful than. Both fixed.
 *
 * **No `GhostWord`.** Five of the eight sections on the visit page carry one
 * now, and a sixth stops being a texture and starts being a pattern. The eyebrow
 * and the panel carry the identity here.
 *
 * **The read-out keeps its three slots whatever is ticked.** "Months to finish"
 * used to be a figure that appeared and vanished, which moved everything under
 * it on every tick; the third gauge is *trips* instead, which is always 1 or 2
 * and is the single number this section exists to answer. Months has not been
 * dropped — it is a labelled line under the verdict, on the days it applies.
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
  const chosen = picked.length > 0;

  function toggle(key: TreatmentKey) {
    setPicked((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
    );
  }

  return (
    <section
      id="trip"
      // `clip` and never `hidden`, as everywhere on this storefront — see the
      // note under `.drift`. The padding is the section scale the rest of the
      // page uses; this had been two steps smaller than its neighbours.
      className="relative scroll-mt-20 overflow-clip px-5 py-20 sm:px-8 sm:py-24"
    >
      <div className="relative mx-auto w-full max-w-6xl">
        <Reveal>
          <SectionEyebrow className="text-gilt-deep">{t('trip.eyebrow')}</SectionEyebrow>
          <h2 className="type-section mt-5 max-w-[18ch] text-bone-ink">{t('trip.title')}</h2>
          <p className="mt-5 max-w-[58ch] text-[1.05rem] leading-relaxed text-bone-ink-soft">
            {t('trip.lede')}
          </p>
        </Reveal>

        {/*
         * One panel, divided — the picker on the cream half, the answer on the
         * dark one. `overflow-clip` is what lets the navy run to the panel's own
         * rounded corner instead of sitting inside it as a second box.
         */}
        <Reveal
          step={1}
          className="mt-12 overflow-clip rounded-2xl border border-bone-deep bg-bone-soft shadow-lift"
        >
          <div className="grid lg:grid-cols-[1.08fr_0.92fr]">
            {/*
             * A real fieldset of real checkboxes. The obvious build here is a row
             * of `aria-pressed` buttons, which looks identical and describes
             * something else — these are a set of choices that combine, which is
             * what a checkbox group is, and a screen reader announcing "3 of 11
             * selected" for free is the whole argument.
             */}
            {/*
             * The padding is on this wrapper and not on the `fieldset`, and that
             * is a real bug rather than a preference: a `legend` is laid out on
             * its fieldset's *top border*, above the padding box, so a bordered
             * fieldset with `p-8` puts its legend flush against the panel edge
             * with thirty-two pixels of air underneath it. Padding a plain
             * wrapper puts the legend back where it looks like it belongs, with
             * no `float` trick and no change to what the element means.
             */}
            <div className="min-w-0 p-6 sm:p-8">
              <fieldset className="min-w-0">
                <legend className="type-eyebrow text-gilt-deep">{t('trip.pick')}</legend>

                <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                  {TREATMENT_KEYS.map((key) => {
                    const on = picked.includes(key);
                    return (
                      <label
                        key={key}
                        className="trip-option"
                        // An attribute rather than a class, for the reason the
                        // status rail carries `data-tone` and the hours board
                        // carries `data-closed`: the stylesheet needs to know
                        // this too, and a state expressed only as a ternary in
                        // JSX is one CSS cannot read. See `.trip-option`.
                        data-on={on ? '' : undefined}
                      >
                        {/* Visually hidden, never `display: none` — the real
                            control is what carries the checked state, the
                            keyboard path and the group announcement.
                            `.trip-option:has()` is what puts the focus ring on
                            the row around it. */}
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(key)}
                          className="sr-only"
                        />
                        <span aria-hidden className="trip-tick" />
                        {t(`topics.${key}`)}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {/* Outside the fieldset, because it is not one of the choices —
                  and eleven toggles with no way back to nothing is a small
                  cruelty. Present only once there is something to clear, so the
                  control never sits there disabled explaining itself. */}
              {chosen ? (
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setPicked([])}
                    className="rounded-full px-3 py-1.5 text-[0.9rem] font-semibold text-bone-ink-soft underline underline-offset-4 transition-colors hover:text-bone-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gilt-deep"
                  >
                    {t('trip.clear')}
                  </button>
                </div>
              ) : null}
            </div>

            {/*
             * The answer, and the one dark object in a cream section.
             *
             * `aria-live="polite"` because the numbers change in place as
             * treatments are ticked and nothing else announces it — a sighted
             * reader sees three figures move, and without this a screen reader
             * user gets silence and has to go looking for what their tick did.
             */}
            <div
              aria-live="polite"
              className="relative flex flex-col overflow-clip bg-navy p-6 text-white sm:p-8"
            >
              <Watermark className="-top-12 -right-12 w-[13rem] text-white/[0.05]" />
              {/* The same lamp, at the same angle, as every other navy surface
                  on this site. Two dark panels lit from different corners read
                  as two sites. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_10%_-10%,var(--color-navy-soft),transparent_60%)]"
              />

              <div className="relative flex flex-1 flex-col">
                {/*
                 * Three gauges, always three, whether or not anything is ticked
                 * — an instrument reading "—" is obviously an instrument waiting
                 * for an input, where a paragraph of grey text in a white box is
                 * just an empty box. It is also what stops the panel changing
                 * height on the first tick.
                 */}
                <div className="trip-gauges">
                  <Gauge
                    icon={<CalendarCheck size={16} aria-hidden />}
                    label={t('trip.visits')}
                    value={chosen ? span(estimate.visits) : null}
                  />
                  <Gauge
                    icon={<CalendarDays size={16} aria-hidden />}
                    label={t('trip.days')}
                    value={chosen ? span(estimate.days) : null}
                  />
                  {/* Trips rather than months, because this is the number the
                      section exists for: somebody pricing a flight is deciding
                      whether they have to buy two. It is always 1 or 2, so the
                      slot is never empty and never moves. */}
                  <Gauge
                    icon={<Route size={16} aria-hidden />}
                    label={t('trip.tripsLabel')}
                    value={chosen ? String(estimate.trips) : null}
                  />
                </div>

                <div className="mt-7 border-t border-navy-line/60 pt-6">
                  {chosen ? (
                    <>
                      <p className="text-[1rem] leading-relaxed text-navy-ink">
                        {estimate.trips === 2 ? t('trip.twoTrips') : t('trip.oneTrip')}
                      </p>

                      {/* Months has not been dropped from the read-out, only
                          demoted out of a gauge that spent most of its life
                          empty. A labelled line on the days it applies. */}
                      {estimate.months[1] > 0 ? (
                        <p className="mt-4 flex items-baseline justify-between gap-4 text-[0.94rem] text-navy-ink-soft">
                          {t('trip.months')}
                          <span className="font-semibold tabular-nums text-white">
                            {span(estimate.months)}
                          </span>
                        </p>
                      ) : null}

                      {/*
                       * Only when every treatment ticked has a published floor.
                       * An empty price table — which is what ships today — means
                       * this never renders, and the section answers the question
                       * it can answer honestly rather than inventing the one it
                       * cannot. The whole argument is on `TREATMENT_PRICES`.
                       */}
                      {floor ? (
                        <p className="mt-5 border-t border-navy-line/60 pt-5">
                          <span className="font-display text-[1.8rem] tabular-nums text-white">
                            {t('trip.fromPrice', {
                              amount: new Intl.NumberFormat(locale, {
                                style: 'currency',
                                currency: floor.currency,
                                maximumFractionDigits: 0,
                              }).format(floor.total),
                            })}
                          </span>
                          {PRICES_REVIEWED ? (
                            <span className="mt-1 block text-[0.86rem] text-navy-ink-soft">
                              {t('trip.pricesReviewed', { date: PRICES_REVIEWED })}
                            </span>
                          ) : null}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="text-[1rem] leading-relaxed text-navy-ink-soft">
                      {t('trip.empty')}
                    </p>
                  )}
                </div>

                {/*
                 * The foot of the read-out: the way out, and the sentence that
                 * makes printing an estimate honest at all.
                 *
                 * `flex-1` with `justify-end` rather than a margin, because the
                 * picker beside this is eleven rows and the answer is rarely
                 * that tall — so there is slack, and the choice is whether it
                 * sits between the numbers and the button or below both. Below
                 * both reads as a panel somebody forgot to finish; pushed to the
                 * bottom, the button lands level with the last treatment row and
                 * the two halves read as one object.
                 *
                 * The caveat is *inside* the panel and under the button rather
                 * than orphaned beneath the section. It qualifies these numbers,
                 * so it belongs beside them — and in the empty state, where
                 * there is no button, it is what keeps the foot of the panel
                 * from being a slab of nothing.
                 */}
                <div className="mt-8 flex flex-1 flex-col justify-end gap-6">
                  {chosen ? (
                    <Link
                      href="/book"
                      // The first thing they ticked, so the booking page opens
                      // on something they actually said rather than on "I am not
                      // sure". It rides to the other route through
                      // `TopicChoice`, which lives on the storefront layout
                      // above both.
                      onClick={() => setTopic(picked[0])}
                      // `self-start`, or a flex column stretches the pill to the
                      // panel's full width and it stops reading as a button.
                      className="cta-fill group inline-flex min-h-13 self-start items-center gap-2.5 rounded-full bg-gilt px-7 text-[1rem] font-bold text-navy no-underline hover:text-bone focus-visible:text-bone focus-visible:outline-white"
                    >
                      <CalendarCheck size={18} aria-hidden />
                      {t('trip.ask')}
                    </Link>
                  ) : null}

                  <p className="text-[0.88rem] leading-relaxed text-navy-ink-soft">
                    {t('trip.caveat')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/**
 * One measurement on the read-out — a `dt`/`dd` pair, because that is what it
 * is, wrapped in a `div` so three of them can be a grid inside one `dl`.
 */
function Gauge({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  /** The figure, or `null` for an instrument nobody has given an input yet. */
  value: string | null;
  label: string;
}) {
  return (
    <div>
      <span aria-hidden className="block text-gilt">
        {icon}
      </span>
      {/* `dt` before `dd` in the markup, because a definition list requires it,
          and reversed in the flow so the figure reads above its label. Writing
          them the other way round renders identically and is invalid.

          The list is *here*, around the one pair, rather than around all three
          gauges outside: a `<dl>` may hold its pairs at most one `<div>` deep,
          and each gauge put them two down with the icon as a third sibling
          beside them — so none of the three was a definition list at all to a
          reader, on the front page and on the page written for somebody
          planning a trip from Italy. Three lists of one pair is the honest
          shape of what this actually is. */}
      <dl className="mt-3 flex flex-col-reverse">
        <dt className="mt-2 text-[0.82rem] leading-snug text-navy-ink-soft">{label}</dt>
        <dd
          className={cn(
            'font-display text-[clamp(1.75rem,4vw,2.4rem)] leading-none tabular-nums',
            value ? 'text-white' : 'text-navy-line',
          )}
        >
          {/* An em dash, and it is `aria-hidden` with the label left to speak:
              a screen reader reading "em dash, appointments" three times on
              arrival is noise, and the prompt underneath already says what the
              panel is waiting for. */}
          {value ?? <span aria-hidden>—</span>}
        </dd>
      </dl>
    </div>
  );
}
