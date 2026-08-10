'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { saveToothRecord } from '@/lib/actions/patients';
import { IDLE_STATE } from '@/lib/actions/types';
import {
  DEFAULT_TOOTH_STATUS,
  LOWER_TEETH_DISPLAY,
  TOOTH_STATUSES,
  TOOTH_STATUS_STYLE,
  UPPER_TEETH,
  type ToothStatus,
} from '@/lib/teeth';
import { cn } from '@/lib/utils';

export type ToothRecordMap = Record<number, { status: string; notes: string }>;

function statusOf(records: ToothRecordMap, toothNum: number): ToothStatus {
  const raw = records[toothNum]?.status;
  return raw && (TOOTH_STATUSES as readonly string[]).includes(raw)
    ? (raw as ToothStatus)
    : DEFAULT_TOOTH_STATUS;
}

export function DentalChart({
  patientId,
  records,
  readOnly = false,
}: {
  patientId: string;
  records: ToothRecordMap;
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
    dialogRef.current?.showModal();
  }

  const flagged = Object.entries(records).filter(([, r]) => r.status !== DEFAULT_TOOTH_STATUS);
  const current = selected === null ? null : records[selected];

  return (
    <div className="space-y-6">
      <p className="text-[1.02rem] text-ink-soft">{t('subtitle')}</p>

      <div className="overflow-x-auto pb-2">
        <div className="min-w-[46rem] space-y-5">
          <Arch
            label={t('upper')}
            rightLabel={t('right')}
            leftLabel={t('left')}
            teeth={UPPER_TEETH}
            records={records}
            onSelect={openTooth}
            toothLabel={(n) => t('tooth', { num: n })}
          />
          <Arch
            label={t('lower')}
            rightLabel={t('right')}
            leftLabel={t('left')}
            teeth={LOWER_TEETH_DISPLAY}
            records={records}
            onSelect={openTooth}
            toothLabel={(n) => t('tooth', { num: n })}
          />
        </div>
      </div>

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
                {t('tooth', { num: selected })}
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
  toothLabel,
}: {
  label: string;
  rightLabel: string;
  leftLabel: string;
  teeth: number[];
  records: ToothRecordMap;
  onSelect: (toothNum: number) => void;
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
              <div key={toothNum} className={cn('flex-1', index === 7 && 'mr-4')}>
                <button
                  type="button"
                  onClick={() => onSelect(toothNum)}
                  aria-label={toothLabel(toothNum)}
                  className={cn(
                    'relative flex h-14 w-full flex-col items-center justify-center rounded-md border font-bold transition-colors',
                    style.button,
                  )}
                >
                  <span className="text-[0.95rem] leading-none">{toothNum}</span>
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
