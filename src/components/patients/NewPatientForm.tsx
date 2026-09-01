'use client';

import { Cake, ClipboardList, MessageCircle, Phone, Stethoscope, UserRound, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import {
  ContactFields,
  DuplicateOverride,
  GuardianFields,
  IdentityFields,
  MedicalField,
  RecordFields,
  type PatientDefaults,
} from '@/components/patients/PatientFields';
import { FormActions, FormLayout, FormPreview, FormSection } from '@/components/ui/FormPage';
import { savePatient } from '@/lib/actions/patients';
import { age } from '@/lib/dates';
import { useRecoveredForm } from '@/lib/form-recovery';
import { initials } from '@/lib/utils';

/**
 * Registering somebody, as a screen rather than as a dialog.
 *
 * This is the longest form in the app and the one most often filled in with a
 * patient standing at the desk, so it was the wrong thing to keep behind a
 * modal: a modal has no room to explain a group of fields, scrolls its own
 * little window inside the page, and loses everything typed if it is dismissed
 * by accident. A page can be left and come back to, deep-linked from anywhere,
 * and read in one pass.
 *
 * Editing stays a dialog — that is a correction to one field on a record you are
 * already looking at, not a form you work through.
 */
export function NewPatientForm({
  referralSources,
  canEditMedical,
  fromRequest,
}: {
  referralSources: string[];
  canEditMedical: boolean;
  /**
   * The public enquiry this registration came out of, when there is one.
   *
   * Prefills what the person already typed and posts its id back, which is what
   * `savePatient` links. Absent for the ordinary case — somebody standing at
   * the desk — and the form is exactly what it was.
   */
  fromRequest?: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    locale: string;
  };
}) {
  const t = useTranslations('patients');
  const tc = useTranslations('common');
  const uid = useId();

  const { state, formAction, formRef } = useRecoveredForm(savePatient);

  // Set only after the server reports somebody already using this number:
  // creating a second record for one person should be a decision, never a
  // default.
  const [force, setForce] = useState(false);

  // What the record will look like once saved, kept in step as it is typed. The
  // fields stay uncontrolled — this listens to the change events they bubble, so
  // the preview costs the form nothing and cannot fall out of sync with it.
  const [preview, setPreview] = useState({
    firstName: fromRequest?.firstName ?? '',
    lastName: fromRequest?.lastName ?? '',
    phone: fromRequest?.phone ?? '',
    dateOfBirth: '',
  });

  /**
   * The enquiry's answers, shaped as the field groups already expect them.
   *
   * `PatientDefaults` is the record's own shape and every field in it is
   * required, so a partial prefill is spelled out in full rather than cast —
   * everything an enquiry does not know is the empty string, which is what an
   * unfilled box is anyway.
   */
  const prefill: PatientDefaults | undefined = fromRequest
    ? {
        id: '',
        firstName: fromRequest.firstName,
        lastName: fromRequest.lastName,
        phone: fromRequest.phone,
        email: fromRequest.email,
        dateOfBirth: '',
        sex: '',
        medicalNotes: '',
        recallMonths: 6,
        // Writing in to ask for an appointment is not consent to be messaged
        // about anything else, so this stays at "nobody has asked". The one
        // thing the enquiry does settle is which language to write in.
        contactConsent: '',
        preferredChannel: '',
        locale: fromRequest.locale,
        guardianName: '',
        guardianPhone: '',
        address: '',
        fiscalCode: '',
        emergencyContact: '',
        referralSource: '',
      }
    : undefined;

  const fullName = `${preview.lastName} ${preview.firstName}`.trim();
  const born = preview.dateOfBirth ? new Date(`${preview.dateOfBirth}T00:00:00.000Z`) : null;
  const years = born && !Number.isNaN(born.getTime()) ? age(born) : null;

  return (
    <form
      ref={formRef}
      action={formAction}
      onChange={(event) => {
        const field = event.target;
        if (!(field instanceof HTMLInputElement)) return;
        if (field.name in preview) {
          setPreview((current) => ({ ...current, [field.name]: field.value }));
        }
      }}
    >
      {force ? <input type="hidden" name="force" value="1" /> : null}
      {fromRequest ? <input type="hidden" name="requestId" value={fromRequest.id} /> : null}

      <FormLayout
        aside={
          /* The card this form is building, as it is built. It is the same shape
             the patient list shows, so what is being made is what will be seen —
             and a first name typed into the surname box is obvious here long
             before it is filed that way. */
          <FormPreview title={t('previewTitle')}>
            <div className="flex items-start gap-4">
              <span
                aria-hidden
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-line-strong bg-paper text-body font-bold text-ink-soft"
              >
                {initials(preview.firstName, preview.lastName) || '—'}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-lead font-bold text-ink">
                  {fullName || <span className="text-ink-faint">{t('new')}</span>}
                </p>

                <p className="mt-1 flex items-center gap-1.5 text-body text-ink-soft">
                  <Phone size={15} aria-hidden />
                  <span className="truncate">
                    {preview.phone || <span className="text-ink-faint">{t('noPhone')}</span>}
                  </span>
                </p>

                {years !== null ? (
                  <p className="mt-0.5 flex items-center gap-1.5 text-body text-ink-faint">
                    <Cake size={15} aria-hidden />
                    {t('age', { age: years })}
                  </p>
                ) : null}
              </div>
            </div>
          </FormPreview>
        }
      >
        <FormSection
          title={t('sectionIdentity')}
          subtitle={t('sectionIdentityHint')}
          icon={<UserRound size={22} aria-hidden />}
        >
          <IdentityFields uid={uid} patient={prefill} />
        </FormSection>

        <FormSection
          title={t('contactTitle')}
          subtitle={t('contactHint')}
          icon={<MessageCircle size={22} aria-hidden />}
          className="grid gap-4 p-5 sm:grid-cols-3"
        >
          <ContactFields uid={uid} patient={prefill} />
        </FormSection>

        <FormSection
          title={t('guardianTitle')}
          subtitle={t('guardianHint')}
          icon={<Users size={22} aria-hidden />}
          className="grid gap-4 p-5 sm:grid-cols-2"
        >
          <GuardianFields uid={uid} />
        </FormSection>

        <FormSection
          title={t('sectionRecords')}
          subtitle={t('sectionRecordsHint')}
          icon={<ClipboardList size={22} aria-hidden />}
        >
          <RecordFields uid={uid} referralSources={referralSources} />
        </FormSection>

        {canEditMedical ? (
          <FormSection
            title={t('medicalNotes')}
            subtitle={t('medicalNotesHint')}
            icon={<Stethoscope size={22} aria-hidden />}
          >
            <MedicalField uid={uid} labelled={false} />
          </FormSection>
        ) : null}
      </FormLayout>

      <FormActions
        state={state}
        cancelHref="/patients"
        cancelLabel={tc('cancel')}
        discardMessage={tc('discardUnsaved')}
        saveLabel={tc('save')}
        pendingLabel={tc('saving')}
        belowError={
          state.status === 'error' && state.code === 'duplicate' ? (
            <DuplicateOverride checked={force} onChange={setForce} />
          ) : null
        }
      />
    </form>
  );
}
