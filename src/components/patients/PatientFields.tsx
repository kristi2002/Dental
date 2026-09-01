'use client';

import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';

export type PatientDefaults = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  /** `YYYY-MM-DD`, or empty. */
  dateOfBirth: string;
  /** A `PatientSex` value, or `''` for nobody having asked. */
  sex: string;
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

/**
 * The three answers, in the order they are offered.
 *
 * `''` sits above them and is the default, because "nobody has asked" is the
 * honest state of a form that has just been opened — and picking one for
 * somebody rather than leaving it blank is how a guess ends up in a medical
 * record. See `Patient.sex`.
 */
const SEXES = ['FEMALE', 'MALE', 'OTHER'] as const;

/**
 * One patient, five groups of fields — and no opinion about what surrounds them.
 *
 * The same questions are asked on the "new patient" page and in the edit dialog,
 * but the two frame them differently: the page gives each group a card with room
 * to explain itself, the dialog stacks them into fieldsets to stay inside a
 * modal. Only the chrome differs, so only the chrome is written twice.
 */
type Group = {
  /** Prefix for field ids, so two of these on one screen never collide. */
  uid: string;
  patient?: PatientDefaults;
};

/** Name, number, birthday, email — everything the desk searches by. */
export function IdentityFields({ uid, patient }: Group) {
  const t = useTranslations('patients');
  const tc = useTranslations('common');

  return (
    <>
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

      {/* Beside the birthday rather than in the medical section, because it is
          asked at the same moment and by the same person: both are on the
          registration slip somebody fills in at the desk, and the medical
          section needs `patient.medical.edit` that the front desk does not
          have. */}
      <SelectField
        id={`${uid}-sex`}
        name="sex"
        label={t('sex')}
        optional={tc('optional')}
        defaultValue={patient?.sex ?? ''}
      >
        <option value="">{t('sexUnknown')}</option>
        {SEXES.map((value) => (
          <option key={value} value={value}>
            {t(`sex_${value}`)}
          </option>
        ))}
      </SelectField>

      <TextField
        id={`${uid}-email`}
        name="email"
        type="email"
        label={t('email')}
        optional={tc('optional')}
        defaultValue={patient?.email}
      />
    </>
  );
}

/**
 * Messaging a patient needs a lawful basis, and "we always have" is not one.
 * Three states rather than a checkbox, because a record nobody has asked about
 * is not the same as a refusal — and only the refusal should stop a reminder
 * going out.
 */
export function ContactFields({ uid, patient }: Group) {
  const t = useTranslations('patients');
  const tc = useTranslations('common');

  return (
    <>
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
    </>
  );
}

/**
 * A child's phone number is their parent's, and the consent form has to be
 * signed by them — without somewhere to put that, it ends up in the patient's
 * own fields, where it is simply wrong.
 */
export function GuardianFields({ uid, patient }: Group) {
  const t = useTranslations('patients');
  const tc = useTranslations('common');

  return (
    <>
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
    </>
  );
}

/** Address, billing, next of kin, where they came from, and when to call back. */
export function RecordFields({
  uid,
  patient,
  referralSources = [],
}: Group & {
  /** Answers already given, offered as autocomplete so they group in analytics. */
  referralSources?: string[];
}) {
  const t = useTranslations('patients');
  const tc = useTranslations('common');

  return (
    <>
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
    </>
  );
}

/** The chart, which the front desk is not allowed to keep. */
export function MedicalField({
  uid,
  patient,
  labelled = true,
}: Group & {
  /** Off where the heading above the field already carries the same words. */
  labelled?: boolean;
}) {
  const t = useTranslations('patients');
  const tc = useTranslations('common');

  return (
    <TextAreaField
      id={`${uid}-medicalNotes`}
      name="medicalNotes"
      label={t('medicalNotes')}
      labelHidden={!labelled}
      hint={labelled ? t('medicalNotesHint') : undefined}
      optional={labelled ? tc('optional') : undefined}
      rows={labelled ? 4 : 6}
      defaultValue={patient?.medicalNotes}
    />
  );
}

/**
 * Two people can genuinely share a number — a family does — so the duplicate
 * check is reported and overridable, never enforced. What it catches is the
 * second "Arta Krasniqi", created once at the desk and once from a booking,
 * whose history then lives in two places.
 */
export function DuplicateOverride({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const t = useTranslations('patients');

  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-warn bg-warn-soft px-3 py-2.5 font-semibold text-warn">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-4 shrink-0 accent-current"
      />
      <span className="flex items-start gap-1.5">
        <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
        {t('addAnyway')}
      </span>
    </label>
  );
}
