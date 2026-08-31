'use client';

import { MousePointerClick, Undo2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ToothGlyph } from '@/components/dental/ToothGlyph';
import {
  DEFAULT_TOOTH_STATUS, TOOTH_STATUSES, type ToothStatus } from '@/lib/teeth';
import { cn } from '@/lib/utils';

/**
 * The conditions, as tools you pick up.
 *
 * Charting a mouth is thirty-two findings entered one after another. Each of
 * them used to be a dialog: open it, read eight options, choose, press save,
 * wait for it to close, find the next tooth. That is fine for correcting one
 * tooth and hopeless for examining a patient, which is what the chart is
 * mostly used for — and it is the reason a paper chart still beat this screen.
 *
 * With a tool held, the click *is* the record: press "Karies", then press the
 * distal segment of 46, and the finding is written. The dialog is still here —
 * it is the first tool, and it is what the chart does with no tool held — for
 * the times a note has to be typed rather than a colour applied.
 *
 * This is also the legend. A key whose swatches are the same drawings as the
 * tools, in the same order, is one thing to learn rather than two, and it
 * cannot drift out of step with the palette the way a separate list would.
 */

/** An upper first molar — three roots and a full cusp pattern, so every state
 *  a tool can apply is legible on it. */
const PALETTE_TOOTH = 16;

/** Caries and fillings are drawn on a face; the rest are whole-tooth states and
 *  naming a surface for the thumbnail would be inventing one. */
const PREVIEW_SURFACES = ['O'] as const;

export function ConditionPalette({
  tool,
  onPick,
  onUndo,
  canUndo,
}: {
  /** The condition being applied, or null when a click opens the record. */
  tool: ToothStatus | null;
  onPick: (tool: ToothStatus | null) => void;
  onUndo: () => void;
  canUndo: boolean;
}) {
  const t = useTranslations('teeth');

  return (
    <div className="rounded-lg border border-line bg-paper px-4 py-3">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-meta font-bold text-ink-faint uppercase">{t('paletteTitle')}</p>

        {/* Undo, because a marking tool without one is a tool people are afraid
            to use quickly — and quickly is the entire point of it. */}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onUndo}
          disabled={!canUndo}
        >
          <Undo2 size={16} aria-hidden />
          {t('undo')}
        </button>
      </div>

      {/* Measured against the chart's own container rather than the viewport:
          past 68rem the odontogram gives 18rem of its width to the findings
          panel, so a palette laid out by window size lays itself out for room
          it does not have. */}
      <ul className="grid grid-cols-3 gap-2 @min-[34rem]:grid-cols-5 @min-[58rem]:grid-cols-9">
        <li>
          <PaletteButton
            selected={tool === null}
            label={t('toolRecord')}
            onClick={() => onPick(null)}
          >
            <span className="flex h-16 w-9 items-center justify-center">
              <MousePointerClick size={26} aria-hidden className="text-ink-soft" />
            </span>
          </PaletteButton>
        </li>

        {TOOTH_STATUSES.map((status) => (
          <li key={status}>
            <PaletteButton
              selected={tool === status}
              label={t(`status_${status}`)}
              onClick={() => onPick(status)}
            >
              <span aria-hidden className="h-16 w-9">
                {/* One status at a time — the palette shows what each tool
                    would paint, not what a tooth looks like. */}
                <ToothGlyph
                  toothNum={PALETTE_TOOTH}
                  findings={
                    status === DEFAULT_TOOTH_STATUS
                      ? []
                      : [
                          {
                            status,
                            surfaces:
                              status === 'CARIES' || status === 'FILLED'
                                ? PREVIEW_SURFACES.join('')
                                : '',
                          },
                        ]
                  }
                />
              </span>
            </PaletteButton>
          </li>
        ))}
      </ul>

      {/* What the held tool will do, in words. The difference between clicking
          the tooth and clicking a segment of the wheel is the whole grammar of
          the palette, and it is not guessable from the drawing. */}
      <p className="mt-2.5 text-meta leading-snug text-ink-soft" aria-live="polite">
        {tool === null ? t('toolHintRecord') : t('toolHintMark', { tool: t(`status_${tool}`) })}
      </p>
    </div>
  );
}

function PaletteButton({
  selected,
  label,
  onClick,
  children,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex w-full flex-col items-center gap-1 rounded-lg border px-1 py-2',
        'text-center text-caption leading-tight font-semibold',
        selected
          ? 'border-brand bg-brand-soft text-brand-deep ring-2 ring-brand'
          : 'border-line-strong bg-surface text-ink hover:border-ink',
      )}
    >
      {children}
      {label}
    </button>
  );
}
