'use client';

import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import {
  CountFields,
  IdentityFields,
  OrderFields,
  PricingFields,
  type StockDefaults,
} from '@/components/stock/StockFields';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveStockItem } from '@/lib/actions/stock';

export type { StockDefaults };

/**
 * Correcting a material you are already looking at.
 *
 * Recording a new one is a page — `/stock/new` — because it is a form to be
 * worked through with a delivery note in hand. Editing is the opposite errand: a
 * minimum level nudged up, a price corrected off an invoice, done from the row it
 * is wrong on without losing your place in a list of two hundred.
 */
export function StockFormDialog({
  item,
  categories,
  units,
  suppliers = [],
  currency,
  triggerClassName,
  compact = false,
}: {
  item: StockDefaults;
  /** The shelves the practice has named. Empty until it names one. */
  categories: Array<{ id: string; name: string }>;
  units: string[];
  /** Who this is bought from. Empty until the practice records any. */
  suppliers?: Array<{ id: string; name: string }>;
  /** ISO 4217 code, so the price field says which money it means. */
  currency: string;
  triggerClassName?: string;
  /** Icon-only trigger, for use inside a crowded row. */
  compact?: boolean;
}) {
  const t = useTranslations('stock');
  const tc = useTranslations('common');
  const uid = useId();

  return (
    <FormDialog
      key={item.id}
      action={saveStockItem}
      resetOnSuccess={false}
      title={t('edit')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={t('edit')}
      triggerClassName={triggerClassName ?? 'btn btn-secondary btn-sm'}
      trigger={
        <>
          <Pencil size={18} aria-hidden />
          {compact ? <span className="sr-only">{t('edit')}</span> : tc('edit')}
        </>
      }
    >
      <input type="hidden" name="id" value={item.id} />

      <IdentityFields uid={uid} item={item} categories={categories} />
      <CountFields uid={uid} item={item} units={units} />
      <OrderFields uid={uid} item={item} />
      <PricingFields uid={uid} item={item} currency={currency} suppliers={suppliers} />
    </FormDialog>
  );
}
