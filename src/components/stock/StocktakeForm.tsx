'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useId, useState } from 'react';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { saveStocktake } from '@/lib/actions/stock';
import { IDLE_STATE } from '@/lib/actions/types';
import { cn } from '@/lib/utils';

export type StocktakeItem = {
  id: string;
  name: string;
  /** The article number, when the practice numbers its shelves. */
  code: string;
  category: string;
  unit: string;
  quantity: number;
  packSize: number;
};

/**
 * The whole cupboard as one list of number fields.
 *
 * Counting is done walking the room, so the screen is built to be typed
 * straight down rather than opened one dialog at a time — ten dialogs is ten
 * chances to lose a count you already made.
 *
 * A row is only submitted once it has been edited. The prefilled figure is
 * there to save typing on the many lines that have not moved, and treating it
 * as a count nobody made is how a stocktake would quietly overwrite whatever a
 * colleague consumed while the page sat open.
 */
export function StocktakeForm({ items }: { items: StocktakeItem[] }) {
  const t = useTranslations('stock');
  const tc = useTranslations('common');
  const uid = useId();

  const [state, formAction] = useActionState(saveStocktake, IDLE_STATE);
  const [counts, setCounts] = useState<Record<string, string>>({});

  /** What the field shows: the typed figure once touched, else what is on record. */
  const shown = (item: StocktakeItem) => counts[item.id] ?? String(item.quantity);

  /** `null` for a row left alone or cleared — nothing to record either way. */
  function delta(item: StocktakeItem): number | null {
    const raw = counts[item.id];
    if (raw === undefined || raw.trim() === '') return null;

    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value) || value < 0) return null;
    return value - item.quantity;
  }

  const edited = items.filter((item) => (delta(item) ?? 0) !== 0);

  // Category is the closest thing the schema has to "which shelf" — grouping by
  // it means the screen can be worked through in roughly the order the room is.
  const groups = new Map<string, StocktakeItem[]>();
  for (const item of items) {
    const key = item.category || t('uncategorized');
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  return (
    <form action={formAction}>
      <div className="card divide-y-2 divide-line">
        {[...groups].map(([category, groupItems]) => (
          <section key={category}>
            <h2 className="bg-paper px-5 py-2.5 text-[0.9rem] font-bold tracking-wide text-ink-faint uppercase">
              {category}
            </h2>

            <ul className="divide-y divide-line">
              {groupItems.map((item) => {
                const difference = delta(item);
                const fieldId = `${uid}-${item.id}`;

                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
                  >
                    <div className="min-w-48 flex-1">
                      <label htmlFor={fieldId} className="text-[1.05rem] font-bold text-ink">
                        {item.name}
                        {/* Counting is done off the shelf labels, and the labels
                            are numbered. Matching the row to the box is the
                            slowest part of a stocktake without this. */}
                        {item.code ? (
                          <span className="ml-2 font-semibold tabular-nums text-ink-faint">
                            #{item.code}
                          </span>
                        ) : null}
                      </label>
                      <p className="text-[0.9rem] text-ink-soft">
                        {t('stocktakeOnRecord', { qty: item.quantity, unit: item.unit })}
                        {item.packSize > 1
                          ? ` · ${t('packOf', { unit: item.unit, count: item.packSize })}`
                          : ''}
                      </p>
                    </div>

                    {/* The difference, as it is typed. A stocktake is where a
                        slipped digit does the most damage, and seeing "−90"
                        appear is what catches it before the save. */}
                    <span
                      className={cn(
                        'min-w-16 text-right text-[0.95rem] font-bold tabular-nums',
                        difference === null || difference === 0
                          ? 'text-ink-faint'
                          : difference < 0
                            ? 'text-warn'
                            : 'text-ok',
                      )}
                      aria-live="polite"
                    >
                      {difference === null || difference === 0
                        ? ''
                        : `${difference > 0 ? '+' : '−'}${Math.abs(difference)}`}
                    </span>

                    <input
                      id={fieldId}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={shown(item)}
                      onChange={(event) =>
                        setCounts((current) => ({ ...current, [item.id]: event.target.value }))
                      }
                      aria-label={t('stocktakeCountOf', { name: item.name })}
                      className="field-input w-24 py-1.5 text-center tabular-nums"
                    />
                    <span className="w-16 shrink-0 text-[0.9rem] text-ink-soft">{item.unit}</span>

                    {difference !== null && difference !== 0 ? (
                      <input type="hidden" name="count" value={`${item.id}:${shown(item)}`} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {/* Sticky: the list is longer than a screen, and a save button that has to
          be scrolled to is one that gets forgotten halfway down the room. */}
      <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-line bg-surface px-5 py-4 shadow-lg">
        {state.status === 'error' ? (
          <p role="alert" className="mr-auto font-semibold text-danger">
            {state.message}
          </p>
        ) : state.status === 'ok' ? (
          <p role="status" className="mr-auto font-semibold text-ok">
            {t('stocktakeSaved')}
          </p>
        ) : (
          <p className="mr-auto font-semibold text-ink-soft">
            {t('stocktakeChanged', { count: edited.length })}
          </p>
        )}

        <SubmitButton
          label={tc('save')}
          pendingLabel={tc('saving')}
          disabled={edited.length === 0}
        />
      </div>
    </form>
  );
}
