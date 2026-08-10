'use client';

import { Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveStockItem } from '@/lib/actions/stock';

export type StockDefaults = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  minLimit: number;
  unit: string;
};

export function StockFormDialog({
  item,
  categories,
  units,
  triggerClassName,
  compact = false,
}: {
  item?: StockDefaults;
  categories: string[];
  units: string[];
  triggerClassName?: string;
  compact?: boolean;
}) {
  const t = useTranslations('stock');
  const tc = useTranslations('common');
  const editing = Boolean(item);
  const uid = useId();

  return (
    <FormDialog
      key={item?.id ?? 'new'}
      action={saveStockItem}
      resetOnSuccess={!editing}
      title={editing ? t('edit') : t('new')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={editing ? t('edit') : t('new')}
      triggerClassName={
        triggerClassName ?? (editing ? 'btn btn-secondary btn-sm' : 'btn btn-primary')
      }
      trigger={
        editing ? (
          <>
            <Pencil size={18} aria-hidden />
            {compact ? <span className="sr-only">{t('edit')}</span> : tc('edit')}
          </>
        ) : (
          <>
            <Plus size={20} aria-hidden />
            {t('new')}
          </>
        )
      }
    >
      {item ? <input type="hidden" name="id" value={item.id} /> : null}

      <TextField
        id={`${uid}-name`}
        name="name"
        label={t('name')}
        required
        defaultValue={item?.name}
      />

      <TextField
        id={`${uid}-category`}
        name="category"
        label={t('category')}
        optional={tc('optional')}
        list={`${uid}-categories`}
        defaultValue={item?.category}
      />
      <datalist id={`${uid}-categories`}>
        {categories.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>

      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          id={`${uid}-quantity`}
          name="quantity"
          type="number"
          min={0}
          label={t('quantity')}
          required
          defaultValue={item?.quantity ?? 0}
        />
        <TextField
          id={`${uid}-minLimit`}
          name="minLimit"
          type="number"
          min={0}
          label={t('minLimit')}
          required
          defaultValue={item?.minLimit ?? 5}
        />
        <TextField
          id={`${uid}-unit`}
          name="unit"
          label={t('unit')}
          required
          list={`${uid}-units`}
          defaultValue={item?.unit ?? 'pcs'}
        />
      </div>
      <datalist id={`${uid}-units`}>
        {units.map((unit) => (
          <option key={unit} value={unit} />
        ))}
      </datalist>
    </FormDialog>
  );
}
