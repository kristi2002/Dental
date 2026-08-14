'use client';

import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import {
  ContactFields,
  GuardianFields,
  IdentityFields,
  MedicalField,
  RecordFields,
  type PatientDefaults,
} from '@/components/patients/PatientFields';
import { FormDialog } from '@/components/ui/FormDialog';
import { savePatient } from '@/lib/actions/patients';

export type { PatientDefaults };

/**
 * Correcting a record you are already looking at.
 *
 * Registering somebody is a page — `/patients/new` — because it is a form to be
 * worked through. Editing is the opposite errand: one wrong digit in a phone
 * number, fixed from the record it is wrong on, without losing your place in it.
 */
export function PatientFormDialog({
  patient,
  referralSources = [],
  triggerClassName,
  compact = false,
  canEditMedical = true,
}: {
  patient: PatientDefaults;
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
  const uid = useId();

  return (
    <FormDialog
      key={patient.id}
      action={savePatient}
      resetOnSuccess={false}
      title={t('edit')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={t('edit')}
      triggerClassName={triggerClassName ?? 'btn btn-secondary'}
      trigger={
        <>
          <Pencil size={19} aria-hidden />
          {compact ? <span className="sr-only">{t('edit')}</span> : tc('edit')}
        </>
      }
    >
      <input type="hidden" name="id" value={patient.id} />

      <IdentityFields uid={uid} patient={patient} />

      <fieldset className="grid gap-4 rounded-lg border border-line p-3.5 sm:grid-cols-3">
        <legend className="px-1 font-bold text-ink">{t('contactTitle')}</legend>
        <ContactFields uid={uid} patient={patient} />
      </fieldset>

      <fieldset className="grid gap-4 rounded-lg border border-line p-3.5 sm:grid-cols-2">
        <legend className="px-1 font-bold text-ink">{t('guardianTitle')}</legend>
        <GuardianFields uid={uid} patient={patient} />
      </fieldset>

      <RecordFields uid={uid} patient={patient} referralSources={referralSources} />

      {canEditMedical ? <MedicalField uid={uid} patient={patient} /> : null}
    </FormDialog>
  );
}
