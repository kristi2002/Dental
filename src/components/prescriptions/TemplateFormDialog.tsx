'use client';

import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import type { ServiceOption } from '@/components/appointments/AppointmentFormDialog';
import {
  AfterTreatmentField,
  BodyField,
  NamingFields,
  type TemplateDefaults,
} from '@/components/prescriptions/TemplateFields';
import { FormDialog } from '@/components/ui/FormDialog';
import { savePrescriptionTemplate } from '@/lib/actions/prescriptions';

export type { TemplateDefaults };

/**
 * Correcting a standard wording you are already looking at.
 *
 * Writing one is a page — `/prescriptions/templates/new` — because the text is
 * the deliverable and deserves the room. This is the opposite errand: a dosage
 * that changed, a treatment that should have been linked, fixed from the row it
 * is wrong on.
 */
export function TemplateFormDialog({
  template,
  categories,
  services = [],
}: {
  template: TemplateDefaults;
  categories: string[];
  /** The catalogue, so the wording can be tied to the work it follows. */
  services?: ServiceOption[];
}) {
  const t = useTranslations('prescriptions');
  const tc = useTranslations('common');
  const uid = useId();

  return (
    <FormDialog
      key={template.id}
      action={savePrescriptionTemplate}
      resetOnSuccess={false}
      title={t('editTemplate')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={t('editTemplate')}
      triggerClassName="btn btn-secondary btn-sm"
      trigger={
        <>
          <Pencil size={17} aria-hidden />
          <span className="sr-only">{t('editTemplate')}</span>
        </>
      }
    >
      <input type="hidden" name="id" value={template.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <NamingFields uid={uid} template={template} categories={categories} />
      </div>

      {services.length > 0 ? (
        <fieldset>
          <legend className="field-label">{t('afterTreatment')}</legend>
          <AfterTreatmentField template={template} services={services} />
        </fieldset>
      ) : null}

      <BodyField uid={uid} template={template} />
    </FormDialog>
  );
}
