'use client';

import { FlaskConical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { TextField } from '@/components/ui/Field';
import { FormActions, FormLayout, FormSection } from '@/components/ui/FormPage';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { saveWorkProcedure } from '@/lib/actions/work-procedures';
import { useRecoveredForm } from '@/lib/form-recovery';

/**
 * Naming a kind of work, as a screen rather than a dialog.
 *
 * The list is written out in one pass — a practice sends out six or eight kinds
 * of work and names them all in a sitting — so the form stays put, clears
 * itself, and keeps what has been named so far in view. On the third pass that
 * list is the only thing stopping "Kurorë zirkoni" being typed again beside
 * "Kurore zirkoni", which is the exact state this catalogue exists to end.
 */
export function NewProcedureForm({ existing }: { existing: string[] }) {
  const t = useTranslations('workProcedures');
  const tc = useTranslations('common');
  const uid = useId();

  const { state, formAction, formRef } = useRecoveredForm(saveWorkProcedure);
  const [name, setName] = useState('');

  return (
    <form ref={formRef} action={formAction}>
      <FormLayout>
        <FormSection
          title={t('sectionNaming')}
          subtitle={t('sectionNamingHint')}
          icon={<FlaskConical size={22} aria-hidden />}
        >
          <TextField
            id={`${uid}-name`}
            name="name"
            label={tc('name')}
            hint={t('nameHint')}
            placeholder={t('namePlaceholder')}
            required
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />

          {existing.length > 0 ? (
            <div>
              <p className="field-label">{t('alreadyNamed')}</p>
              <ul className="flex flex-wrap gap-1.5">
                {existing.map((procedure) => (
                  <li
                    key={procedure}
                    className="rounded-full border border-line-strong bg-surface px-3 py-1 text-[0.9rem] font-semibold text-ink-soft"
                  >
                    {procedure}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </FormSection>
      </FormLayout>

      <FormActions
        state={state}
        cancelHref="/works/procedures"
        cancelLabel={tc('cancel')}
        discardMessage={tc('discardUnsaved')}
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
