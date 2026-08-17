'use client';

import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { writeOffBatch } from '@/lib/actions/stock';

/**
 * Take a named lot off the shelf, in one press.
 *
 * The quantity is pre-filled with everything the lot has left, because a box
 * that has gone out of date goes out of date whole — the field exists for the
 * half-used bottle, not for the common case. Confirmed before it runs: this
 * spends stock, and unlike a miscount there is nothing to walk back to.
 */
export function WriteOffForm({
  batchId,
  remaining,
  itemName,
}: {
  batchId: string;
  /** Boxes this lot still holds — the default, and the ceiling. */
  remaining: number;
  /** Named in the confirmation, so nobody bins the wrong row. */
  itemName: string;
}) {
  const t = useTranslations('stock');
  const uid = useId();
  const [quantity, setQuantity] = useState(remaining);

  return (
    <form
      action={writeOffBatch}
      className="flex items-center gap-1.5"
      onSubmit={(event) => {
        if (!window.confirm(t('writeOffConfirm', { qty: quantity, name: itemName }))) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="batchId" value={batchId} />
      <label htmlFor={`${uid}-qty`} className="sr-only">
        {t('writeOff')}
      </label>
      <input
        id={`${uid}-qty`}
        name="quantity"
        type="number"
        min={1}
        max={remaining}
        value={quantity}
        onChange={(event) => setQuantity(Number.parseInt(event.target.value, 10) || 1)}
        className="field-input w-20 tabular-nums"
      />
      <button type="submit" className="btn btn-danger btn-sm" title={t('writeOff')}>
        <Trash2 size={17} aria-hidden />
        <span className="sr-only sm:not-sr-only">{t('writeOff')}</span>
      </button>
    </form>
  );
}
