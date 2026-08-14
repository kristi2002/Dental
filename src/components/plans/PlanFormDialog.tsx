'use client';

import { Pencil } from 'lucide-react';
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

/**
 * Correcting a course of treatment you are already looking at.
 *
 * Writing one is a page — `/plans/new` — because building a sequence of steps
 * from the chart and the catalogue is a form to be worked through. This is the
 * opposite errand: the plan was called the wrong thing, or it should be marked
 * cancelled, fixed without losing your place in the record. The steps are not
 * here because they have their own controls on the plan itself, where they can
 * be ticked off, booked and reordered against the work as it actually went.
 */
export function PlanFormDialog({
  patientId,
  plan,
  titles = [],
}: {
  /** Who the plan belongs to — resubmitted unchanged, as the action requires it. */
  patientId: string;
  plan: PlanDefaults;
  /** Plan names already used, so a practice's own wording keeps repeating. */
  titles?: string[];
}) {
  const t = useTranslations('plans');
  const tc = useTranslations('common');
  const uid = useId();

  return (
    <FormDialog
      key={plan.id}
      action={savePlan}
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
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="id" value={plan.id} />

      <TextField
        id={`${uid}-title`}
        name="title"
        label={t('title_')}
        hint={t('titleHint')}
        required
        list={`${uid}-titles`}
        defaultValue={plan.title}
      />
      <datalist id={`${uid}-titles`}>
        {titles.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>

      <SelectField id={`${uid}-status`} name="status" label={t('status')} defaultValue={plan.status}>
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            {t(`status_${status}`)}
          </option>
        ))}
      </SelectField>

      <TextAreaField
        id={`${uid}-notes`}
        name="notes"
        label={tc('notes')}
        optional={tc('optional')}
        rows={3}
        defaultValue={plan.notes}
      />
    </FormDialog>
  );
}
