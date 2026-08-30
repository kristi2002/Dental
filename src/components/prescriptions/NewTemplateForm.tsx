'use client';

import { FileText, Pill, Stethoscope } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import type { ServiceOption } from '@/components/appointments/AppointmentFormDialog';
import {
  AfterTreatmentField,
  BodyField,
  NamingFields,
} from '@/components/prescriptions/TemplateFields';
import { Badge } from '@/components/ui/Badge';
import { FormActions, FormLayout, FormPreview, FormSection } from '@/components/ui/FormPage';
import { savePrescriptionTemplate } from '@/lib/actions/prescriptions';
import { useRecoveredForm } from '@/lib/form-recovery';

/**
 * Writing a standard wording, as a screen rather than as a dialog.
 *
 * The templates are written once and then read out to patients for years, so
 * this is the one form in the app where the *text* is the deliverable — dosage,
 * frequency, what to do if it gets worse. A modal gave it eight cramped rows
 * behind a scrollbar and put the treatments it follows in a box of their own,
 * also scrolling. A page gives the wording the room it is going to be judged on,
 * and shows it back as it will read.
 *
 * Editing stays a dialog — that is a dosage corrected on a row you are already
 * looking at.
 */
export function NewTemplateForm({
  categories,
  services,
}: {
  categories: string[];
  services: ServiceOption[];
}) {
  const t = useTranslations('prescriptions');
  const tc = useTranslations('common');
  const uid = useId();

  const { state, formAction, formRef } = useRecoveredForm(savePrescriptionTemplate);

  const [preview, setPreview] = useState({ name: '', category: '', body: '', linked: 0 });

  return (
    <form ref={formRef} action={formAction}>
      <FormLayout
        aside={
          /* The wording as the row will show it. The body is the whole point of
             the record, so it is what the preview is mostly made of. */
          <FormPreview title={t('previewTitle')}>
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-[1.08rem] font-bold text-ink">
                {preview.name.trim() || <span className="text-ink-faint">{t('newTemplate')}</span>}
              </span>
              {preview.category.trim() ? <Badge>{preview.category.trim()}</Badge> : null}
            </p>

            {preview.linked > 0 ? (
              <p className="mt-1 text-[0.92rem] text-ink-soft">
                {t('afterTreatmentCount', { count: preview.linked })}
              </p>
            ) : null}

            <p className="mt-2 text-[0.95rem] whitespace-pre-line text-ink-soft">
              {preview.body.trim() || (
                <span className="text-ink-faint">{t('templateBodyHint')}</span>
              )}
            </p>
          </FormPreview>
        }
      >
        <FormSection
          title={t('sectionNaming')}
          subtitle={t('sectionNamingHint')}
          icon={<Pill size={22} aria-hidden />}
          className="grid gap-4 p-5 sm:grid-cols-2"
        >
          <NamingFields
            uid={uid}
            categories={categories}
            onChange={(field, value) => setPreview((current) => ({ ...current, [field]: value }))}
          />
        </FormSection>

        {services.length > 0 ? (
          <FormSection
            title={t('afterTreatment')}
            subtitle={t('sectionAfterTreatmentHint')}
            icon={<Stethoscope size={22} aria-hidden />}
          >
            <AfterTreatmentField
              services={services}
              scroll={false}
              onChange={(linked) => setPreview((current) => ({ ...current, linked }))}
            />
          </FormSection>
        ) : null}

        <FormSection
          title={t('body')}
          subtitle={t('sectionBodyHint')}
          icon={<FileText size={22} aria-hidden />}
        >
          <BodyField
            uid={uid}
            rows={12}
            labelHidden
            onChange={(body) => setPreview((current) => ({ ...current, body }))}
          />
        </FormSection>
      </FormLayout>

      <FormActions
        state={state}
        cancelHref="/prescriptions"
        cancelLabel={tc('cancel')}
        discardMessage={tc('discardUnsaved')}
        saveLabel={tc('save')}
        pendingLabel={tc('saving')}
      />
    </form>
  );
}
