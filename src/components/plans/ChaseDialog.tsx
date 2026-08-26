'use client';

import { useTranslations } from 'next-intl';
import { useId, useState, type ReactNode } from 'react';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { chasePlan } from '@/lib/actions/plans';
import { addDays, toDateKey, today } from '@/lib/dates';

/** The answers a patient actually gives, in weeks. */
const OFFERS = [2, 4, 12] as const;

/**
 * "Rang them — they will come back after the summer."
 *
 * The stalled tab is derived from sixty quiet days with nothing booked, and it
 * had exactly two exits: tick off treatment nobody gave, or cancel a course the
 * patient still means to finish. Neither describes what actually happens when
 * somebody is rung, so the list was either worked dishonestly or not worked at
 * all — and a plan chased this morning shouted exactly as loudly this afternoon.
 *
 * Three buttons cover almost every answer, and the date field is there for the
 * one that does not. Clearing the date is a real choice too: it records that the
 * call happened without promising a day, which puts the plan straight back on
 * the list where somebody who has just been unreachable belongs.
 */
export function ChaseDialog({
  planId,
  followUpOn,
  trigger,
  triggerClassName = 'btn btn-secondary btn-sm',
}: {
  planId: string;
  /** The day already promised, when this plan has been chased before. */
  followUpOn: Date | null;
  trigger: ReactNode;
  triggerClassName?: string;
}) {
  const t = useTranslations('plans');
  const tc = useTranslations('common');
  const uid = useId();

  const [day, setDay] = useState(followUpOn ? toDateKey(followUpOn) : '');

  return (
    <FormDialog
      action={chasePlan}
      resetOnSuccess={false}
      title={t('chaseTitle')}
      submitLabel={t('chaseSubmit')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      discardMessage={tc('discardUnsaved')}
      closeLabel={tc('close')}
      triggerTitle={t('chase')}
      triggerClassName={triggerClassName}
      trigger={trigger}
      onClose={() => setDay(followUpOn ? toDateKey(followUpOn) : '')}
    >
      <input type="hidden" name="id" value={planId} />

      <p className="text-[0.95rem] text-ink-soft">{t('chaseHint')}</p>

      <fieldset>
        <legend className="field-label">{t('chaseWhen')}</legend>
        <div className="flex flex-wrap gap-2">
          {OFFERS.map((weeks) => {
            const value = toDateKey(addDays(today(), weeks * 7));
            return (
              <button
                key={weeks}
                type="button"
                aria-pressed={day === value}
                onClick={() => setDay(value)}
                className={
                  day === value
                    ? 'rounded-full border border-brand-dark bg-brand-dark px-3 py-1.5 text-[0.9rem] font-semibold text-white'
                    : 'rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[0.9rem] font-semibold text-ink-soft transition-colors hover:border-brand-dark hover:bg-brand-soft hover:text-brand-deep'
                }
              >
                {t('chaseInWeeks', { weeks })}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={day === ''}
            onClick={() => setDay('')}
            className={
              day === ''
                ? 'rounded-full border border-brand-dark bg-brand-dark px-3 py-1.5 text-[0.9rem] font-semibold text-white'
                : 'rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[0.9rem] font-semibold text-ink-soft transition-colors hover:border-brand-dark hover:bg-brand-soft hover:text-brand-deep'
            }
          >
            {t('chaseNoDate')}
          </button>
        </div>
      </fieldset>

      <TextField
        id={`${uid}-day`}
        name="followUpOn"
        type="date"
        label={t('chaseOnDay')}
        optional={tc('optional')}
        min={toDateKey(today())}
        value={day}
        onChange={(event) => setDay(event.target.value)}
      />

      {/* Goes to the audit trail rather than onto the plan: what was said on the
          phone is a note about a conversation, not a change to the treatment. */}
      <TextAreaField
        id={`${uid}-note`}
        name="note"
        label={tc('notes')}
        optional={tc('optional')}
        rows={2}
        placeholder={t('chaseNotePlaceholder')}
      />
    </FormDialog>
  );
}
