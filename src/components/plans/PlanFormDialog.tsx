'use client';

import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { savePlan } from '@/lib/actions/plans';

export type PlanDefaults = {
  id: string;
  title: string;
  notes: string;
};

/**
 * Correcting a course of treatment you are already looking at.
 *
 * Writing one is a page — `/plans/new` — because building a sequence of steps
 * from the chart and the catalogue is a form to be worked through. This is the
 * opposite errand: the plan was called the wrong thing, fixed without losing
 * your place in the record. The steps are not here because they have their own
 * controls on the plan itself, where they can be ticked off, booked and
 * reordered against the work as it actually went.
 *
 * The status select is not here either, and that is the point of this comment.
 * It offered all three states as a free choice, and two of the three are not
 * choices: `syncPlanStatus` derives open and finished from the steps, so
 * picking "Finished" filed a plan with three outstanding steps in the archive
 * — where it sat, still needing the work, until somebody ticked a step off and
 * it silently reopened. Abandoning a plan is the one judgement the steps cannot
 * make and it has its own button on the row, next to the reason anybody would
 * press it.
 */
export function PlanFormDialog({
  patientId,
  plan,
  titles = [],
  triggerClassName = 'btn btn-secondary btn-sm',
}: {
  /** Who the plan belongs to — resubmitted unchanged, as the action requires it. */
  patientId: string;
  plan: PlanDefaults;
  /** Plan names already used, so a practice's own wording keeps repeating. */
  titles?: string[];
  /** Full class list for the trigger — `menu-item` when it sits in an overflow. */
  triggerClassName?: string;
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
      discardMessage={tc('discardUnsaved')}
      closeLabel={tc('close')}
      triggerTitle={t('edit')}
      triggerClassName={triggerClassName}
      trigger={
        <>
          <Pencil size={17} aria-hidden className="shrink-0" />
          <span className={triggerClassName === 'menu-item' ? '' : 'sr-only'}>{t('edit')}</span>
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
