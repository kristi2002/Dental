'use client';

import { Merge, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormDialog } from '@/components/ui/FormDialog';
import { PatientPicker } from '@/components/patients/PatientPicker';
import { mergePatients } from '@/lib/actions/patients';
import type { PatientOption } from '@/components/appointments/AppointmentFormDialog';

/**
 * Fold a duplicate into this record.
 *
 * The direction is fixed and stated in words rather than offered as a choice:
 * the record you are standing on is the one that survives. A dialog that let you
 * pick either way round is a dialog where somebody picks the wrong way round,
 * and this is not undoable by pressing anything.
 */
export function MergeDialog({
  keepId,
  keepName,
  triggerClassName = 'btn btn-secondary',
}: {
  keepId: string;
  /** The survivor, named in the warning so the direction is unmistakable. */
  keepName: string;
  /** Full class list for the trigger — `menu-item` when it sits in an overflow. */
  triggerClassName?: string;
}) {
  const t = useTranslations('patients');
  const tc = useTranslations('common');
  const [chosen, setChosen] = useState<PatientOption | null>(null);

  return (
    <FormDialog
      action={mergePatients}
      resetOnSuccess={false}
      onClose={() => setChosen(null)}
      title={t('merge')}
      submitLabel={t('mergeConfirm')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={t('merge')}
      triggerClassName={triggerClassName}
      trigger={
        <>
          <Merge size={18} aria-hidden className="shrink-0" />
          <span className={triggerClassName === 'menu-item' ? '' : 'sr-only'}>{t('merge')}</span>
        </>
      }
    >
      <input type="hidden" name="keepId" value={keepId} />

      <p className="rounded-lg border border-warn bg-warn-soft px-3 py-2.5 font-semibold text-warn">
        <TriangleAlert size={18} aria-hidden className="mr-1.5 inline align-text-bottom" />
        {t('mergeWarning', { name: keepName })}
      </p>

      <PatientPicker
        name="mergeId"
        label={t('mergeWhich')}
        required
        onPick={setChosen}
      />

      {chosen ? (
        <p className="text-[0.95rem] text-ink-soft">
          {t('mergeExplain', { from: chosen.name, to: keepName })}
        </p>
      ) : null}
    </FormDialog>
  );
}
