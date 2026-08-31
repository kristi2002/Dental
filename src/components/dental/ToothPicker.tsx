'use client';

import { useTranslations } from 'next-intl';
import { ToothDefs } from '@/components/dental/ToothDefsProvider';
import { ToothGlyph } from '@/components/dental/ToothGlyph';
import {
  DEFAULT_TOOTH_STATUS,
  PERMANENT_LOWER,
  PERMANENT_UPPER,
  PRIMARY_LOWER,
  PRIMARY_UPPER,
  isToothStatus,
  parseSurfaces,
  toothLabel as toothLabelFor,
  type ToothNumbering,
  type ToothStatus,
} from '@/lib/teeth';
import { cn } from '@/lib/utils';

/**
 * Which tooth, picked off a drawing of the mouth.
 *
 * Every form that needed a tooth asked for it as `<input type="number">` — FDI,
 * 11 to 48, with a hint explaining the numbering. That is the one field in the
 * app where a typo cannot be caught by anything downstream: 24 and 42 are both
 * valid teeth on opposite sides of the mouth, so a transposed pair of digits
 * produces a plan for the wrong quadrant and reads as perfectly correct.
 *
 * Here the answer is a button, and the button is a picture of the tooth. Where
 * the patient's chart is known it is drawn in too, so "the one with the caries"
 * is a thing you can point at rather than a number to remember.
 */
/**
 * Which teeth already carry something, for the pickers that tint a button by it.
 *
 * Deliberately *not* the chart's own `ToothRecordMap`. A picker is choosing a
 * tooth, not reading a record: it wants one colour per tooth and has no room
 * for the list of findings a tooth now holds. `headlineStatus` is what collapses
 * the list to the one that decides how the tooth reads at a glance.
 */
export type ChartedTeeth = Record<number, { status: string; surfaces: string }>;

export function ToothPicker({
  value,
  onChange,
  charted = {},
  numbering = 'FDI',
  includePrimary = false,
}: {
  value: number | null;
  onChange: (toothNum: number | null) => void;
  /** The patient's chart, so a flagged tooth is visible while choosing. */
  charted?: ChartedTeeth;
  numbering?: ToothNumbering;
  /** Milk teeth as well — set for a child. */
  includePrimary?: boolean;
}) {
  const t = useTranslations('teeth');
  const tc = useTranslations('common');

  const rows: Array<{ key: string; teeth: number[]; upper: boolean }> = [
    { key: 'upper', teeth: PERMANENT_UPPER, upper: true },
    ...(includePrimary
      ? [
          { key: 'upper-primary', teeth: PRIMARY_UPPER, upper: true },
          { key: 'lower-primary', teeth: PRIMARY_LOWER, upper: false },
        ]
      : []),
    { key: 'lower', teeth: PERMANENT_LOWER, upper: false },
  ];

  return (
    <div>
      <ToothDefs />

      <div className="overflow-x-auto rounded-lg border border-line bg-paper px-2 py-2">
        <div className="w-max space-y-1">
          {rows.map((row) => (
            <div key={row.key} className="flex items-stretch gap-0.5">
              {row.teeth.map((toothNum, index) => {
                const record = charted[toothNum];
                const status: ToothStatus =
                  record && isToothStatus(record.status) ? record.status : 'HEALTHY';
                const selected = value === toothNum;

                return (
                  <button
                    key={toothNum}
                    type="button"
                    aria-pressed={selected}
                    aria-label={t('tooth', { num: toothLabelFor(toothNum, numbering) })}
                    // Selecting the tooth already selected clears it — the same
                    // press that says "this one" says "actually, no tooth".
                    onClick={() => onChange(selected ? null : toothNum)}
                    className={cn(
                      'flex w-8 shrink-0 flex-col items-center rounded-md border-2 px-0.5 py-0.5 transition-colors',
                      // The midline, so a quadrant is countable at a glance.
                      index === row.teeth.length / 2 && 'ml-3',
                      selected
                        ? 'border-brand-dark bg-brand-soft'
                        : 'border-transparent hover:border-line-strong hover:bg-surface',
                    )}
                  >
                    {row.upper ? null : (
                      <span className="text-micro leading-none font-bold text-ink-faint tabular-nums">
                        {toothLabelFor(toothNum, numbering)}
                      </span>
                    )}
                    <span aria-hidden className="h-10 w-7">
                      {/* One status, because `ChartedTeeth` is one status:
                          a picker tints a tooth to say "something is recorded
                          here", not to reproduce the record. */}
                      <ToothGlyph
                        toothNum={toothNum}
                        findings={
                          status === DEFAULT_TOOTH_STATUS
                            ? []
                            : [{ status, surfaces: record?.surfaces ?? '' }]
                        }
                      />
                    </span>
                    {row.upper ? (
                      <span className="text-micro leading-none font-bold text-ink-faint tabular-nums">
                        {toothLabelFor(toothNum, numbering)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <p className="mt-1.5 flex items-center gap-2 text-meta text-ink-soft">
        {value === null ? (
          tc('none')
        ) : (
          <>
            <span className="font-bold text-ink">
              {t('tooth', { num: toothLabelFor(value, numbering) })}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onChange(null)}
            >
              {tc('clearFilters')}
            </button>
          </>
        )}
      </p>
    </div>
  );
}
