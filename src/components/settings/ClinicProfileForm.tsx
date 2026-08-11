'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useId } from 'react';
import { SelectField, TextField } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { saveClinicProfile } from '@/lib/actions/settings';
import { IDLE_STATE } from '@/lib/actions/types';

/**
 * Practice name and tooth numbering.
 *
 * Switching the numbering is safe by construction: charts are stored in FDI
 * whichever way this is set, so it changes the labels on the buttons and
 * nothing else. Worth saying out loud on the form, because "change how teeth
 * are numbered" sounds like it should renumber teeth.
 */
export function ClinicProfileForm({
  name,
  toothNumbering,
  canEdit,
}: {
  name: string;
  toothNumbering: string;
  canEdit: boolean;
}) {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const uid = useId();
  const [state, formAction] = useActionState(saveClinicProfile, IDLE_STATE);

  return (
    <form action={formAction}>
      <div className="grid gap-4 px-5 py-5 sm:grid-cols-2">
        <TextField
          id={`${uid}-name`}
          name="name"
          label={t('clinicName')}
          optional={tc('optional')}
          defaultValue={name}
          disabled={!canEdit}
        />

        <SelectField
          id={`${uid}-numbering`}
          name="toothNumbering"
          label={t('numbering')}
          hint={t('numberingHint')}
          defaultValue={toothNumbering}
          disabled={!canEdit}
        >
          <option value="FDI">{t('numbering_FDI')}</option>
          <option value="UNIVERSAL">{t('numbering_UNIVERSAL')}</option>
        </SelectField>
      </div>

      {canEdit ? (
        <div className="flex items-center justify-end gap-3 border-t border-line px-5 py-4">
          {state.status === 'error' ? (
            <p role="alert" className="mr-auto font-semibold text-danger">
              {state.message}
            </p>
          ) : null}
          {state.status === 'ok' ? (
            <p role="status" className="mr-auto font-semibold text-ok">
              {t('saved')}
            </p>
          ) : null}
          <SubmitButton label={tc('save')} pendingLabel={tc('saving')} />
        </div>
      ) : null}
    </form>
  );
}
