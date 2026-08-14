'use client';

import { Pencil, Plus } from 'lucide-react';
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
 * A catalogue heading: a name, and the department it sits inside if it is not
 * one itself.
 *
 * It exists as its own step — rather than a text box on the service form —
 * because naming the departments is a decision the practice makes once, and
 * every treatment entered afterwards should be *choosing* from that list rather
 * than spelling it again.
 */
export function ServiceCategoryFormDialog({
  category,
  departments,
  /** Preselected parent, so "add a subcategory" starts from the right row. */
  defaultParentId = '',
}: {
  category?: ServiceCategoryDefaults;
  /** Top-level categories only — a subcategory can never be a parent. */
  departments: Array<{ id: string; name: string }>;
  defaultParentId?: string;
}) {
  const t = useTranslations('serviceCategories');
  const tc = useTranslations('common');
  const uid = useId();
  const editing = Boolean(category);
  const addingChild = Boolean(defaultParentId);

  // A department with subcategories cannot be moved into another department:
  // its children would become a third level. Saying so here, on the field that
  // would cause it, beats saying it after the save is refused.
  const canReparent = !category?.hasChildren;
  // Nothing to be filed under yet, so the question has no answers to offer.
  const parentOptions = departments.filter((option) => option.id !== category?.id);

  return (
    <FormDialog
      key={category?.id ?? `new-${defaultParentId}`}
      action={saveServiceCategory}
      resetOnSuccess={!editing}
      title={editing ? t('edit') : addingChild ? t('newChild') : t('new')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={editing ? t('edit') : addingChild ? t('newChild') : t('new')}
      triggerClassName="btn btn-secondary btn-sm"
      trigger={
        editing ? (
          <>
            <Pencil size={17} aria-hidden />
            <span className="sr-only">{t('edit')}</span>
          </>
        ) : (
          <>
            <Plus size={18} aria-hidden />
            {addingChild ? <span className="sr-only">{t('newChild')}</span> : t('new')}
          </>
        )
      }
    >
      {category ? <input type="hidden" name="id" value={category.id} /> : null}

      <TextField
        id={`${uid}-name`}
        name="name"
        label={tc('name')}
        hint={t('nameHint')}
        required
        defaultValue={category?.name}
      />

      {canReparent && parentOptions.length > 0 ? (
        <SelectField
          id={`${uid}-parent`}
          name="parentId"
          label={t('parent')}
          hint={t('parentHint')}
          optional={tc('optional')}
          defaultValue={category?.parentId ?? defaultParentId}
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
        <input type="hidden" name="parentId" value={category?.parentId ?? defaultParentId} />
      )}

      {category?.hasChildren ? (
        <p className="text-[0.9rem] text-ink-soft">{t('parentLocked')}</p>
      ) : null}
    </FormDialog>
  );
}
