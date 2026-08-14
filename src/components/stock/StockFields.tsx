'use client';

import { useTranslations } from 'next-intl';
import { SelectField, TextField } from '@/components/ui/Field';

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

/**
 * One material, four groups of fields — and no opinion about what surrounds them.
 *
 * The same questions are asked on the "new material" page and in the edit dialog,
 * but the two frame them differently: the page gives each group a card with room
 * to explain itself, the dialog stacks them to stay inside a modal. Only the
 * chrome differs, so only the chrome is written twice.
 */
type Group = {
  /** Prefix for field ids, so two of these on one screen never collide. */
  uid: string;
  item?: StockDefaults;
};

/** What the material is called, and where it is filed. */
export function IdentityFields({
  uid,
  item,
  categories,
}: Group & {
  /** The shelves the practice has named. Empty until it names one. */
  categories: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations('stock');
  const tc = useTranslations('common');

  return (
    <>
      <TextField
        id={`${uid}-name`}
        name="name"
        label={t('name')}
        required
        autoComplete="off"
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
    </>
  );
}

/** What is on the shelf, in what, and when it counts as running out. */
export function CountFields({ uid, item, units }: Group & { units: string[] }) {
  const t = useTranslations('stock');

  return (
    <>
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
    </>
  );
}

/**
 * Bulk stock is counted in boxes and ordered in pieces. These two fields are the
 * whole bridge: nothing else in the app converts between them.
 */
export function OrderFields({ uid, item }: Group) {
  const t = useTranslations('stock');
  const tc = useTranslations('common');

  return (
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
  );
}

/** What one costs, and who it is bought from. */
export function PricingFields({
  uid,
  item,
  currency,
  suppliers = [],
}: Group & {
  /** ISO 4217 code, so the price field says which money it means. */
  currency: string;
  /** Who this is bought from. Empty until the practice records any. */
  suppliers?: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations('stock');
  const tc = useTranslations('common');

  return (
    <>
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
    </>
  );
}
