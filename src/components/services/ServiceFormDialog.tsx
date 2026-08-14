'use client';

import { Package, Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { SelectField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveService } from '@/lib/actions/services';
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

export function ServiceFormDialog({
  service,
  categories,
  stockItems,
  triggerClassName,
  compact = false,
}: {
  service?: ServiceDefaults;
  /** Every heading the practice has named, departments and subcategories alike. */
  categories: ServiceCategoryOption[];
  /** The cupboard, for building this treatment's bill of materials. */
  stockItems: StockOption[];
  triggerClassName?: string;
  compact?: boolean;
}) {
  const t = useTranslations('services');
  const tc = useTranslations('common');
  const uid = useId();
  const editing = Boolean(service);

  // The second select is a function of the first, so the department is state
  // rather than an uncontrolled default: picking Kirurgji has to replace the
  // subcategories of whatever was selected before it.
  const [departmentId, setDepartmentId] = useState(service?.departmentId ?? '');
  const [subcategoryId, setSubcategoryId] = useState(service?.subcategoryId ?? '');

  const departments = categories.filter((category) => category.parentId === null);
  const subcategories = categories.filter((category) => category.parentId === departmentId);

  const [materials, setMaterials] = useState<Record<string, number>>(
    Object.fromEntries((service?.materials ?? []).map((m) => [m.itemId, m.quantity])),
  );

  function reset() {
    setDepartmentId(service?.departmentId ?? '');
    setSubcategoryId(service?.subcategoryId ?? '');
    setMaterials(Object.fromEntries((service?.materials ?? []).map((m) => [m.itemId, m.quantity])));
  }

  function toggleMaterial(itemId: string) {
    setMaterials((current) => {
      const { [itemId]: existing, ...rest } = current;
      return existing ? rest : { ...current, [itemId]: 1 };
    });
  }

  function setQuantity(itemId: string, quantity: number) {
    setMaterials((current) => ({ ...current, [itemId]: Math.max(1, quantity) }));
  }

  return (
    <FormDialog
      key={service?.id ?? 'new'}
      action={saveService}
      resetOnSuccess={!editing}
      onClose={reset}
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
      {service ? <input type="hidden" name="id" value={service.id} /> : null}

      <TextField
        id={`${uid}-name`}
        name="name"
        label={t('name')}
        required
        defaultValue={service?.name}
      />

      {/* A closed list, not a text box. Typing the department per treatment is
          what produced three spellings of one heading, and five screens group
          the catalogue by it — so a typo splits a department in two. The hint
          carries the only thing a select cannot: where new ones come from, said
          just once, when there are none yet. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id={`${uid}-category`}
          name="categoryId"
          label={t('department')}
          hint={departments.length === 0 ? t('categoryEmptyHint') : undefined}
          optional={tc('optional')}
          value={departmentId}
          onChange={(event) => {
            setDepartmentId(event.target.value);
            // The old subcategory belongs to the old department.
            setSubcategoryId('');
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
            onChange={(event) => setSubcategoryId(event.target.value)}
          >
            <option value="">{t('wholeDepartment')}</option>
            {subcategories.map((subcategory) => (
              <option key={subcategory.id} value={subcategory.id}>
                {subcategory.name}
              </option>
            ))}
          </SelectField>
        ) : null}
      </div>

      <TextField
        id={`${uid}-duration`}
        name="durationMin"
        type="number"
        min={5}
        step={5}
        label={`${t('duration')} (${tc('minutes')})`}
        required
        defaultValue={service?.durationMin ?? 30}
      />

      {/* Set this once and every recorded visit deducts it automatically —
          the whole point of the feature is that nobody counts gloves by hand. */}
      <fieldset>
        <legend className="field-label flex items-center gap-2">
          <Package size={17} aria-hidden className="text-brand" />
          {t('materials')}
        </legend>
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
              // shelf per visit. Already-selected rows stay clickable so an
              // entry made before the item was counted in boxes can be removed.
              const byTheBox = item.packSize > 1 && !on;

              return (
                <li key={item.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={byTheBox}
                    title={byTheBox ? t('materialByTheBox', { unit: item.unit }) : undefined}
                    onClick={() => toggleMaterial(item.id)}
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
                        onChange={(event) => setQuantity(item.id, Number(event.target.value))}
                        className="field-input w-20 py-1.5 text-center"
                      />
                      <span className="w-12 shrink-0 text-[0.9rem] text-ink-soft">
                        {item.unit}
                      </span>
                      <input type="hidden" name="material" value={`${item.id}:${quantity}`} />
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>
    </FormDialog>
  );
}
