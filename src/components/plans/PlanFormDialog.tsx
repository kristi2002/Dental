'use client';

import { ListChecks, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { TreatmentPlanStatus } from '@/generated/prisma/enums';
import { savePlan } from '@/lib/actions/plans';

export type PlanDefaults = {
  id: string;
  title: string;
  notes: string;
  status: TreatmentPlanStatus;
};

const STATUSES = [
  TreatmentPlanStatus.ACTIVE,
  TreatmentPlanStatus.COMPLETED,
  TreatmentPlanStatus.CANCELLED,
] as const;

export function PlanFormDialog({
  patientId,
  plan,
}: {
  patientId: string;
  plan?: PlanDefaults;
}) {
  const t = useTranslations('plans');
  const tc = useTranslations('common');
  const uid = useId();
  const editing = Boolean(plan);

  return (
    <FormDialog
      key={plan?.id ?? 'new'}
      action={savePlan}
      resetOnSuccess={!editing}
      title={editing ? t('edit') : t('new')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={editing ? t('edit') : t('new')}
      triggerClassName={editing ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}
      trigger={
        editing ? (
          <>
            <Pencil size={17} aria-hidden />
            <span className="sr-only">{t('edit')}</span>
          </>
        ) : (
          <>
            <ListChecks size={18} aria-hidden />
            {t('new')}
          </>
        )
      }
    >
      <input type="hidden" name="patientId" value={patientId} />
      {plan ? <input type="hidden" name="id" value={plan.id} /> : null}

      <TextField
        id={`${uid}-title`}
        name="title"
        label={t('title_')}
        hint={t('titleHint')}
        required
        defaultValue={plan?.title}
      />

      {editing ? (
        <SelectField
          id={`${uid}-status`}
          name="status"
          label={t('status')}
          defaultValue={plan?.status}
        >
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`status_${status}`)}
            </option>
          ))}
        </SelectField>
      ) : (
        // A plan is normally dictated in one breath, so the opening steps are
        // typed as a list here rather than added one dialog at a time.
        <TextAreaField
          id={`${uid}-steps`}
          name="steps"
          label={t('steps')}
          hint={t('stepsHint')}
          rows={6}
          defaultValue=""
        />
      )}

      <TextAreaField
        id={`${uid}-notes`}
        name="notes"
        label={tc('notes')}
        optional={tc('optional')}
        rows={3}
        defaultValue={plan?.notes}
      />
    </FormDialog>
  );
}
