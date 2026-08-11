'use client';

import { Pencil, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
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
  /** How often to recall this patient. 0 = never. */
  recallMonths: number;
  /** `''` = never asked, `'1'` = yes, `'0'` = no. */
  contactConsent: string;
  preferredChannel: string;
  locale: string;
  guardianName: string;
  guardianPhone: string;
  address: string;
  fiscalCode: string;
  emergencyContact: string;
  referralSource: string;
};

/** The intervals a clinic actually uses, plus "never" for the one-off patient. */
const RECALL_CHOICES = [0, 3, 4, 6, 12, 24] as const;

const CHANNELS = ['WHATSAPP', 'EMAIL', 'PHONE'] as const;

export function PatientFormDialog({
  patient,
  referralSources = [],
  triggerClassName,
  compact = false,
  canEditMedical = true,
}: {
  patient?: PatientDefaults;
  /** Answers already given, offered as autocomplete so they group in analytics. */
  referralSources?: string[];
  triggerClassName?: string;
  /** Icon-only trigger, for use inside a crowded header. */
  compact?: boolean;
  /** The front desk edits contact details; the notes field stays out of reach. */
  canEditMedical?: boolean;
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

      {/* Messaging a patient needs a lawful basis, and "we always have" is not
          one. Three states rather than a checkbox, because a record nobody has
          asked about is not the same as a refusal — and only the refusal should
          stop a reminder going out. */}
      <fieldset className="grid gap-4 rounded-lg border border-line p-3.5 sm:grid-cols-3">
        <legend className="px-1 font-bold text-ink">{t('contactTitle')}</legend>

        <SelectField
          id={`${uid}-contactConsent`}
          name="contactConsent"
          label={t('contactConsent')}
          defaultValue={patient?.contactConsent ?? ''}
        >
          <option value="">{t('consentUnknown')}</option>
          <option value="1">{t('consentYes')}</option>
          <option value="0">{t('consentNo')}</option>
        </SelectField>

        <SelectField
          id={`${uid}-preferredChannel`}
          name="preferredChannel"
          label={t('preferredChannel')}
          optional={tc('optional')}
          defaultValue={patient?.preferredChannel ?? ''}
        >
          <option value="">{tc('none')}</option>
          {CHANNELS.map((channel) => (
            <option key={channel} value={channel}>
              {t(`channel_${channel}`)}
            </option>
          ))}
        </SelectField>

        {/* Their language, not the receptionist's — this is what decides which
            language the reminder is actually written in. */}
        <SelectField
          id={`${uid}-locale`}
          name="locale"
          label={t('patientLocale')}
          optional={tc('optional')}
          defaultValue={patient?.locale ?? ''}
        >
          <option value="">{t('localeDefault')}</option>
          <option value="sq">Shqip</option>
          <option value="en">English</option>
          <option value="it">Italiano</option>
        </SelectField>
      </fieldset>

      {/* A child's phone number is their parent's, and the consent form has to
          be signed by them — without somewhere to put that, it ends up in the
          patient's own fields, where it is simply wrong. */}
      <fieldset className="grid gap-4 rounded-lg border border-line p-3.5 sm:grid-cols-2">
        <legend className="px-1 font-bold text-ink">{t('guardianTitle')}</legend>

        <TextField
          id={`${uid}-guardianName`}
          name="guardianName"
          label={t('guardianName')}
          optional={tc('optional')}
          defaultValue={patient?.guardianName}
        />
        <TextField
          id={`${uid}-guardianPhone`}
          name="guardianPhone"
          type="tel"
          inputMode="tel"
          label={t('guardianPhone')}
          optional={tc('optional')}
          defaultValue={patient?.guardianPhone}
        />
      </fieldset>

      <TextField
        id={`${uid}-address`}
        name="address"
        label={t('address')}
        optional={tc('optional')}
        defaultValue={patient?.address}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${uid}-fiscalCode`}
          name="fiscalCode"
          label={t('fiscalCode')}
          optional={tc('optional')}
          defaultValue={patient?.fiscalCode}
        />
        <TextField
          id={`${uid}-emergencyContact`}
          name="emergencyContact"
          label={t('emergencyContact')}
          optional={tc('optional')}
          defaultValue={patient?.emergencyContact}
        />
      </div>

      {/* The one CRM question an owner actually asks, and the statistics page
          could not answer at all without somewhere to record the answer. */}
      <TextField
        id={`${uid}-referralSource`}
        name="referralSource"
        label={t('referralSource')}
        hint={t('referralSourceHint')}
        optional={tc('optional')}
        list={`${uid}-referrals`}
        defaultValue={patient?.referralSource}
      />
      <datalist id={`${uid}-referrals`}>
        {referralSources.map((source) => (
          <option key={source} value={source} />
        ))}
      </datalist>

      <SelectField
        id={`${uid}-recallMonths`}
        name="recallMonths"
        label={t('recallEvery')}
        hint={t('recallHint')}
        defaultValue={String(patient?.recallMonths ?? 6)}
      >
        {RECALL_CHOICES.map((months) => (
          <option key={months} value={months}>
            {months === 0 ? t('recallOff') : t('recallMonths', { months })}
          </option>
        ))}
      </SelectField>

      {canEditMedical ? (
        <TextAreaField
          id={`${uid}-medicalNotes`}
          name="medicalNotes"
          label={t('medicalNotes')}
          hint={t('medicalNotesHint')}
          optional={tc('optional')}
          rows={4}
          defaultValue={patient?.medicalNotes}
        />
      ) : null}
    </FormDialog>
  );
}
