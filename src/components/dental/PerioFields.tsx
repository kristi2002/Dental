'use client';

import { Droplet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState } from 'react';
import {
  MOBILITY_GRADES,
  MOBILITY_LABEL,
  PERIO_SITE_COUNT,
  PERIO_SITES,
  perioLayout,
  POCKET_MAX,
  pocketBand,
  toPocketDepth,
  type PerioSummary,
} from '@/lib/perio';
import { cn } from '@/lib/utils';

/**
 * Where a periodontal examination is actually typed: six depths, six bleeding
 * ticks and a mobility grade, laid out the way the mouth is rather than the way
 * the column is.
 *
 * A perio examination is dictated. One person probes and calls "three, two,
 * four — bleeding", the other writes. So the boxes are built to be *typed
 * through* rather than clicked into: a digit fills the box and moves to the
 * next one by itself, and backspace on an empty box steps back. Depths run to
 * two digits, so a lone `1` waits to see whether a `2` follows it — every other
 * digit is complete the moment it is pressed and can advance immediately.
 *
 * The rows sit in the same order as the strip under the tooth on the chart:
 * cheek side away from the bite, mesial end towards the midline. Somebody
 * checking a typed reading against the chart is comparing two pictures of the
 * same six numbers, and they have to be the same picture.
 */

/** Depths are 1–15, so only a leading `1` can still be growing. */
function isComplete(value: string): boolean {
  return value.length >= 2 || (value.length === 1 && value !== '1');
}

export function PerioFields({ summary, toothNum }: { summary: PerioSummary; toothNum: number }) {
  const t = useTranslations('teeth');
  const uid = useId();
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  /**
   * The six boxes as typed so far, held rather than left to the DOM.
   *
   * Controlled for one reason: a reading has to look like what it means *as it
   * is typed*. A 7 that only turns red once the form has been saved and
   * reopened is a warning arriving after the moment it was for — and a mistyped
   * 7 is exactly the thing that colour is there to catch.
   */
  const [depths, setDepths] = useState<string[]>(() =>
    Array.from({ length: PERIO_SITE_COUNT }, (_, site) => String(summary.depths[site] ?? '')),
  );

  const { buccal, lingual, buccalFirst } = perioLayout(toothNum);

  /** The six boxes in the order a hand moves across them — which is the order
   *  they are drawn, not the order they are stored. */
  const typingOrder = buccalFirst ? [...buccal, ...lingual] : [...lingual, ...buccal];

  function step(site: number, by: 1 | -1) {
    const at = typingOrder.indexOf(site);
    boxes.current[typingOrder[at + by]]?.focus();
    boxes.current[typingOrder[at + by]]?.select();
  }

  const rows: Array<{ label: string; sites: number[] }> = [
    { label: t('perioBuccal'), sites: buccal },
    { label: t('perioLingual'), sites: lingual },
  ];

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="field-label">{t('perioDepths')}</legend>

        <div className="space-y-2.5">
          {(buccalFirst ? rows : [rows[1], rows[0]]).map((row) => (
            <div key={row.label} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-[0.85rem] leading-tight font-semibold text-ink-soft">
                {row.label}
              </span>

              <div className="flex gap-2">
                {row.sites.map((site) => {
                  const band = pocketBand(toPocketDepth(depths[site]));
                  // Bleeding is recorded at a site a probe went into. With no
                  // depth beside it the tick is a stray click, and the save
                  // drops it — so the control says so rather than accepting a
                  // mark it will not keep.
                  const probed = depths[site] !== '';

                  return (
                    <div key={site} className="flex flex-col items-center gap-1">
                      <input
                        ref={(node) => {
                          boxes.current[site] = node;
                        }}
                        id={`${uid}-depth-${site}`}
                        name={`depth${site}`}
                        value={depths[site]}
                        aria-label={t('perioDepthAt', { site: t(`site_${PERIO_SITES[site]}`) })}
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={2}
                        className={cn(
                          'h-11 w-11 rounded-lg border-2 text-center text-[1.1rem] font-bold tabular-nums',
                          'focus:border-brand-dark focus:outline-none',
                          band === 'DISEASED'
                            ? 'border-danger bg-danger-soft text-danger'
                            : band === 'WATCH'
                              ? 'border-warn bg-warn-soft text-warn'
                              : 'border-line-strong bg-surface text-ink',
                        )}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) => {
                          // Digits only, and never a reading no mouth produces —
                          // a stray keypress must not become a 55mm finding the
                          // summary then shouts about.
                          //
                          // A leading zero goes the same way. `0mm` is not a
                          // shallow pocket, it is the absence of one, and the
                          // save drops it — so the box refuses it as it is typed
                          // rather than showing a green `0` that quietly is not
                          // there when the examination is reopened.
                          const typed = event.target.value
                            .replace(/\D/g, '')
                            .replace(/^0+/, '')
                            .slice(0, 2);
                          const next =
                            Number.parseInt(typed, 10) > POCKET_MAX ? typed.slice(0, 1) : typed;

                          setDepths((current) =>
                            current.map((value, index) => (index === site ? next : value)),
                          );
                          if (isComplete(next)) step(site, 1);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Backspace' && event.currentTarget.value === '') {
                            event.preventDefault();
                            step(site, -1);
                          }
                        }}
                      />

                      {/* Bleeding rides with its own depth rather than in a row
                          of its own: the two are called out together — "four,
                          bleeding" — and a separate row means counting along to
                          find which box the tick belongs to. */}
                      <label
                        className={cn(
                          'flex items-center justify-center rounded-md border px-1.5 py-0.5',
                          probed
                            ? 'cursor-pointer border-line-strong text-ink-faint hover:border-danger'
                            : 'cursor-not-allowed border-line text-ink-faint/40',
                          'has-checked:border-danger has-checked:bg-danger-soft has-checked:text-danger',
                        )}
                      >
                        <input
                          type="checkbox"
                          name={`bop${site}`}
                          value="1"
                          disabled={!probed}
                          defaultChecked={summary.bleeding[site] === true}
                          className="sr-only"
                        />
                        <Droplet size={13} aria-hidden />
                        <span className="sr-only">
                          {t('perioBleedingAt', { site: t(`site_${PERIO_SITES[site]}`) })}
                        </span>
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-2 text-[0.85rem] text-ink-faint">{t('perioHint')}</p>
      </fieldset>

      <fieldset>
        <legend className="field-label">{t('mobility')}</legend>
        <div className="flex flex-wrap gap-2">
          {/* An explicit "not assessed" rather than defaulting to 0: a tooth
              nobody has pressed is not a tooth known to be firm, and the chart
              must not report one as the other. */}
          <label
            className={cn(
              'cursor-pointer rounded-lg border border-line-strong px-3 py-2 text-[0.92rem] font-semibold',
              'hover:border-ink has-checked:border-brand has-checked:bg-brand-soft has-checked:text-brand-deep',
            )}
          >
            <input
              type="radio"
              name="mobility"
              value=""
              defaultChecked={summary.mobility === null}
              className="sr-only"
            />
            {t('mobilityUnknown')}
          </label>

          {MOBILITY_GRADES.map((grade) => (
            <label
              key={grade}
              className={cn(
                'cursor-pointer rounded-lg border border-line-strong px-3 py-2 text-[0.92rem] font-semibold',
                'hover:border-ink has-checked:border-brand has-checked:bg-brand-soft has-checked:text-brand-deep',
              )}
            >
              <input
                type="radio"
                name="mobility"
                value={grade}
                defaultChecked={summary.mobility === grade}
                className="sr-only"
              />
              <span className="font-bold tabular-nums">{MOBILITY_LABEL[grade]}</span>
              <span className="ml-1.5 font-normal text-ink-soft">{t(`mobility_${grade}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
