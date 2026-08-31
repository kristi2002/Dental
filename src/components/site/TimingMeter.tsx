import { CalendarCheck, CalendarDays, Repeat } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { CSSProperties } from 'react';
import { TIMING_SCALE, type TreatmentTiming } from '@/lib/site-content';
import { cn } from '@/lib/utils';

/**
 * What a treatment costs in time, drawn rather than listed.
 *
 * The figures themselves have been on this site since the trip planner shipped
 * — appointments, days in Vlorë, months to finish — and there they are a table
 * of numbers, which is the right shape for a planner somebody is ticking boxes
 * in. On a treatment's own entry a table is the wrong shape: the reader is not
 * comparing eight things, they are reading about one, and three numbers in a
 * column is the least memorable way to tell them a check-up is an afternoon and
 * an implant is a year.
 *
 * So each figure gets a bar as well as a number, and the bar is a fraction of
 * the longest any treatment here takes — see `TIMING_SCALE`, which computes
 * those maxima from the table rather than having somebody type them twice. The
 * effect is the one worth having: scrolling the eight entries, the bars are
 * short, short, short and then suddenly long, and that shape is the answer to
 * "what am I in for" before a single word has been read.
 *
 * **Months is text, not a bar.** Orthodontics runs to twenty-four and everything
 * else is nought to six, so a bar scaled to the longest would draw a stub for
 * every other treatment and say nothing at all. A row that only appears when
 * there is something to say is better than a row that says "0".
 *
 * The fill is animated by the same scroll-driven CSS the rest of the page uses —
 * see `.meter` in globals.css — so it grows as the entry arrives and costs no
 * JavaScript. A browser without scroll-driven animations draws the finished bar,
 * which is the rule every effect on this site follows.
 *
 * ⚠️ The numbers are provisional and are marked as such where they are defined.
 * `TREATMENT_TIMING` carries the whole warning; the page prints the practice's
 * own caveat under them.
 */

/** `[2, 2]` reads "2", `[2, 3]` reads "2–3". A range of one is not a range. */
function span([low, high]: readonly [number, number]): string {
  return low === high ? String(low) : `${low}–${high}`;
}

export async function TimingMeter({
  timing,
  /** `dark` on navy grounds — the track has to be lighter than what it sits on. */
  tone = 'light',
  className,
}: {
  timing: TreatmentTiming;
  tone?: 'light' | 'dark';
  className?: string;
}) {
  const t = await getTranslations('site');
  const dark = tone === 'dark';

  const rows = [
    {
      key: 'visits',
      icon: <CalendarCheck size={16} aria-hidden />,
      label: t('trip.visits'),
      value: span(timing.visits),
      // The upper bound against the longest upper bound anywhere in the table.
      // A floor of 8% so a one-appointment treatment still draws something: a
      // bar of zero width reads as missing data rather than as "the smallest
      // there is".
      fill: Math.max(8, (timing.visits[1] / TIMING_SCALE.visits) * 100),
    },
    {
      key: 'days',
      icon: <CalendarDays size={16} aria-hidden />,
      label: t('trip.days'),
      value: span(timing.days),
      fill: Math.max(8, (timing.days[1] / TIMING_SCALE.days) * 100),
    },
  ];

  return (
    <div className={cn('max-w-[26rem]', className)}>
      {/*
       * One `<dl>` per row, rather than one around all three.
       *
       * A `<dl>` may hold `<dt>`/`<dd>` pairs, optionally grouped a single
       * `<div>` deep — and nothing else. This had the pair *two* divs down, with
       * the meter as a third sibling beside them, so the terms were not in a
       * definition list at all as far as the parser was concerned and a screen
       * reader lost the pairing on all eleven treatment pages.
       *
       * The bar cannot go inside the group: it has to span the full width under
       * a row whose two halves are pushed apart, and it is `aria-hidden`
       * decoration in any case. So the list ends where the pair ends, and the
       * row that holds them both is an ordinary div. Nothing about the layout
       * changes — the flex classes simply moved up one element onto the `<dl>`.
       */}
      <div className="space-y-4">
        {rows.map((row) => (
          <div key={row.key}>
            <dl
              className={cn(
                'flex items-baseline justify-between gap-4',
                dark ? 'text-navy-ink' : 'text-bone-ink-soft',
              )}
            >
              <dt className="flex items-center gap-2 text-meta font-semibold tracking-[0.08em] uppercase">
                <span className={dark ? 'text-gilt' : 'text-gilt-deep'}>{row.icon}</span>
                {row.label}
              </dt>
              {/*
               * The sans face, not the page's display serif — and this is the
               * one figure on the storefront where that had to be argued.
               *
               * Prata's numeral one is a bare stem with a flag barely wider
               * than the hairline it is drawn with, and five of the eight
               * treatments here read "1". Set in the serif at this size it is
               * indistinguishable from a vertical rule: the row said
               * "Appointments |". The trip planner gets away with the serif
               * because it sets its figures at 2rem and beside a label rather
               * than beside a bar.
               *
               * It is also the correct call on its own terms. These are data,
               * not prose — the same distinction `.status-hours` in globals.css
               * draws for the four clock times in the opening rail, and the
               * reason `tabular-nums` is here too.
               */}
              <dd
                className={cn(
                  'text-title font-bold tabular-nums',
                  dark ? 'text-white' : 'text-bone-ink',
                )}
              >
                {row.value}
              </dd>
            </dl>

            <div
              aria-hidden
              className={cn('meter mt-2', dark && 'meter-dark')}
              style={{ '--fill': `${row.fill}%` } as CSSProperties}
            >
              <span className="meter-fill" />
            </div>
          </div>
        ))}
      </div>

      {/* Only when the answer is not "you are finished when you leave". */}
      {timing.months[1] > 0 ? (
        <p
          className={cn(
            'mt-5 flex items-start gap-2 text-body leading-relaxed',
            dark ? 'text-navy-ink' : 'text-bone-ink-soft',
          )}
        >
          <Repeat
            size={16}
            aria-hidden
            className={cn('mt-1 shrink-0', dark ? 'text-gilt' : 'text-gilt-deep')}
          />
          <span>
            <span className={cn('font-semibold', dark ? 'text-white' : 'text-bone-ink')}>
              {t('trip.months')}:
            </span>{' '}
            {span(timing.months)}
          </span>
        </p>
      ) : null}
    </div>
  );
}
