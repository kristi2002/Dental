'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { saveToothRecord } from '@/lib/actions/patients';
import { IDLE_STATE } from '@/lib/actions/types';
import {
  DEFAULT_TOOTH_STATUS,
  PERMANENT_LOWER,
  PERMANENT_UPPER,
  PRIMARY_LOWER,
  PRIMARY_UPPER,
  TOOTH_STATUSES,
  TOOTH_STATUS_STYLE,
  TOOTH_SURFACES,
  isAnterior,
  parseSurfaces,
  toothLabel as toothLabelFor,
  type ToothNumbering,
  type ToothStatus,
} from '@/lib/teeth';
import { cn } from '@/lib/utils';

export type ToothRecordMap = Record<
  number,
  { status: string; notes: string; surfaces: string }
>;

/** Statuses that describe the whole tooth, where naming a surface is nonsense. */
const WHOLE_TOOTH_STATUSES = ['HEALTHY', 'EXTRACTED', 'MISSING', 'IMPLANT', 'CROWN'];

function statusOf(records: ToothRecordMap, toothNum: number): ToothStatus {
  const raw = records[toothNum]?.status;
  return raw && (TOOTH_STATUSES as readonly string[]).includes(raw)
    ? (raw as ToothStatus)
    : DEFAULT_TOOTH_STATUS;
}

export function DentalChart({
  patientId,
  records,
  numbering = 'FDI',
  showPrimary: initialShowPrimary = false,
  readOnly = false,
}: {
  patientId: string;
  records: ToothRecordMap;
  /** Which numbering the practice reads. Storage is always FDI. */
  numbering?: ToothNumbering;
  /** Start with the primary arches open — set for a patient young enough. */
  showPrimary?: boolean;
  /** A locum can study the chart; only clinical staff may change it. */
  readOnly?: boolean;
}) {
  const t = useTranslations('teeth');
  const tc = useTranslations('common');
  const uid = useId();

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [state, formAction] = useActionState(saveToothRecord, IDLE_STATE);
  const handledTs = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (state.status !== 'ok' || state.ts === handledTs.current) return;
    handledTs.current = state.ts;
    dialogRef.current?.close();
  }, [state]);

  function openTooth(toothNum: number) {
    setSelected(toothNum);
    setStatus(statusOf(records, toothNum));
    dialogRef.current?.showModal();
  }

  // Primary teeth are hidden rather than absent: twenty empty milk teeth on an
  // adult chart is noise, and a child's chart is unusable without them. Anything
  // already recorded on one forces them open.
  const [showPrimary, setShowPrimary] = useState(
    initialShowPrimary ||
      [...PRIMARY_UPPER, ...PRIMARY_LOWER].some(
        (n) => records[n] && records[n].status !== DEFAULT_TOOTH_STATUS,
      ),
  );

  // Which status is chosen decides whether surfaces make sense at all.
  const [status, setStatus] = useState<ToothStatus>(DEFAULT_TOOTH_STATUS);
  const surfacesApply = !WHOLE_TOOTH_STATUSES.includes(status);

  const flagged = Object.entries(records).filter(([, r]) => r.status !== DEFAULT_TOOTH_STATUS);
  const current = selected === null ? null : records[selected];
  const label = (n: number) => toothLabelFor(n, numbering);

  return (
    <div className="space-y-6">
      <p className="text-[1.02rem] text-ink-soft">{t('subtitle')}</p>

      <div className="overflow-x-auto pb-2">
        <div className="min-w-[46rem] space-y-5">
          <Arch
            label={t('upper')}
            rightLabel={t('right')}
            leftLabel={t('left')}
            teeth={PERMANENT_UPPER}
            records={records}
            onSelect={openTooth}
            numberLabel={label}
            toothLabel={(n) => t('tooth', { num: label(n) })}
          />
          <Arch
            label={t('lower')}
            rightLabel={t('right')}
            leftLabel={t('left')}
            teeth={PERMANENT_LOWER}
            records={records}
            onSelect={openTooth}
            numberLabel={label}
            toothLabel={(n) => t('tooth', { num: label(n) })}
          />

          {showPrimary ? (
            <>
              <Arch
                label={t('upperPrimary')}
                rightLabel={t('right')}
                leftLabel={t('left')}
                teeth={PRIMARY_UPPER}
                records={records}
                onSelect={openTooth}
                numberLabel={label}
                toothLabel={(n) => t('tooth', { num: label(n) })}
              />
              <Arch
                label={t('lowerPrimary')}
                rightLabel={t('right')}
                leftLabel={t('left')}
                teeth={PRIMARY_LOWER}
                records={records}
                onSelect={openTooth}
                numberLabel={label}
                toothLabel={(n) => t('tooth', { num: label(n) })}
              />
            </>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        className="btn btn-secondary btn-sm"
        aria-expanded={showPrimary}
        onClick={() => setShowPrimary((open) => !open)}
      >
        {showPrimary ? t('hidePrimary') : t('showPrimary')}
      </button>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-line bg-paper px-4 py-3">
        <span className="text-[0.9rem] font-bold text-ink-faint uppercase">{t('legend')}</span>
        {TOOTH_STATUSES.map((status) => (
          <span key={status} className="flex items-center gap-2 text-[0.95rem] text-ink">
            <span
              aria-hidden
              className={cn(
                'inline-flex h-6 w-6 items-center justify-center rounded border text-[0.75rem] font-bold',
                TOOTH_STATUS_STYLE[status].swatch,
              )}
            >
              {TOOTH_STATUS_STYLE[status].short}
            </span>
            {t(`status_${status}`)}
          </span>
        ))}
      </div>

      <p className="font-semibold text-ink-soft">{t('summary', { count: flagged.length })}</p>

      <dialog
        ref={dialogRef}
        aria-labelledby={`${uid}-title`}
        className="m-auto w-[min(92vw,32rem)] rounded-[var(--radius-card)] border border-line bg-surface p-0 text-ink shadow-pop"
        onClose={() => setSelected(null)}
      >
        {selected === null ? null : (
          <>
            <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
              <h2 id={`${uid}-title`} className="text-xl font-bold">
                {t('tooth', { num: label(selected) })}
              </h2>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-label={tc('close')}
                onClick={() => dialogRef.current?.close()}
              >
                <X size={20} aria-hidden />
              </button>
            </header>

            {readOnly ? (
              <>
                <div className="space-y-4 px-5 py-5">
                  <div>
                    <p className="field-label">{t('condition')}</p>
                    <p className="text-[1.05rem] font-semibold text-ink">
                      {t(`status_${statusOf(records, selected)}`)}
                    </p>
                  </div>
                  <div>
                    <p className="field-label">{t('notes')}</p>
                    <p
                      className={cn(
                        'text-[1.02rem] whitespace-pre-line',
                        current?.notes ? 'text-ink' : 'text-ink-faint',
                      )}
                    >
                      {current?.notes || tc('none')}
                    </p>
                  </div>
                </div>

                <footer className="flex items-center justify-end border-t border-line px-5 py-4">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => dialogRef.current?.close()}
                  >
                    {tc('close')}
                  </button>
                </footer>
              </>
            ) : (
              <form action={formAction}>
                <div className="space-y-4 px-5 py-5">
                  <input type="hidden" name="patientId" value={patientId} />
                  <input type="hidden" name="toothNum" value={selected} />

                  <fieldset>
                    <legend className="field-label">{t('condition')}</legend>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {TOOTH_STATUSES.map((status) => (
                        <label
                          key={status}
                          className={cn(
                            'flex cursor-pointer items-center gap-2 rounded-lg border border-line-strong px-2.5 py-2',
                            'text-[0.92rem] font-semibold hover:border-ink',
                            'has-checked:border-brand has-checked:bg-brand-soft has-checked:text-brand-deep',
                          )}
                        >
                          <input
                            type="radio"
                            name="status"
                            value={status}
                            defaultChecked={statusOf(records, selected) === status}
                            onChange={() => setStatus(status)}
                            className="sr-only"
                          />
                          <span
                            aria-hidden
                            className={cn(
                              'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[0.7rem] font-bold',
                              TOOTH_STATUS_STYLE[status].swatch,
                            )}
                          >
                            {TOOTH_STATUS_STYLE[status].short}
                          </span>
                          {t(`status_${status}`)}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  {/* "Caries on 14" is a note; "caries on the distal-occlusal of
                      14" is a treatment plan. Hidden for the statuses where a
                      surface makes no sense — a missing tooth has none. */}
                  {surfacesApply ? (
                    <fieldset>
                      <legend className="field-label">{t('surfaces')}</legend>
                      <div className="flex flex-wrap gap-2">
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
                              name="surfaces"
                              value={surface}
                              defaultChecked={parseSurfaces(current?.surfaces).includes(surface)}
                              className="sr-only"
                            />
                            <span aria-hidden className="font-bold">
                              {surface}
                            </span>
                            {surface === 'O'
                              ? t(isAnterior(selected) ? 'surface_I' : 'surface_O')
                              : t(`surface_${surface}`)}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}

                  <div>
                    <label className="field-label" htmlFor={`${uid}-notes`}>
                      {t('notes')}
                      <span className="ml-1.5 font-normal text-ink-faint">({tc('optional')})</span>
                    </label>
                    <textarea
                      id={`${uid}-notes`}
                      name="notes"
                      rows={3}
                      className="field-input min-h-20 resize-y"
                      defaultValue={current?.notes ?? ''}
                    />
                  </div>

                  {state.status === 'error' ? (
                    <p
                      role="alert"
                      className="rounded-lg border border-danger bg-danger-soft px-3 py-2 font-semibold text-danger"
                    >
                      {state.message}
                    </p>
                  ) : null}
                </div>

                <footer className="flex items-center justify-end gap-3 border-t border-line px-5 py-4">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => dialogRef.current?.close()}
                  >
                    {tc('cancel')}
                  </button>
                  <SubmitButton label={tc('save')} pendingLabel={tc('saving')} />
                </footer>
              </form>
            )}
          </>
        )}
      </dialog>
    </div>
  );
}

function Arch({
  label,
  rightLabel,
  leftLabel,
  teeth,
  records,
  onSelect,
  numberLabel,
  toothLabel,
}: {
  label: string;
  rightLabel: string;
  leftLabel: string;
  teeth: number[];
  records: ToothRecordMap;
  onSelect: (toothNum: number) => void;
  /** FDI or Universal, whichever the practice reads. */
  numberLabel: (toothNum: number) => string;
  toothLabel: (toothNum: number) => string;
}) {
  return (
    <section>
      <h3 className="mb-2 text-[0.9rem] font-bold tracking-wide text-ink-faint uppercase">
        {label}
      </h3>
      <div className="flex items-center gap-3">
        <span className="w-6 shrink-0 text-center text-[0.85rem] font-bold text-ink-faint">
          {rightLabel.charAt(0)}
        </span>

        <div className="flex flex-1 items-stretch gap-1.5">
          {teeth.map((toothNum, index) => {
            const status = statusOf(records, toothNum);
            const style = TOOTH_STATUS_STYLE[status];
            const hasNotes = Boolean(records[toothNum]?.notes);

            return (
              // The midline gap falls after the last tooth of the first
              // quadrant, which is halfway along whichever row this is.
              <div
                key={toothNum}
                className={cn('flex-1', index === teeth.length / 2 - 1 && 'mr-4')}
              >
                <button
                  type="button"
                  onClick={() => onSelect(toothNum)}
                  aria-label={toothLabel(toothNum)}
                  className={cn(
                    'relative flex h-14 w-full flex-col items-center justify-center rounded-md border font-bold transition-colors',
                    style.button,
                  )}
                >
                  <span className="text-[0.95rem] leading-none">{numberLabel(toothNum)}</span>
                  {style.short ? (
                    <span aria-hidden className="mt-0.5 text-[0.78rem] leading-none opacity-90">
                      {style.short}
                    </span>
                  ) : null}
                  {hasNotes ? (
                    <span
                      aria-hidden
                      className="absolute top-1 right-1 h-2 w-2 rounded-full bg-current"
                    />
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>

        <span className="w-6 shrink-0 text-center text-[0.85rem] font-bold text-ink-faint">
          {leftLabel.charAt(0)}
        </span>
      </div>
    </section>
  );
}
