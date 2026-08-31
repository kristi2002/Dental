'use client';

import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { SelectField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveServiceCategory } from '@/lib/actions/services';

export type ServiceCategoryDefaults = {
  id: string;
  name: string;
  /** Empty for a department; the department's id for a subcategory. */
  parentId: string;
  /** Whether this department already has subcategories — see below. */
  hasChildren: boolean;
};

/**
 * Correcting a catalogue heading you are already looking at.
 *
 * Naming a new one is a page — `/services/categories/new` — because the
 * departments are named once, in a batch, before a single treatment is entered.
 * This is the opposite errand: a rename, or moving a subdivision under a
 * different department, from the row it is wrong on.
 */
export function ServiceCategoryFormDialog({
  category,
  departments,
}: {
  category: ServiceCategoryDefaults;
  /** Top-level categories only — a subcategory can never be a parent. */
  departments: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations('serviceCategories');
  const tc = useTranslations('common');
  const uid = useId();

  // A department with subcategories cannot be moved into another department:
  // its children would become a third level. Saying so here, on the field that
  // would cause it, beats saying it after the save is refused.
  const canReparent = !category.hasChildren;
  const parentOptions = departments.filter((option) => option.id !== category.id);

  return (
    <FormDialog
      key={category.id}
      action={saveServiceCategory}
      resetOnSuccess={false}
      title={t('edit')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={t('edit')}
      triggerClassName="btn btn-secondary btn-sm"
      trigger={
        <>
          <Pencil size={17} aria-hidden />
          <span className="sr-only">{t('edit')}</span>
        </>
      }
    >
      <input type="hidden" name="id" value={category.id} />

      <TextField
        id={`${uid}-name`}
        name="name"
        label={tc('name')}
        hint={t('nameHint')}
        required
        defaultValue={category.name}
      />

      {canReparent && parentOptions.length > 0 ? (
        <SelectField
          id={`${uid}-parent`}
          name="parentId"
          label={t('parent')}
          hint={t('parentHint')}
          optional={tc('optional')}
          defaultValue={category.parentId}
        >
          <option value="">{t('topLevel')}</option>
          {parentOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </SelectField>
      ) : (
        // The value still has to be submitted, or editing a department's name
        // would quietly promote its subcategory to a department of its own.
        <input type="hidden" name="parentId" value={category.parentId} />
      )}

      {category.hasChildren ? (
        <p className="text-meta text-ink-soft">{t('parentLocked')}</p>
      ) : null}
    </FormDialog>
  );
}
