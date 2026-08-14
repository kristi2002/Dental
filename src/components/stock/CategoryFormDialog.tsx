'use client';

import { Pencil, Plus } from 'lucide-react';
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
 * A shelf is a name and nothing else, so this dialog is one field.
 *
 * It exists as its own step — rather than a text box on the material form —
 * because naming the shelves is a decision the practice makes once, and every
 * material typed afterwards should be *choosing* from that list rather than
 * spelling it again.
 *
 * Adding one is the whole point of the screen it heads, so that trigger is a
 * full-size primary button; editing one is a row action beside the shelf.
 */
export function CategoryFormDialog({ category }: { category?: CategoryDefaults }) {
  const t = useTranslations('stockCategories');
  const tc = useTranslations('common');
  const uid = useId();
  const editing = Boolean(category);

  return (
    <FormDialog
      key={category?.id ?? 'new'}
      action={saveStockCategory}
      resetOnSuccess={!editing}
      title={editing ? t('edit') : t('new')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={editing ? t('edit') : t('new')}
      triggerClassName={editing ? 'btn btn-secondary btn-sm' : 'btn btn-primary'}
      trigger={
        editing ? (
          <>
            <Pencil size={17} aria-hidden />
            <span className="sr-only">{t('edit')}</span>
          </>
        ) : (
          <>
            <Plus size={18} aria-hidden />
            {t('new')}
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
    </FormDialog>
  );
}
