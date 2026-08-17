'use client';

import { PackageMinus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { takeStock } from '@/lib/actions/stock';

/**
 * "Six of these went today."
 *
 * The ±1 buttons beside it are the fast path for one, and stay — but they make
 * six into six presses, which is how a count ends up wrong in the middle. This
 * is the interaction the practice's spreadsheet already had: type the number,
 * the shelf and the ledger both move once.
 *
 * The field clears itself on success, because the number just used is the one
 * thing that must not be submitted twice.
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
  const form = useRef<HTMLFormElement>(null);
  const uid = useId();

  return (
    <form
      ref={form}
      action={async (formData) => {
        await takeStock(formData);
        form.current?.reset();
      }}
      className="flex items-center gap-1"
    >
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
