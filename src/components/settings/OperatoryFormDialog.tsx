'use client';

import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveOperatory } from '@/lib/actions/settings';

export type OperatoryDefaults = { id: string; name: string };

/**
 * Renaming a chair you are already looking at.
 *
 * Naming a new one is a page — `/settings/operatories/new` — because the chairs
 * are named in a batch on the first day, and how many there are decides how much
 * the diary will let the practice book in parallel.
 */
export function OperatoryFormDialog({ operatory }: { operatory: OperatoryDefaults }) {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const uid = useId();

  return (
    <FormDialog
      key={operatory.id}
      action={saveOperatory}
      resetOnSuccess={false}
      title={t('operatoryEdit')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={t('operatoryEdit')}
      triggerClassName="btn btn-secondary btn-sm"
      trigger={
        <>
          <Pencil size={18} aria-hidden />
          <span className="sr-only">{t('operatoryEdit')}</span>
        </>
      }
    >
      <input type="hidden" name="id" value={operatory.id} />

      <TextField
        id={`${uid}-name`}
        name="name"
        label={tc('name')}
        hint={t('operatoryNameHint')}
        required
        defaultValue={operatory.name}
      />
    </FormDialog>
  );
}
