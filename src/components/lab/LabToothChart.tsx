'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import {
  ALL_TEETH,
  PERMANENT_LOWER,
  PERMANENT_UPPER,
  PRIMARY_LOWER,
  PRIMARY_UPPER,
  TOOTH_SURFACES,
  formatToothSelection,
  isAnterior,
  parseToothSelection,
  toothLabel as toothLabelFor,
  type ToothNumbering,
  type ToothSelection,
  type ToothSurface,
} from '@/lib/teeth';
import { cn } from '@/lib/utils';
import { SurfaceTarget } from '@/components/dental/SurfaceTarget';
import { ToothDefs, ToothGlyph } from '@/components/dental/ToothGlyph';

/**
 * Which teeth a lab order covers, picked off a drawing of the mouth.
 *
 * The order used to carry a text box: "46, 47". That is fine until it is wrong,
 * and it is wrong often — a transposed pair of digits sends a crown to the other
 * side of the jaw, and nothing between the typing and the fitting can catch it.
 * Here the choice is made on the tooth itself, and the string is generated.
 *
 * Clicking a tooth takes the whole tooth, which is what a crown or a denture
 * unit is. Clicking the dial beneath takes named surfaces, for the work where
 * that distinction is the whole instruction — an inlay is not "tooth 46".
 */
export function LabToothChart({
  name,
  defaultValue,
  numbering = 'FDI',
  readOnly = false,
}: {
  /** Form field the generated selection string is submitted under. */
  name: string;
  defaultValue?: string | null;
  numbering?: ToothNumbering;
  readOnly?: boolean;
}) {
  const t = useTranslations('lab');
  const tt = useTranslations('teeth');
  const tc = useTranslations('common');
  const uid = useId();

  const [selection, setSelection] = useState<ToothSelection>(() =>
    parseToothSelection(defaultValue),
  );
  const [active, setActive] = useState<number | null>(null);

  // A child's order has to be able to name a milk tooth, but twenty empty ones
  // on an adult chart is noise. Anything already chosen forces them open.
  const [showPrimary, setShowPrimary] = useState(() => {
    const initial = parseToothSelection(defaultValue);
    return [...PRIMARY_UPPER, ...PRIMARY_LOWER].some((n) => initial[n] !== undefined);
  });

  const chosen = ALL_TEETH.filter((toothNum) => selection[toothNum] !== undefined);
  const label = (toothNum: number) => toothLabelFor(toothNum, numbering);

  function toggleTooth(toothNum: number) {
    if (readOnly) return;
    setActive(toothNum);
    setSelection((current) => {
      const next = { ...current };
      if (next[toothNum] === undefined) next[toothNum] = [];
      else delete next[toothNum];
      return next;
    });
  }

  function toggleSurface(toothNum: number, surface: ToothSurface) {
    if (readOnly) return;
    setActive(toothNum);
    setSelection((current) => {
      const existing = current[toothNum] ?? [];
      const surfaces = existing.includes(surface)
        ? existing.filter((s) => s !== surface)
        : TOOTH_SURFACES.filter((s) => s === surface || existing.includes(s));

      // Unticking the last surface of a tooth that was only ever chosen by its
      // surfaces means "not this tooth" — leaving it selected-but-blank would
      // silently promote an inlay into a full crown.
      if (surfaces.length === 0 && existing.length > 0) {
        const next = { ...current };
        delete next[toothNum];
        return next;
      }
      return { ...current, [toothNum]: surfaces };
    });
  }

  /** Whole rows at a time — a denture is an arch, and clicking sixteen teeth to
   *  say so is how a full upper ends up recorded as fifteen. */
  function toggleRun(teeth: number[]) {
    if (readOnly) return;
    setSelection((current) => {
      const next = { ...current };
      const complete = teeth.every((toothNum) => next[toothNum] !== undefined);
      for (const toothNum of teeth) {
        if (complete) delete next[toothNum];
        else next[toothNum] ??= [];
      }
      return next;
    });
  }

  const upperRun = showPrimary ? [...PERMANENT_UPPER, ...PRIMARY_UPPER] : PERMANENT_UPPER;
  const lowerRun = showPrimary ? [...PERMANENT_LOWER, ...PRIMARY_LOWER] : PERMANENT_LOWER;

  const activeSurfaces = active === null ? [] : (selection[active] ?? []);
  const activeChosen = active !== null && selection[active] !== undefined;

  return (
    <div className="space-y-4">
      <ToothDefs />
      <input type="hidden" name={name} value={formatToothSelection(selection)} />

      {readOnly ? null : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => toggleRun([...upperRun, ...lowerRun])}
          >
            {t('selectFull')}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => toggleRun(upperRun)}
          >
            {t('selectUpper')}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => toggleRun(lowerRun)}
          >
            {t('selectLower')}
          </button>
          {chosen.length > 0 ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSelection({});
                setActive(null);
              }}
            >
              {t('clearSelection')}
            </button>
          ) : null}
        </div>
      )}

      <div className="overflow-x-auto pb-2" aria-describedby={`${uid}-hint`}>
        <p className="sr-only" id={`${uid}-hint`}>
          {t('chartHint')}
        </p>
        <div className="min-w-[52rem] space-y-1">
          <ArchRow
            upper
            teeth={PERMANENT_UPPER}
            selection={selection}
            active={active}
            readOnly={readOnly}
            label={label}
            toothTitle={(n) => tt('tooth', { num: label(n) })}
            onToothClick={toggleTooth}
            onSurfaceClick={toggleSurface}
          />
          {showPrimary ? (
            <ArchRow
              upper
              primary
              teeth={PRIMARY_UPPER}
              selection={selection}
              active={active}
              readOnly={readOnly}
              label={label}
              toothTitle={(n) => tt('tooth', { num: label(n) })}
              onToothClick={toggleTooth}
              onSurfaceClick={toggleSurface}
            />
          ) : null}

          <div className="h-px bg-line-strong" role="presentation" />

          {showPrimary ? (
            <ArchRow
              primary
              teeth={PRIMARY_LOWER}
              selection={selection}
              active={active}
              readOnly={readOnly}
              label={label}
              toothTitle={(n) => tt('tooth', { num: label(n) })}
              onToothClick={toggleTooth}
              onSurfaceClick={toggleSurface}
            />
          ) : null}
          <ArchRow
            teeth={PERMANENT_LOWER}
            selection={selection}
            active={active}
            readOnly={readOnly}
            label={label}
            toothTitle={(n) => tt('tooth', { num: label(n) })}
            onToothClick={toggleTooth}
            onSurfaceClick={toggleSurface}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold text-ink-soft">
          {chosen.length === 0
            ? t('selectedNone')
            : t('selectedSummary', {
                count: chosen.length,
                teeth: chosen.map((toothNum) => label(toothNum)).join(', '),
              })}
        </p>
        {readOnly ? null : (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-expanded={showPrimary}
            onClick={() => setShowPrimary((open) => !open)}
          >
            {showPrimary ? tt('hidePrimary') : tt('showPrimary')}
          </button>
        )}
      </div>

      {/* The dial is a mouse shortcut. These are the same five surfaces as
          controls a keyboard can reach and a screen reader can read out. */}
      {active !== null && !readOnly ? (
        <fieldset className="rounded-lg border border-line bg-paper px-4 py-3">
          <legend className="field-label px-1">
            {tt('tooth', { num: label(active) })}
          </legend>

          <div className="flex flex-wrap items-center gap-2">
            <label
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-lg border border-line-strong px-3 py-2',
                'text-[0.92rem] font-semibold hover:border-ink',
                'has-checked:border-brand has-checked:bg-brand-soft has-checked:text-brand-deep',
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={activeChosen}
                onChange={() => toggleTooth(active)}
              />
              {t('wholeTooth')}
            </label>

            <span className="text-ink-faint">·</span>

            {TOOTH_SURFACES.map((surface) => (
              <label
                key={surface}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg border border-line-strong px-3 py-2',
                  'text-[0.92rem] font-semibold hover:border-ink',
                  'has-checked:border-brand has-checked:bg-brand-soft has-checked:text-brand-deep',
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={activeSurfaces.includes(surface)}
                  onChange={() => toggleSurface(active, surface)}
                />
                <span aria-hidden className="font-bold">
                  {surface}
                </span>
                {surface === 'O'
                  ? tt(isAnterior(active) ? 'surface_I' : 'surface_O')
                  : tt(`surface_${surface}`)}
              </label>
            ))}

            <button
              type="button"
              className="btn btn-ghost btn-sm ml-auto"
              onClick={() => setActive(null)}
            >
              {tc('close')}
            </button>
          </div>
        </fieldset>
      ) : null}

    </div>
  );
}

function ArchRow({
  teeth,
  selection,
  active,
  readOnly,
  upper = false,
  primary = false,
  label,
  toothTitle,
  onToothClick,
  onSurfaceClick,
}: {
  teeth: number[];
  selection: ToothSelection;
  active: number | null;
  readOnly: boolean;
  /** Crown down, root up — and the number row sits beneath the dial. */
  upper?: boolean;
  primary?: boolean;
  label: (toothNum: number) => string;
  toothTitle: (toothNum: number) => string;
  onToothClick: (toothNum: number) => void;
  onSurfaceClick: (toothNum: number, surface: ToothSurface) => void;
}) {
  const glyphHeight = primary ? 'h-14' : 'h-20';

  return (
    <div className="flex items-stretch gap-1">
      {teeth.map((toothNum, index) => {
        const surfaces = selection[toothNum];
        const chosen = surfaces !== undefined;
        const whole = chosen && surfaces.length === 0;

        const glyph = (
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onToothClick(toothNum)}
            aria-pressed={chosen}
            aria-label={toothTitle(toothNum)}
            className={cn(
              'block w-full rounded-md transition-colors',
              glyphHeight,
              !readOnly && 'hover:bg-brand-soft/60',
              active === toothNum && 'bg-brand-soft',
            )}
          >
            <ToothGlyph
              toothNum={toothNum}
              surfaces={surfaces ?? []}
              whole={whole}
            />
          </button>
        );

        // A tooth taken whole reads as every segment marked, in the paler of the
        // two oranges — "all of it" rather than "these five faces of it".
        const dial = (
          <div className="mx-auto h-7 w-7">
            <SurfaceTarget
              toothNum={toothNum}
              readOnly={readOnly}
              ring={false}
              fillOf={(surface) =>
                whole ? '#ff8a65' : (surfaces ?? []).includes(surface) ? '#f4511e' : '#c9d1d7'
              }
              onSurfaceClick={(surface) => onSurfaceClick(toothNum, surface)}
            />
          </div>
        );

        const number = (
          <span
            className={cn(
              'block text-center text-[0.85rem] leading-5 font-bold tabular-nums',
              chosen ? 'text-brand-deep' : 'text-ink-faint',
            )}
          >
            {label(toothNum)}
          </span>
        );

        return (
          <div
            key={toothNum}
            // The midline falls after the last tooth of the first quadrant,
            // which is halfway along whichever row this is.
            className={cn(
              'flex min-w-0 flex-1 flex-col gap-1',
              index === teeth.length / 2 - 1 && 'mr-4 border-r border-line-strong pr-1',
            )}
          >
            {upper ? (
              <>
                {glyph}
                {dial}
                {number}
              </>
            ) : (
              <>
                {number}
                {dial}
                {glyph}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
