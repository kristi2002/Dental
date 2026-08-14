'use client';

import { Armchair } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { TextField } from '@/components/ui/Field';
import { FormActions, FormLayout, FormSection } from '@/components/ui/FormPage';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { saveOperatory } from '@/lib/actions/settings';
import { useRecoveredForm } from '@/lib/form-recovery';

/**
 * Naming a chair, as a screen rather than as a dialog.
 *
 * The chairs are named once, on the first day, and however many the practice has
 * are named in that one sitting — which is what the second button is for. The
 * number of them is also the single most consequential setting in the app: it is
 * what decides how much can be booked in parallel, so it is worth a screen that
 * shows what has been named so far rather than a modal that reopens empty.
 *
 * Editing stays a dialog — that is a rename on a row you are already looking at.
 */
export function NewOperatoryForm({ existing }: { existing: string[] }) {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const uid = useId();

  const { state, formAction, formRef } = useRecoveredForm(saveOperatory);
  const [name, setName] = useState('');

  return (
    <form ref={formRef} action={formAction}>
      <FormLayout>
        <FormSection
          title={t('operatoryNew')}
          subtitle={t('operatoriesSubtitle')}
          icon={<Armchair size={22} aria-hidden />}
        >
          <TextField
            id={`${uid}-name`}
            name="name"
            label={tc('name')}
            hint={t('operatoryNameHint')}
            required
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
          />

          {/* The chairs already named, and therefore how many the diary will
              offer. On the second and third pass through this form it is the
              only thing that answers "have I done this one yet". */}
          {existing.length > 0 ? (
            <div>
              <p className="field-label">{t('operatoriesNamed', { count: existing.length })}</p>
              <ul className="flex flex-wrap gap-1.5">
                {existing.map((room) => (
                  <li
                    key={room}
                    className="rounded-full border border-line-strong bg-surface px-3 py-1 text-[0.9rem] font-semibold text-ink-soft"
                  >
                    {room}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </FormSection>
      </FormLayout>

      <FormActions
        state={state}
        cancelHref="/settings"
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
