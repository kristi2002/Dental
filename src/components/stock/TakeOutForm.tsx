'use client';

import { PackageMinus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { useFormStatus } from 'react-dom';
import { takeStock } from '@/lib/actions/stock';
import { useRecoveredForm } from '@/lib/form-recovery';

/**
 * "Six of these went today."
 *
 * The ±1 buttons beside it are the fast path for one, and stay — but they make
 * six into six presses, which is how a count ends up wrong in the middle. This
 * is the interaction the practice's spreadsheet already had: type the number,
 * the shelf and the ledger both move once.
 *
 * The field clears itself on success, because the number just used is the one
 * thing that must not be submitted twice — and keeps what was typed after a
 * refusal, which is what `useRecoveredForm` is for. A shelf that turns out to
 * hold eight is a number to correct, not to retype.
 *
 * The refusal is shown here rather than swallowed. The action takes all of what
 * was asked for or none of it, and the count printed beside this form does not
 * move on a refusal — so without a sentence, a take-out that did nothing is
 * indistinguishable from one that worked.
 */
export function TakeOutForm({
  itemId,
  max,
}: {
  itemId: string;
  /** How many boxes are on the shelf. The action refuses more; so does the input. */
  max: number;
}) {
  const t = useTranslations('stock');
  const uid = useId();
  const { state, formAction, formRef } = useRecoveredForm(takeStock);

  return (
    <div className="flex flex-col items-end gap-1">
      <form ref={formRef} action={formAction} className="flex items-center gap-1">
        <input type="hidden" name="id" value={itemId} />
        <input
          id={`${uid}-qty`}
          name="quantity"
          type="number"
          min={1}
          max={max}
          step={1}
          className="field-input w-16 px-2 text-center tabular-nums"
          placeholder={t('takeOutPlaceholder')}
          aria-label={t('takeOutLabel')}
        />
        <TakeOutButton label={t('takeOut')} />
      </form>

      {state.status === 'error' ? (
        <p role="alert" className="text-[0.9rem] font-semibold text-danger">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

function TakeOutButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="btn btn-secondary btn-sm" title={label} disabled={pending}>
      <PackageMinus size={18} aria-hidden />
      <span className="sr-only">{label}</span>
    </button>
  );
}
