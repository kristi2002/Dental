'use client';

import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveStockCategory } from '@/lib/actions/stock';

export type CategoryDefaults = {
  id: string;
  name: string;
};

/**
 * Renaming a shelf you are already looking at.
 *
 * Naming a new one is a page — `/stock/categories/new` — because the shelves are
 * named in a batch before anything is counted in, and a modal reopened per shelf
 * is forty clicks. A rename is the opposite errand: one row, one word, fixed
 * without losing your place in the list.
 */
export function CategoryFormDialog({ category }: { category: CategoryDefaults }) {
  const t = useTranslations('stockCategories');
  const tc = useTranslations('common');
  const uid = useId();

  return (
    <FormDialog
      key={category.id}
      action={saveStockCategory}
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
    </FormDialog>
  );
}
