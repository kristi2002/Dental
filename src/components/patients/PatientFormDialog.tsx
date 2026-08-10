'use client';

import { Pencil, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { savePatient } from '@/lib/actions/patients';

export type PatientDefaults = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  /** `YYYY-MM-DD`, or empty. */
  dateOfBirth: string;
  medicalNotes: string;
};

export function PatientFormDialog({
  patient,
  triggerClassName,
  compact = false,
}: {
  patient?: PatientDefaults;
  triggerClassName?: string;
  /** Icon-only trigger, for use inside a crowded header. */
  compact?: boolean;
}) {
  const t = useTranslations('patients');
  const tc = useTranslations('common');
  const editing = Boolean(patient);
  const uid = useId();

  return (
    <FormDialog
      key={patient?.id ?? 'new'}
      action={savePatient}
      resetOnSuccess={!editing}
      title={editing ? t('edit') : t('new')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={editing ? t('edit') : t('new')}
      triggerClassName={triggerClassName ?? (editing ? 'btn btn-secondary' : 'btn btn-primary')}
      trigger={
        editing ? (
          <>
            <Pencil size={19} aria-hidden />
            {compact ? <span className="sr-only">{t('edit')}</span> : tc('edit')}
          </>
        ) : (
          <>
            <UserPlus size={20} aria-hidden />
            {t('new')}
          </>
        )
      }
    >
      {patient ? <input type="hidden" name="id" value={patient.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${uid}-firstName`}
          name="firstName"
          label={t('firstName')}
          required
          autoComplete="off"
          defaultValue={patient?.firstName}
        />
        <TextField
          id={`${uid}-lastName`}
          name="lastName"
          label={t('lastName')}
          required
          autoComplete="off"
          defaultValue={patient?.lastName}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${uid}-phone`}
          name="phone"
          type="tel"
          inputMode="tel"
          label={t('phone')}
          required
          placeholder="069 12 34 567"
          defaultValue={patient?.phone}
        />
        <TextField
          id={`${uid}-dateOfBirth`}
          name="dateOfBirth"
          type="date"
          label={t('dateOfBirth')}
          optional={tc('optional')}
          defaultValue={patient?.dateOfBirth}
        />
      </div>

      <TextField
        id={`${uid}-email`}
        name="email"
        type="email"
        label={t('email')}
        optional={tc('optional')}
        defaultValue={patient?.email}
      />

      <TextAreaField
        id={`${uid}-medicalNotes`}
        name="medicalNotes"
        label={t('medicalNotes')}
        hint={t('medicalNotesHint')}
        optional={tc('optional')}
        rows={4}
        defaultValue={patient?.medicalNotes}
      />
    </FormDialog>
  );
}
