'use client';

import { Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveStep } from '@/lib/actions/plans';

export type StepDefaults = {
  id: string;
  title: string;
  toothNum: number | null;
  notes: string;
};

export function StepFormDialog({ planId, step }: { planId: string; step?: StepDefaults }) {
  const t = useTranslations('plans');
  const tc = useTranslations('common');
  const tt = useTranslations('teeth');
  const uid = useId();
  const editing = Boolean(step);

  return (
    <FormDialog
      key={step?.id ?? 'new'}
      action={saveStep}
      resetOnSuccess={!editing}
      title={editing ? t('editStep') : t('addStep')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={editing ? t('editStep') : t('addStep')}
      triggerClassName="btn btn-ghost btn-sm"
      trigger={
        editing ? (
          <>
            <Pencil size={16} aria-hidden />
            <span className="sr-only">{t('editStep')}</span>
          </>
        ) : (
          <>
            <Plus size={17} aria-hidden />
            {t('addStep')}
          </>
        )
      }
    >
      <input type="hidden" name="planId" value={planId} />
      {step ? <input type="hidden" name="id" value={step.id} /> : null}

      <TextField
        id={`${uid}-title`}
        name="title"
        label={t('stepTitle')}
        required
        defaultValue={step?.title}
      />

      <TextField
        id={`${uid}-tooth`}
        name="toothNum"
        type="number"
        min={1}
        max={32}
        label={tt('title')}
        optional={tc('optional')}
        hint={t('toothHint')}
        defaultValue={step?.toothNum ?? ''}
      />

      <TextAreaField
        id={`${uid}-notes`}
        name="notes"
        label={tc('notes')}
        optional={tc('optional')}
        rows={3}
        defaultValue={step?.notes}
      />
    </FormDialog>
  );
}
