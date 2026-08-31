'use client';

import { Clock, Stethoscope } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { CatalogueFields, DurationField, NameField } from '@/components/services/ServiceFields';
import { FormActions, FormLayout, FormPreview, FormSection } from '@/components/ui/FormPage';
import { saveService } from '@/lib/actions/services';
import { useRecoveredForm } from '@/lib/form-recovery';
import type { ServiceCategoryOption } from '@/lib/queries';

/**
 * Adding a treatment to the catalogue, as a screen rather than as a dialog.
 *
 * The catalogue is built once, at the start, usually straight off the practice's
 * own price list and a dozen treatments at a sitting. Each entry carries two
 * decisions that reach far beyond this form — where it is filed and how long it
 * takes — and every screen in the app quotes them afterwards. A modal scrolled
 * its own little window inside the page and lost everything if it was dismissed
 * by accident.
 *
 * Editing stays a dialog — that is a price-list correction to a row you are
 * already looking at.
 */
export function NewServiceForm({ categories }: { categories: ServiceCategoryOption[] }) {
  const t = useTranslations('services');
  const tc = useTranslations('common');
  const uid = useId();

  const { state, formAction, formRef } = useRecoveredForm(saveService);

  // What the catalogue row will look like once saved, kept in step as it is
  // built. The department and the subcategory are named rather than shown as
  // ids, because "Kirurgji · Implante" is the line the booking form will offer.
  const [preview, setPreview] = useState({
    name: '',
    departmentId: '',
    subcategoryId: '',
    durationMin: '30',
  });

  const department = categories.find((option) => option.id === preview.departmentId);
  const subcategory = categories.find((option) => option.id === preview.subcategoryId);
  const minutes = Math.max(0, Number(preview.durationMin) || 0);

  return (
    <form ref={formRef} action={formAction}>
      <FormLayout
        aside={
          <FormPreview title={t('previewTitle')}>
            <p className="text-lead font-bold text-ink">
              {preview.name.trim() || <span className="text-ink-faint">{t('new')}</span>}
            </p>

            <p className="mt-1 text-body text-ink-soft">
              {[department?.name || t('uncategorized'), subcategory?.name]
                .filter(Boolean)
                .join(' · ')}
            </p>

            <p className="mt-3 text-lead font-bold tabular-nums text-ink">
              {minutes} <span className="text-meta font-semibold">{tc('minutes')}</span>
            </p>
          </FormPreview>
        }
      >
        <FormSection
          title={t('sectionIdentity')}
          subtitle={t('sectionIdentityHint')}
          icon={<Stethoscope size={22} aria-hidden />}
        >
          <NameField
            uid={uid}
            onChange={(name) => setPreview((current) => ({ ...current, name }))}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <CatalogueFields
              uid={uid}
              categories={categories}
              onChange={(chosen) => setPreview((current) => ({ ...current, ...chosen }))}
            />
          </div>
        </FormSection>

        <FormSection
          title={t('sectionDuration')}
          subtitle={t('sectionDurationHint')}
          icon={<Clock size={22} aria-hidden />}
        >
          <DurationField
            uid={uid}
            onChange={(durationMin) => setPreview((current) => ({ ...current, durationMin }))}
          />
        </FormSection>
      </FormLayout>

      <FormActions
        state={state}
        cancelHref="/services"
        cancelLabel={tc('cancel')}
        discardMessage={tc('discardUnsaved')}
        saveLabel={tc('save')}
        pendingLabel={tc('saving')}
      />
    </form>
  );
}
