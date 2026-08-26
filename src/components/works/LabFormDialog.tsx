'use client';

import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { LabFields, type LabDefaults } from '@/components/works/LabFields';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveLab } from '@/lib/actions/labs';

/**
 * Correcting a laboratory you are already looking at — most often adding the
 * telephone number the migration could not know.
 *
 * Naming a new one is a page; this is one row fixed without losing your place.
 * The same split the procedures catalogue and the shelves both use.
 */
export function LabFormDialog({ lab }: { lab: LabDefaults & { id: string } }) {
  const t = useTranslations('labs');
  const tc = useTranslations('common');
  const uid = useId();

  return (
    <FormDialog
      key={lab.id}
      action={saveLab}
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
      <input type="hidden" name="id" value={lab.id} />
      <LabFields uid={uid} lab={lab} />
    </FormDialog>
  );
}
