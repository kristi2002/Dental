'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { SelectField, TextField } from '@/components/ui/Field';
import type { ServiceCategoryOption } from '@/lib/queries';
import { cn } from '@/lib/utils';

export type StockOption = { id: string; name: string; unit: string; packSize: number };

export type ServiceDefaults = {
  id: string;
  name: string;
  /** The department, whether this treatment is filed against it or a child of it. */
  departmentId: string;
  /** The subcategory inside that department, or empty. */
  subcategoryId: string;
  durationMin: number;
  /** Materials this treatment consumes, keyed by stock item id. */
  materials: Array<{ itemId: string; quantity: number }>;
};

/**
 * The fields a treatment is made of, shared by the page that adds one to the
 * catalogue and the dialog that corrects one — so the two can never drift into
 * asking different questions about the same treatment.
 */

export function NameField({
  uid,
  service,
  onChange,
}: {
  uid: string;
  service?: ServiceDefaults;
  onChange?: (value: string) => void;
}) {
  const t = useTranslations('services');

  return (
    <TextField
      id={`${uid}-name`}
      name="name"
      label={t('name')}
      required
      defaultValue={service?.name}
      onChange={(event) => onChange?.(event.target.value)}
    />
  );
}

/**
 * Where the treatment is filed, in two levels.
 *
 * A closed list, not a text box. Typing the department per treatment is what
 * produced three spellings of one heading, and five screens group the catalogue
 * by it — so a typo splits a department in two. The hint carries the only thing
 * a select cannot: where new ones come from, said just once, when there are
 * none yet.
 */
export function CatalogueFields({
  uid,
  service,
  categories,
  onChange,
}: {
  uid: string;
  service?: ServiceDefaults;
  /** Every heading the practice has named, departments and subcategories alike. */
  categories: ServiceCategoryOption[];
  /** Told which headings are chosen, for the page's preview card. */
  onChange?: (chosen: { departmentId: string; subcategoryId: string }) => void;
}) {
  const t = useTranslations('services');
  const tc = useTranslations('common');

  // The second select is a function of the first, so the department is state
  // rather than an uncontrolled default: picking Kirurgji has to replace the
  // subcategories of whatever was selected before it.
  const [departmentId, setDepartmentId] = useState(service?.departmentId ?? '');
  const [subcategoryId, setSubcategoryId] = useState(service?.subcategoryId ?? '');

  const departments = categories.filter((category) => category.parentId === null);
  const subcategories = categories.filter((category) => category.parentId === departmentId);

  return (
    <>
      <SelectField
        id={`${uid}-category`}
        name="categoryId"
        label={t('department')}
        hint={departments.length === 0 ? t('categoryEmptyHint') : undefined}
        optional={tc('optional')}
        value={departmentId}
        onChange={(event) => {
          const next = event.target.value;
          setDepartmentId(next);
          // The old subcategory belongs to the old department.
          setSubcategoryId('');
          onChange?.({ departmentId: next, subcategoryId: '' });
        }}
      >
        <option value="">{t('uncategorized')}</option>
        {departments.map((department) => (
          <option key={department.id} value={department.id}>
            {department.name}
          </option>
        ))}
      </SelectField>

      {/* Only once the chosen department has been subdivided — an empty second
          select on every treatment would read as a question left unanswered. */}
      {subcategories.length > 0 ? (
        <SelectField
          id={`${uid}-subcategory`}
          name="subcategoryId"
          label={t('subcategory')}
          optional={tc('optional')}
          value={subcategoryId}
          onChange={(event) => {
            const next = event.target.value;
            setSubcategoryId(next);
            onChange?.({ departmentId, subcategoryId: next });
          }}
        >
          <option value="">{t('wholeDepartment')}</option>
          {subcategories.map((subcategory) => (
            <option key={subcategory.id} value={subcategory.id}>
              {subcategory.name}
            </option>
          ))}
        </SelectField>
      ) : null}
    </>
  );
}

export function DurationField({
  uid,
  service,
  onChange,
}: {
  uid: string;
  service?: ServiceDefaults;
  onChange?: (value: string) => void;
}) {
  const t = useTranslations('services');
  const tc = useTranslations('common');

  return (
    <TextField
      id={`${uid}-duration`}
      name="durationMin"
      type="number"
      min={5}
      step={5}
      label={`${t('duration')} (${tc('minutes')})`}
      required
      defaultValue={service?.durationMin ?? 30}
      onChange={(event) => onChange?.(event.target.value)}
    />
  );
}

/**
 * What the treatment takes off the shelf.
 *
 * Set this once and every recorded visit deducts it automatically — the whole
 * point of the feature is that nobody counts gloves by hand.
 */
export function MaterialsField({
  service,
  stockItems,
  onChange,
}: {
  service?: ServiceDefaults;
  /** The cupboard, for building this treatment's bill of materials. */
  stockItems: StockOption[];
  /** Told how many materials are selected, for the page's preview card. */
  onChange?: (count: number) => void;
}) {
  const t = useTranslations('services');

  const [materials, setMaterials] = useState<Record<string, number>>(
    Object.fromEntries((service?.materials ?? []).map((m) => [m.itemId, m.quantity])),
  );

  function update(next: Record<string, number>) {
    setMaterials(next);
    onChange?.(Object.keys(next).length);
  }

  return (
    <fieldset>
      <p className="mb-2 text-[0.9rem] text-ink-soft">{t('materialsHint')}</p>

      {stockItems.length === 0 ? (
        <p className="text-[0.95rem] text-ink-faint">{t('materialsNoStock')}</p>
      ) : (
        <ul className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-line p-2">
          {stockItems.map((item) => {
            const quantity = materials[item.id];
            const on = quantity !== undefined;
            // Deduction happens in whole units, and a box-counted item's unit
            // *is* a box — so a `1` here would take a hundred gloves off the
            // shelf per visit. Already-selected rows stay clickable so an entry
            // made before the item was counted in boxes can be removed.
            const byTheBox = item.packSize > 1 && !on;

            return (
              <li key={item.id} className="flex items-center gap-2">
                <button
                  type="button"
                  aria-pressed={on}
                  disabled={byTheBox}
                  title={byTheBox ? t('materialByTheBox', { unit: item.unit }) : undefined}
                  onClick={() => {
                    const { [item.id]: existing, ...rest } = materials;
                    update(existing ? rest : { ...materials, [item.id]: 1 });
                  }}
                  className={cn(
                    'flex-1 rounded-md border px-2.5 py-1.5 text-left text-[0.95rem] font-semibold transition-colors',
                    byTheBox
                      ? 'cursor-not-allowed border-line bg-surface text-ink-faint'
                      : on
                        ? 'border-brand bg-brand-soft text-brand-deep'
                        : 'border-line-strong bg-surface text-ink-soft hover:border-ink hover:text-ink',
                  )}
                >
                  {item.name}
                  {byTheBox ? (
                    <span className="ml-2 font-normal">
                      · {t('materialByTheBoxShort', { unit: item.unit })}
                    </span>
                  ) : null}
                </button>

                {on ? (
                  <>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={quantity}
                      aria-label={t('materialQuantity', { name: item.name })}
                      onChange={(event) =>
                        update({ ...materials, [item.id]: Math.max(1, Number(event.target.value)) })
                      }
                      className="field-input w-20 py-1.5 text-center"
                    />
                    <span className="w-12 shrink-0 text-[0.9rem] text-ink-soft">{item.unit}</span>
                    <input type="hidden" name="material" value={`${item.id}:${quantity}`} />
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </fieldset>
  );
}
