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
  /** Where the box physically lives. Empty in a practice with one obvious home. */
  location: string;
  /** How many **boxes** are on the shelf. Nothing here is counted in pieces. */
  quantity: number;
  minLimit: number;
  /** The product this is a variant of, by name. Empty for a material that stands alone. */
  productName: string;
  /** Which variant — "A2", "Size M". Empty when the product has only this one. */
  variantName: string;
  /** Empty string when nothing has been stated — the list projects one instead. */
  orderQty: string;
  supplierId: string;
};

/**
 * One material, four groups of fields — and no opinion about what surrounds them.
 *
 * The same questions are asked when a material is recorded and when one is
 * corrected, on two pages that differ only in what they already know: `item` is
 * absent on the first and fills the defaults on the second. Only the chrome
 * around them is written twice, and it is deliberately near-identical — see
 * `NewStockForm` and `EditStockForm`.
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
  products = [],
}: Group & {
  /** The shelves the practice has named. Empty until it names one. */
  categories: Array<{ id: string; name: string }>;
  /** Products already recorded, offered as autocomplete. See `resolveProduct`. */
  products?: string[];
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

        {/* Where to walk to. A text box rather than a select, unlike the shelf
            below it — see `StockItem.location`: a category is a kind of thing
            and belongs on a list, a location is a sentence about one cupboard
            and belongs to whoever has to find it. */}
        <TextField
          id={`${uid}-location`}
          name="location"
          label={t('location')}
          hint={t('locationHint')}
          optional={tc('optional')}
          autoComplete="off"
          defaultValue={item?.location}
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

      {/* One product, several boxes: eight shades of a composite, four sizes of
          a glove. Each is its own row on the shelf — separately bought, counted
          and run out of — so the grouping is a name typed here rather than a
          different kind of record. Existing products autocomplete, which is what
          keeps "Filtek Z250" from becoming three products; a name nobody has
          used yet simply becomes one. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${uid}-productName`}
          name="productName"
          label={t('product')}
          hint={t('productHint')}
          optional={tc('optional')}
          autoComplete="off"
          list={`${uid}-products`}
          defaultValue={item?.productName}
        />
        <TextField
          id={`${uid}-variantName`}
          name="variantName"
          label={t('variant')}
          hint={t('variantHint')}
          optional={tc('optional')}
          autoComplete="off"
          defaultValue={item?.variantName}
        />
      </div>
      <datalist id={`${uid}-products`}>
        {products.map((product) => (
          <option key={product} value={product} />
        ))}
      </datalist>
    </>
  );
}

/**
 * How many boxes are there, and when it counts as running out.
 *
 * Both fields are boxes, and there is no third field asking which kind of box or
 * how many gloves are inside one. A shelf is worked a package at a time — a box
 * arrives, a box is opened — and that is the only figure anybody can state
 * without inventing it.
 */
export function CountFields({ uid, item }: Group) {
  const t = useTranslations('stock');

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        id={`${uid}-quantity`}
        name="quantity"
        type="number"
        min={0}
        label={t('quantityBoxes')}
        hint={t('quantityBoxesHint')}
        required
        defaultValue={item?.quantity ?? 0}
      />
      <TextField
        id={`${uid}-minLimit`}
        name="minLimit"
        type="number"
        min={0}
        label={t('minLimitBoxes')}
        hint={t('minLimitBoxesHint')}
        required
        defaultValue={item?.minLimit ?? 5}
      />
    </div>
  );
}

/** How many boxes to buy when it runs low. */
export function OrderFields({ uid, item }: Group) {
  const t = useTranslations('stock');
  const tc = useTranslations('common');

  return (
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
  );
}

/**
 * Who it is bought from.
 *
 * This asked what one box cost as well, and no longer does. Money is off every
 * storage-room screen by the owner's decision: the cupboard is read by whoever
 * is standing at it, and what the practice pays for a box is not their business.
 * `StockItem.unitPrice` keeps whatever was already recorded — nothing writes it
 * and nothing shows it.
 */
export function SupplyFields({
  uid,
  item,
  suppliers = [],
}: Group & {
  /** Who this is bought from. Empty until the practice records any. */
  suppliers?: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations('stock');
  const tc = useTranslations('common');

  return (
    <>
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
