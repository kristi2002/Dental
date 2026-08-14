'use client';

import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import {
  ContactFields,
  NameField,
  NotesField,
  type SupplierDefaults,
} from '@/components/stock/SupplierFields';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveSupplier } from '@/lib/actions/stock';

export type { SupplierDefaults };

/**
 * Correcting a supplier you are already looking at.
 *
 * Adding one is a page — `/stock/suppliers/new` — because the list is built in a
 * batch at setup. This is the opposite errand: a changed number, a new contact
 * name in the notes, fixed from the row it is wrong on.
 */
export function SupplierFormDialog({ supplier }: { supplier: SupplierDefaults }) {
  const t = useTranslations('suppliers');
  const tc = useTranslations('common');
  const uid = useId();

  return (
    <FormDialog
      key={supplier.id}
      action={saveSupplier}
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
      <input type="hidden" name="id" value={supplier.id} />

      <NameField uid={uid} supplier={supplier} />

      <div className="grid gap-4 sm:grid-cols-2">
        <ContactFields uid={uid} supplier={supplier} />
      </div>

      <NotesField uid={uid} supplier={supplier} />
    </FormDialog>
  );
}
