'use client';

import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveWorkProcedure } from '@/lib/actions/work-procedures';

export type ProcedureDefaults = {
  id: string;
  name: string;
};

/**
 * Correcting the name of a kind of work you are already looking at.
 *
 * Naming a new one is a page — `/works/procedures/new` — because the list is
 * written out in one sitting. This is the opposite errand: one row, one word,
 * fixed without losing your place. Same split as the shelves.
 */
export function ProcedureFormDialog({ procedure }: { procedure: ProcedureDefaults }) {
  const t = useTranslations('workProcedures');
  const tc = useTranslations('common');
  const uid = useId();

  return (
    <FormDialog
      key={procedure.id}
      action={saveWorkProcedure}
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
      <input type="hidden" name="id" value={procedure.id} />

      <TextField
        id={`${uid}-name`}
        name="name"
        label={tc('name')}
        hint={t('nameHint')}
        required
        defaultValue={procedure.name}
      />
    </FormDialog>
  );
}
