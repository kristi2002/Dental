'use client';

import { AlarmClock, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { UrgentToggle } from '@/components/ui/UrgentToggle';
import { saveFollowUp } from '@/lib/actions/follow-ups';
import { MAX_TITLE_LENGTH } from '@/lib/follow-ups';

export type StaffOption = { id: string; name: string };

export type FollowUpDefaults = {
  id: string;
  title: string;
  notes: string;
  /** `YYYY-MM-DD`, for the date input. */
  dueAt: string;
  urgent: boolean;
  assignedToId: string;
};

/**
 * What a new line is about, taken from the screen it is being written on.
 *
 * Sent as hidden fields and never shown: somebody pressing "remind me" on a case
 * has already said which case, and offering a record picker afterwards would be
 * asking them to answer the same question twice. A line written from the bell
 * carries none of these and is about nothing in particular, which is a perfectly
 * ordinary kind of errand.
 */
export type FollowUpLinkFields = {
  patientId?: string;
  workId?: string;
  stockItemId?: string;
};

/**
 * Writing or correcting one line of the board.
 *
 * A dialog in both directions, unlike most records in this app — a follow-up is
 * a sentence and a date, and it is nearly always written while something else is
 * on screen and half-finished. Sending somebody to a page of their own to type
 * eight words is how the sticky note wins.
 */
export function FollowUpFormDialog({
  followUp,
  staff,
  today,
  link,
  triggerClassName = 'btn btn-primary',
  compact = false,
}: {
  /** Absent for a new line. */
  followUp?: FollowUpDefaults;
  staff: ReadonlyArray<StaffOption>;
  /** `YYYY-MM-DD` — what an empty date box means. */
  today: string;
  link?: FollowUpLinkFields;
  triggerClassName?: string;
  /** Icon-only trigger, for a row that is already busy. */
  compact?: boolean;
}) {
  const t = useTranslations('followUps');
  const tc = useTranslations('common');
  const uid = useId();

  const editing = followUp !== undefined;
  const label = editing ? t('edit') : t('new');

  return (
    <FormDialog
      key={followUp?.id ?? 'new'}
      action={saveFollowUp}
      // A new line clears itself so the next one starts blank; an edit keeps
      // what was typed, because the dialog is the record.
      resetOnSuccess={!editing}
      // The same width as the booking dialog. A follow-up is written mid-task,
      // usually over the top of something half-finished, and the narrow box put
      // the title — the one field that is a whole sentence — on a line barely
      // wider than the sentence itself.
      wide
      title={label}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={label}
      triggerClassName={triggerClassName}
      trigger={
        <>
          {editing ? <Pencil size={17} aria-hidden /> : <AlarmClock size={20} aria-hidden />}
          <span className={compact ? 'sr-only' : undefined}>{label}</span>
        </>
      }
    >
      {editing ? <input type="hidden" name="id" value={followUp.id} /> : null}
      {link?.patientId ? <input type="hidden" name="patientId" value={link.patientId} /> : null}
      {link?.workId ? <input type="hidden" name="workId" value={link.workId} /> : null}
      {link?.stockItemId ? (
        <input type="hidden" name="stockItemId" value={link.stockItemId} />
      ) : null}

      <TextField
        id={`${uid}-title`}
        name="title"
        label={t('fieldTitle')}
        placeholder={t('fieldTitlePlaceholder')}
        maxLength={MAX_TITLE_LENGTH}
        required
        autoComplete="off"
        defaultValue={followUp?.title ?? ''}
      />

      {/* `items-end` rather than the default stretch: the two halves are a pair
          and have to read as one row, so the inputs sit on a common baseline
          even when one hint wraps to a second line and the other does not. */}
      <div className="grid items-end gap-4 sm:grid-cols-2">
        <TextField
          id={`${uid}-dueAt`}
          name="dueAt"
          type="date"
          label={t('fieldDue')}
          hint={t('fieldDueHint')}
          required
          defaultValue={followUp?.dueAt ?? today}
        />

        <SelectField
          id={`${uid}-assignedToId`}
          name="assignedToId"
          label={t('fieldAssignee')}
          hint={t('fieldAssigneeHint')}
          optional={tc('optional')}
          defaultValue={followUp?.assignedToId ?? ''}
        >
          {/* Unassigned is the first option and the default: in a practice of
              four people who all answer the phone, "somebody" is usually the
              honest answer, and forcing a name invents an accountability the
              room does not actually have. */}
          <option value="">{t('anyone')}</option>
          {staff.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </SelectField>
      </div>

      {/* A flag, not a scale — see `FollowUpPriority` in the schema. Posting the
          enum's own value means an unticked box sends nothing and the action
          reads that as normal. */}
      <UrgentToggle
        name="priority"
        value="URGENT"
        defaultChecked={followUp?.urgent ?? false}
        label={t('urgent')}
        hint={t('urgentHint')}
      />

      <TextAreaField
        id={`${uid}-notes`}
        name="notes"
        label={tc('notes')}
        optional={tc('optional')}
        rows={2}
        defaultValue={followUp?.notes ?? ''}
      />
    </FormDialog>
  );
}
