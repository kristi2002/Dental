'use client';

import { Phone, StickyNote, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { ContactFields, NameField, NotesField } from '@/components/stock/SupplierFields';
import { FormActions, FormLayout, FormPreview, FormSection } from '@/components/ui/FormPage';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { saveSupplier } from '@/lib/actions/stock';
import { useRecoveredForm } from '@/lib/form-recovery';

/**
 * Recording who to buy from, as a screen rather than as a dialog.
 *
 * The suppliers are entered once, at the start, off whatever the practice
 * currently keeps in a phone or a notebook — and then two or three more are
 * added in the same sitting, which is what the second button is for. A page also
 * has room for the notes field to be a field rather than a cramped afterthought:
 * "ask for Genti, deliveries Tuesdays only" is the part that actually gets an
 * order placed.
 *
 * Editing stays a dialog — that is a changed phone number on a row you are
 * already looking at.
 */
export function NewSupplierForm() {
  const t = useTranslations('suppliers');
  const tc = useTranslations('common');
  const uid = useId();

  const { state, formAction, formRef } = useRecoveredForm(saveSupplier);

  const [preview, setPreview] = useState({ name: '', phone: '', email: '' });

  return (
    <form ref={formRef} action={formAction}>
      <FormLayout
        aside={
          <FormPreview title={t('previewTitle')}>
            <p className="text-[1.12rem] font-bold text-ink">
              {preview.name.trim() || <span className="text-ink-faint">{t('new')}</span>}
            </p>
            <p className="mt-1 text-[0.95rem] text-ink-soft">
              {[preview.phone.trim(), preview.email.trim()].filter(Boolean).join(' · ') ||
                t('noContact')}
            </p>
          </FormPreview>
        }
      >
        <FormSection
          title={t('sectionIdentity')}
          subtitle={t('sectionIdentityHint')}
          icon={<Truck size={22} aria-hidden />}
        >
          <NameField
            uid={uid}
            onChange={(name) => setPreview((current) => ({ ...current, name }))}
          />
        </FormSection>

        <FormSection
          title={t('sectionContact')}
          subtitle={t('sectionContactHint')}
          icon={<Phone size={22} aria-hidden />}
          className="grid gap-4 p-5 sm:grid-cols-2"
        >
          <ContactFields
            uid={uid}
            onChange={(field, value) => setPreview((current) => ({ ...current, [field]: value }))}
          />
        </FormSection>

        <FormSection
          title={tc('notes')}
          subtitle={t('sectionNotesHint')}
          icon={<StickyNote size={22} aria-hidden />}
        >
          <NotesField uid={uid} />
        </FormSection>
      </FormLayout>

      <FormActions
        state={state}
        cancelHref="/stock/suppliers"
        cancelLabel={tc('cancel')}
        saveLabel={tc('save')}
        pendingLabel={tc('saving')}
        secondary={
          <SubmitButton
            name="again"
            value="1"
            variant="secondary"
            label={tc('saveAndAddAnother')}
            pendingLabel={tc('saving')}
          />
        }
      />
    </form>
  );
}
