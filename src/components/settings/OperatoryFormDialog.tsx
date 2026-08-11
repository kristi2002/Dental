'use client';

import { Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveOperatory } from '@/lib/actions/settings';

export type OperatoryDefaults = { id: string; name: string };

export function OperatoryFormDialog({ operatory }: { operatory?: OperatoryDefaults }) {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const uid = useId();
  const editing = Boolean(operatory);

  return (
    <FormDialog
      key={operatory?.id ?? 'new'}
      action={saveOperatory}
      resetOnSuccess={!editing}
      title={editing ? t('operatoryEdit') : t('operatoryNew')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={editing ? t('operatoryEdit') : t('operatoryNew')}
      triggerClassName={editing ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}
      trigger={
        editing ? (
          <>
            <Pencil size={18} aria-hidden />
            <span className="sr-only">{t('operatoryEdit')}</span>
          </>
        ) : (
          <>
            <Plus size={20} aria-hidden />
            {t('operatoryNew')}
          </>
        )
      }
    >
      {operatory ? <input type="hidden" name="id" value={operatory.id} /> : null}

      <TextField
        id={`${uid}-name`}
        name="name"
        label={tc('name')}
        hint={t('operatoryNameHint')}
        required
        defaultValue={operatory?.name}
      />
    </FormDialog>
  );
}
