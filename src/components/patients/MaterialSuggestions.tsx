'use client';

import { Package, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState, useTransition } from 'react';
import { getMaterialSuggestions } from '@/lib/actions/stock';
import type { MaterialSuggestion } from '@/lib/material-history';
import { cn } from '@/lib/utils';

/**
 * The materials this treatment usually spends, offered while it is written up.
 *
 * Not a bill of materials — that was retired, and rightly. This is the ledger
 * read back: what came off the shelf at past visits where the same treatment was
 * recorded, in the amounts it actually came off in. The dentist confirms or
 * corrects a number; nothing is deducted that nobody looked at.
 *
 * Chips rather than a table, and pre-filled rather than blank, because the whole
 * value is in the press count. A form that asks a busy person to find four
 * materials in a list of two hundred and type a number into each is a form whose
 * honest usage figure is zero.
 */
export function MaterialSuggestions({
  serviceIds,
  value,
  onChange,
}: {
  /** Catalogue ids of the treatments currently ticked. */
  serviceIds: string[];
  /** `itemId:quantity` list, as the form submits it. */
  value: string;
  onChange: (next: string) => void;
}) {
  const t = useTranslations('stock');
  const uid = useId();

  const [suggestions, setSuggestions] = useState<MaterialSuggestion[]>([]);
  const [, startTransition] = useTransition();

  // Keyed on the sorted id list so re-ordering the same treatments does not
  // refetch, and adding one does.
  const key = [...serviceIds].sort().join(',');

  useEffect(() => {
    const ids = key.split(',').filter(Boolean);
    if (ids.length === 0) {
      setSuggestions([]);
      return;
    }
    startTransition(async () => setSuggestions(await getMaterialSuggestions(ids)));
  }, [key]);

  const chosen = new Map(
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [itemId, quantity] = entry.split(':');
        return [itemId ?? '', Number.parseInt(quantity ?? '', 10) || 1] as const;
      }),
  );

  const write = (next: Map<string, number>) =>
    onChange(
      [...next.entries()]
        .filter(([, quantity]) => quantity > 0)
        .map(([itemId, quantity]) => `${itemId}:${quantity}`)
        .join(','),
    );

  const toggle = (item: MaterialSuggestion) => {
    const next = new Map(chosen);
    if (next.has(item.itemId)) next.delete(item.itemId);
    else next.set(item.itemId, item.typicalQuantity);
    write(next);
  };

  const setQuantity = (itemId: string, quantity: number) => {
    const next = new Map(chosen);
    if (quantity > 0) next.set(itemId, quantity);
    else next.delete(itemId);
    write(next);
  };

  if (suggestions.length === 0) return null;

  return (
    <div className="rounded-lg border border-line bg-surface-soft p-3.5">
      <p className="flex items-center gap-2 font-bold text-ink">
        <Package size={18} aria-hidden />
        {t('usedHere')}
      </p>
      <p className="mt-0.5 text-[0.9rem] text-ink-soft">{t('usedHereHint')}</p>

      <ul className="mt-3 space-y-2">
        {suggestions.map((item) => {
          const on = chosen.has(item.itemId);
          const quantity = chosen.get(item.itemId) ?? item.typicalQuantity;
          // Spending more than the cupboard holds is allowed — it physically
          // happened — but it is said out loud, because it means the count has
          // drifted and somebody should walk to the shelf.
          const short = on && quantity > item.onHand;

          return (
            <li key={item.itemId} className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(item)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-[0.9rem] font-semibold transition-colors',
                  on
                    ? 'border-brand-dark bg-brand-dark text-white'
                    : 'border-line-strong bg-surface text-ink-soft hover:border-ink hover:text-ink',
                )}
              >
                {item.name}
              </button>

              {on ? (
                <>
                  <label htmlFor={`${uid}-${item.itemId}`} className="sr-only">
                    {item.name}
                  </label>
                  <input
                    id={`${uid}-${item.itemId}`}
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(event) =>
                      setQuantity(item.itemId, Number.parseInt(event.target.value, 10) || 0)
                    }
                    className="field-input w-20 tabular-nums"
                  />
                  <span className="text-[0.9rem] text-ink-soft">
                    {t('boxes', { count: quantity })} · {t('inStock', { qty: item.onHand })}
                  </span>
                  {short ? (
                    <span className="flex items-center gap-1 text-[0.88rem] font-semibold text-warn">
                      <TriangleAlert size={15} aria-hidden />
                      {t('moreThanOnHand')}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-[0.88rem] text-ink-faint">
                  {t('usedInVisits', { count: item.visits })}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
