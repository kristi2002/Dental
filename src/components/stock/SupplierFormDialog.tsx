'use client';

import { Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveSupplier } from '@/lib/actions/stock';

export type SupplierDefaults = {
  id: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
};

/**
 * Enough to place an order and no more. There is no purchasing or invoicing in
 * this app by design, so a supplier is a name and a way to reach them.
 *
 * Adding one is the whole point of the screen it heads, so that trigger is a
 * full-size primary button; editing one is a row action beside the supplier.
 */
export function SupplierFormDialog({ supplier }: { supplier?: SupplierDefaults }) {
  const t = useTranslations('suppliers');
  const tc = useTranslations('common');
  const uid = useId();
  const editing = Boolean(supplier);

  return (
    <FormDialog
      key={supplier?.id ?? 'new'}
      action={saveSupplier}
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
      {supplier ? <input type="hidden" name="id" value={supplier.id} /> : null}

      <TextField
        id={`${uid}-name`}
        name="name"
        label={tc('name')}
        required
        defaultValue={supplier?.name}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${uid}-phone`}
          name="phone"
          type="tel"
          inputMode="tel"
          label={t('phone')}
          optional={tc('optional')}
          defaultValue={supplier?.phone}
        />
        <TextField
          id={`${uid}-email`}
          name="email"
          type="email"
          label={t('email')}
          optional={tc('optional')}
          defaultValue={supplier?.email}
        />
      </div>

      <TextAreaField
        id={`${uid}-notes`}
        name="notes"
        label={tc('notes')}
        optional={tc('optional')}
        rows={3}
        defaultValue={supplier?.notes}
      />
    </FormDialog>
  );
}
