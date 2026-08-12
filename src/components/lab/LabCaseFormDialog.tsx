'use client';

import { FlaskConical, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveLabCase } from '@/lib/actions/lab';
import { LAB_STATUSES } from '@/lib/lab';

export type LabCaseDefaults = {
  id: string;
  labName: string;
  kind: string;
  teeth: string;
  status: string;
  /** `YYYY-MM-DD` */
  sentAt: string;
  dueAt: string;
  notes: string;
};

export function LabCaseFormDialog({
  patientId,
  labCase,
  labNames,
  today,
}: {
  patientId: string;
  labCase?: LabCaseDefaults;
  /** Labs already used, offered as autocomplete so the spelling stays stable. */
  labNames: string[];
  /** `YYYY-MM-DD` default for the sent date. */
  today: string;
}) {
  const t = useTranslations('lab');
  const tc = useTranslations('common');
  const uid = useId();
  const editing = Boolean(labCase);
  const [status, setStatus] = useState(labCase?.status ?? 'SENT');

  return (
    <FormDialog
      key={labCase?.id ?? 'new'}
      action={saveLabCase}
      resetOnSuccess={!editing}
      onClose={() => setStatus(labCase?.status ?? 'SENT')}
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
            <Pencil size={18} aria-hidden />
            <span className="sr-only">{t('edit')}</span>
          </>
        ) : (
          <>
            <FlaskConical size={19} aria-hidden />
            {t('new')}
          </>
        )
      }
    >
      <input type="hidden" name="patientId" value={patientId} />
      {labCase ? <input type="hidden" name="id" value={labCase.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${uid}-kind`}
          name="kind"
          label={t('kind')}
          hint={t('kindHint')}
          required
          defaultValue={labCase?.kind}
        />
        <TextField
          id={`${uid}-lab`}
          name="labName"
          label={t('labName')}
          required
          list={`${uid}-labs`}
          defaultValue={labCase?.labName}
        />
      </div>
      <datalist id={`${uid}-labs`}>
        {labNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <TextField
        id={`${uid}-teeth`}
        name="teeth"
        label={t('teeth')}
        hint={t('teethHint')}
        optional={tc('optional')}
        defaultValue={labCase?.teeth}
        placeholder="46, 47"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          id={`${uid}-sent`}
          name="sentAt"
          type="date"
          label={t('sentAt')}
          defaultValue={labCase?.sentAt || today}
        />
        {/* The date the waiting-on list sorts by, and the only one that answers
            "will it be here before the fitting appointment?" */}
        <TextField
          id={`${uid}-due`}
          name="dueAt"
          type="date"
          label={t('dueAt')}
          optional={tc('optional')}
          defaultValue={labCase?.dueAt}
        />
        <SelectField
          id={`${uid}-status`}
          name="status"
          label={t('status')}
          defaultValue={labCase?.status ?? 'SENT'}
          onChange={(event) => setStatus(event.target.value)}
        >
          {LAB_STATUSES.map((option) => (
            <option key={option} value={option}>
              {t(`status_${option}`)}
            </option>
          ))}
        </SelectField>
      </div>

      {status === 'RECEIVED' || status === 'FITTED' ? (
        <TextField
          id={`${uid}-received`}
          name="receivedAt"
          type="date"
          label={t('receivedAt')}
          hint={t('receivedHint')}
          optional={tc('optional')}
          defaultValue={today}
        />
      ) : null}

      <TextAreaField
        id={`${uid}-notes`}
        name="notes"
        label={tc('notes')}
        optional={tc('optional')}
        rows={3}
        defaultValue={labCase?.notes}
      />
    </FormDialog>
  );
}
