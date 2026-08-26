'use client';

import { Building2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { LabFields } from '@/components/works/LabFields';
import { FormActions, FormLayout, FormSection } from '@/components/ui/FormPage';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { saveLab } from '@/lib/actions/labs';
import { useRecoveredForm } from '@/lib/form-recovery';

/**
 * Naming a laboratory, as a screen rather than a dialog.
 *
 * The same reasoning as the procedures catalogue: the list is written out in one
 * pass — a practice sends to two or three — so the form stays put, clears
 * itself, and keeps what has been named so far in view.
 *
 * Most practices will arrive here having named nothing, because the migration
 * that created this table already turned every spelling in the register into a
 * row. This is for the laboratory that has not been sent anything yet.
 */
export function NewLabForm({ existing }: { existing: string[] }) {
  const t = useTranslations('labs');
  const tc = useTranslations('common');
  const uid = useId();

  const { state, formAction, formRef } = useRecoveredForm(saveLab);

  return (
    <form ref={formRef} action={formAction}>
      <FormLayout>
        <FormSection
          title={t('sectionNaming')}
          subtitle={t('sectionNamingHint')}
          icon={<Building2 size={22} aria-hidden />}
        >
          <LabFields uid={uid} />

          {/* What is already named, in front of somebody about to type a name.
              On the third pass this list is the only thing stopping the drift
              the whole table exists to end being typed straight back in. */}
          {existing.length > 0 ? (
            <div>
              <p className="field-label">{t('alreadyNamed')}</p>
              <p className="text-[0.95rem] text-ink-soft">{existing.join(' · ')}</p>
            </div>
          ) : null}
        </FormSection>
      </FormLayout>

      <FormActions
        state={state}
        cancelHref="/works/labs"
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
