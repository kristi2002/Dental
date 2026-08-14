'use client';

import { Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { SelectField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveStockItem } from '@/lib/actions/stock';

export type StockDefaults = {
  id: string;
  name: string;
  /** The practice's own article number. Empty when it never numbered anything. */
  code: string;
  /** The shelf's id, or empty for a material nobody has filed. */
  categoryId: string;
  quantity: number;
  minLimit: number;
  unit: string;
  packSize: number;
  /** Empty string when nothing has been stated — the list projects one instead. */
  orderQty: string;
  /** `"2214.28"`, or empty when nobody has priced it. Decimals do not cross to
   *  the client, so this travels as the string the input wants anyway. */
  unitPrice: string;
  supplierId: string;
};

export function StockFormDialog({
  item,
  categories,
  units,
  suppliers = [],
  currency,
  triggerClassName,
  compact = false,
}: {
  item?: StockDefaults;
  /** The shelves the practice has named. Empty until it names one. */
  categories: Array<{ id: string; name: string }>;
  units: string[];
  /** Who this is bought from. Empty until the practice records any. */
  suppliers?: Array<{ id: string; name: string }>;
  /** ISO 4217 code, so the price field says which money it means. */
  currency: string;
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

      <div className="grid gap-4 sm:grid-cols-2">
        {/* The number already written on the shelf label. Optional, because a
            practice that never numbered its storage room should not be made to
            invent one before it can record a material. */}
        <TextField
          id={`${uid}-code`}
          name="code"
          label={t('code')}
          hint={t('codeHint')}
          optional={tc('optional')}
          inputMode="numeric"
          defaultValue={item?.code}
        />

        {/* A closed list, not a text box. Typing the shelf name per material is
            what produced three spellings of one category, and the stocktake
            screen walks the room by these — so a typo splits a shelf in two.
            The hint carries the only thing a select cannot: where new ones come
            from, said just once, when there are none yet. */}
        <SelectField
          id={`${uid}-category`}
          name="categoryId"
          label={t('category')}
          hint={categories.length === 0 ? t('categoryEmptyHint') : undefined}
          optional={tc('optional')}
          defaultValue={item?.categoryId ?? ''}
        >
          <option value="">{t('uncategorized')}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </SelectField>
      </div>

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

      {/* Bulk stock is counted in boxes and ordered in pieces. These two fields
          are the whole bridge: nothing else in the app converts between them. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${uid}-packSize`}
          name="packSize"
          type="number"
          min={1}
          label={t('packSize')}
          hint={t('packSizeHint')}
          required
          defaultValue={item?.packSize ?? 1}
        />
        <TextField
          id={`${uid}-orderQty`}
          name="orderQty"
          type="number"
          min={1}
          label={t('orderQty')}
          hint={t('orderQtyHint')}
          optional={tc('optional')}
          defaultValue={item?.orderQty ?? ''}
        />
      </div>

      {/* What one unit costs. Recording a delivery with a price overwrites this,
          so it ages with the invoices rather than with whoever last edited.

          Deliberately not `type="number"`: that input *discards* a value its own
          locale cannot parse, so `2214,28` typed on an English-locale browser
          arrives at the server as an empty field — the price silently gone, with
          nothing said. Text keeps what was typed; `parseMoney` is the gate, and
          it answers a bad one out loud. */}
      <TextField
        id={`${uid}-unitPrice`}
        name="unitPrice"
        inputMode="decimal"
        label={t('unitPrice', { currency })}
        hint={t('unitPriceHint')}
        optional={tc('optional')}
        defaultValue={item?.unitPrice ?? ''}
      />

      {/* Only worth asking once somebody has been recorded — otherwise it is an
          empty select on every form. */}
      {suppliers.length > 0 ? (
        <SelectField
          id={`${uid}-supplier`}
          name="supplierId"
          label={t('supplier')}
          optional={tc('optional')}
          defaultValue={item?.supplierId ?? ''}
        >
          <option value="">{tc('none')}</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </SelectField>
      ) : null}
    </FormDialog>
  );
}
