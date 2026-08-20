'use client';

import { AlarmClock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { SelectField, TextField } from '@/components/ui/Field';
import { FormActions, FormSection } from '@/components/ui/FormPage';
import { NoteEditor } from '@/components/ui/NoteEditor';
import { UrgentToggle } from '@/components/ui/UrgentToggle';
import { useRecoveredForm } from '@/lib/form-recovery';
import { saveFollowUp } from '@/lib/actions/follow-ups';
import { MAX_NOTES_LENGTH, MAX_TITLE_LENGTH } from '@/lib/follow-ups';
import type { StaffOption } from './FollowUpFormDialog';

/**
 * The whole of one follow-up, on a page.
 *
 * The dialog stays what it always was — eight words and a date, typed while
 * something else is half-finished on screen. This is the other half of that
 * split: the note that turned out to need a checklist, three attachments and a
 * paragraph explaining what the lab said last time.
 *
 * Same server action as the dialog, so there is one place that decides what a
 * valid line is. What differs is only how much room the fields are given.
 */
export function FollowUpDetailForm({
  followUp,
  staff,
  canEdit,
}: {
  followUp: {
    id: string;
    title: string;
    notes: string;
    /** `YYYY-MM-DD`. */
    dueAt: string;
    urgent: boolean;
    assignedToId: string;
  };
  staff: ReadonlyArray<StaffOption>;
  canEdit: boolean;
}) {
  const t = useTranslations('followUps');
  const tc = useTranslations('common');
  const uid = useId();
  const { state, formAction, formRef } = useRecoveredForm(saveFollowUp);

  return (
    <form ref={formRef} action={formAction} noValidate>
      <input type="hidden" name="id" value={followUp.id} />

      <FormSection
        title={t('detailTitle')}
        subtitle={t('detailSubtitle')}
        icon={<AlarmClock size={22} aria-hidden />}
        className="space-y-4 p-5"
      >
        <TextField
          id={`${uid}-title`}
          name="title"
          label={t('fieldTitle')}
          placeholder={t('fieldTitlePlaceholder')}
          maxLength={MAX_TITLE_LENGTH}
          required
          autoComplete="off"
          disabled={!canEdit}
          defaultValue={followUp.title}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id={`${uid}-dueAt`}
            name="dueAt"
            type="date"
            label={t('fieldDue')}
            hint={t('fieldDueHint')}
            required
            disabled={!canEdit}
            defaultValue={followUp.dueAt}
          />

          <SelectField
            id={`${uid}-assignedToId`}
            name="assignedToId"
            label={t('fieldAssignee')}
            optional={tc('optional')}
            disabled={!canEdit}
            defaultValue={followUp.assignedToId}
          >
            <option value="">{t('anyone')}</option>
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </SelectField>
        </div>

        <UrgentToggle
          name="priority"
          value="URGENT"
          defaultChecked={followUp.urgent}
          disabled={!canEdit}
          label={t('urgent')}
          hint={t('urgentHint')}
        />

        {/* `key` on the note, not on the form: the editor holds its text in
            state, so a note edited on another machine and pulled in by a
            revalidate would otherwise keep showing the stale copy. */}
        <NoteEditor
          key={followUp.notes}
          id={`${uid}-notes`}
          name="notes"
          label={tc('notes')}
          optional={tc('optional')}
          rows={10}
          maxLength={MAX_NOTES_LENGTH}
          defaultValue={followUp.notes}
        />
      </FormSection>

      {canEdit ? (
        <FormActions
          state={state}
          cancelHref="/follow-ups"
          cancelLabel={tc('cancel')}
          saveLabel={tc('save')}
          pendingLabel={tc('saving')}
        />
      ) : null}
    </form>
  );
}
