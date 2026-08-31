'use client';

import { Eraser } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ToothSpan } from '@/components/works/ToothSpan';
import {
  PERMANENT_LOWER_LEFT,
  PERMANENT_LOWER_RIGHT,
  PERMANENT_UPPER_LEFT,
  PERMANENT_UPPER_RIGHT,
  type ToothQuadrant,
} from '@/lib/teeth';
import {
  formatToothSpan,
  parseToothSpan,
  spanDigit,
  spanElements,
  toggleSpanTooth,
} from '@/lib/tooth-span';
import { cn } from '@/lib/utils';

/**
 * Which teeth are going to the laboratory, chosen off the chart.
 *
 * This replaced a text box that took `3 x 4 x 7` and believed whatever was typed
 * into it. The notation was the practice's own and worked on paper, but as a
 * form field it had three faults: nothing checked that the teeth existed,
 * nothing could read it back — so the register could not answer "what did we
 * send for tooth 16" — and the element count beside it had to be worked out by
 * hand and typed in, which is the one number the whole register exists to get
 * right.
 *
 * So the chart is the field. It is the same cross the docket is printed with:
 * four quadrants of eight, the patient's right on the left of the screen, upper
 * arch above the line. Nothing to learn, because it is the drawing already on
 * the paper in front of whoever is filling this in.
 *
 * One press per position, cycling through the three things a position can be —
 * see `toggleSpanTooth`. The count follows from the selection and is never typed.
 */

const QUADRANTS: ReadonlyArray<{
  quadrant: ToothQuadrant;
  teeth: readonly number[];
  /** Which side of the cross this corner sits on, from `sm` up. */
  box: string;
  /** Right-hand quadrants are packed against the midline, left-hand ones away. */
  align: string;
}> = [
  {
    quadrant: 'UPPER_RIGHT',
    teeth: PERMANENT_UPPER_RIGHT,
    box: 'sm:border-r-2 sm:border-b-2 sm:pr-3 sm:pb-3',
    align: 'sm:ml-auto sm:text-right',
  },
  {
    quadrant: 'UPPER_LEFT',
    teeth: PERMANENT_UPPER_LEFT,
    box: 'sm:border-b-2 sm:pl-3 sm:pb-3',
    align: 'sm:mr-auto',
  },
  {
    quadrant: 'LOWER_RIGHT',
    teeth: PERMANENT_LOWER_RIGHT,
    box: 'sm:border-r-2 sm:pr-3 sm:pt-3',
    align: 'sm:ml-auto sm:text-right',
  },
  {
    quadrant: 'LOWER_LEFT',
    teeth: PERMANENT_LOWER_LEFT,
    box: 'sm:pl-3 sm:pt-3',
    align: 'sm:mr-auto',
  },
];

/** Nothing here, the tooth itself, or the gap where the tooth used to be. */
type PositionState = 'off' | 'tooth' | 'gap';

const STATE_STYLE: Record<PositionState, string> = {
  off: 'border-line-strong bg-surface text-ink-faint hover:border-ink hover:text-ink',
  tooth: 'border-brand bg-brand-soft text-brand-deep hover:border-brand-deep',
  // Amber, and the same amber the chart already uses for a crown: this position
  // is being *made*, which is exactly what the laboratory is billing for.
  gap: 'border-amber-400 bg-amber-100 text-amber-900 hover:border-amber-600',
};

export function ToothSpanPicker({
  value,
  onChange,
  labelledBy,
}: {
  /** The stored span, e.g. `17,16x,15`. */
  value: string;
  onChange: (next: string) => void;
  /** The id of whatever names this chart — the row's legend. */
  labelledBy?: string;
}) {
  const t = useTranslations('works');
  const tt = useTranslations('teeth');

  const positions = parseToothSpan(value);
  const stateOf = (toothNum: number): PositionState => {
    const position = positions.find((entry) => entry.toothNum === toothNum);
    if (!position) return 'off';
    return position.pontic ? 'gap' : 'tooth';
  };

  const press = (toothNum: number) => onChange(formatToothSpan(toggleSpanTooth(positions, toothNum)));

  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className="rounded-lg border border-line-strong bg-paper p-3"
    >
      {/* What a press does, before anyone presses anything. Three words and two
          swatches — the alternative is a chart whose second state is discovered
          by accident. */}
      <p className="mb-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-meta text-ink-soft">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn('inline-block size-4 rounded border', STATE_STYLE.tooth)}
          />
          {t('teethLegendTooth')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn('inline-block size-4 rounded border', STATE_STYLE.gap)} />
          {t('teethLegendGap')}
        </span>
        <span className="text-ink-faint">{t('teethHint')}</span>
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-0">
        {QUADRANTS.map((corner) => (
          <div
            key={corner.quadrant}
            className={cn('w-full max-w-[19rem] sm:border-line-strong', corner.box, corner.align)}
          >
            <p className="mb-1 text-micro font-bold tracking-wide text-ink-faint uppercase">
              {tt(`quadrant_${corner.quadrant}`)}
            </p>

            <div className="grid grid-cols-8 gap-1">
              {corner.teeth.map((toothNum) => {
                const state = stateOf(toothNum);
                return (
                  <button
                    key={toothNum}
                    type="button"
                    onClick={() => press(toothNum)}
                    aria-pressed={state !== 'off'}
                    aria-label={`${tt('tooth', { num: toothNum })}${
                      state === 'off' ? '' : ` — ${t(state === 'gap' ? 'teethLegendGap' : 'teethLegendTooth')}`
                    }`}
                    className={cn(
                      'grid aspect-square w-full min-w-0 place-items-center rounded-md border',
                      'text-meta font-bold tabular-nums transition-colors',
                      STATE_STYLE[state],
                    )}
                  >
                    <span aria-hidden>{state === 'gap' ? '×' : spanDigit(toothNum)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* The span as it will be printed on the register, and the count that
          falls out of it — both kept in step as the chart is pressed, because
          the count is what the invoice gets checked against and seeing it move
          is what catches a misread docket while the docket is still in hand. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-2.5">
        {positions.length === 0 ? (
          <p className="text-meta text-ink-faint">{t('teethNone')}</p>
        ) : (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <ToothSpan
              value={value}
              quadrantLabel={(quadrant) => tt(`quadrant_${quadrant}`)}
              className="text-body"
            />
            <span aria-live="polite" className="text-meta text-ink-soft">
              {t('elements')}{' '}
              <span className="text-body font-bold text-ink tabular-nums">
                {spanElements(value)}
              </span>
            </span>
          </p>
        )}

        {positions.length > 0 ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange('')}>
            <Eraser size={16} aria-hidden />
            {t('teethClear')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
