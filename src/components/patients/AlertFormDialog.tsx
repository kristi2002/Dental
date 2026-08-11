'use client';

import { Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveAlert } from '@/lib/actions/alerts';

export const ALERT_KINDS = [
  'ALLERGY',
  'ANTICOAGULANT',
  'PREGNANCY',
  'DIABETES',
  'CARDIAC_PROPHYLAXIS',
  'LATEX',
  'PACEMAKER',
  'BISPHOSPHONATE',
  'OTHER',
] as const;

export const ALERT_SEVERITIES = ['CRITICAL', 'IMPORTANT', 'INFO'] as const;

export type AlertDefaults = {
  id: string;
  kind: string;
  substance: string;
  severity: string;
  notes: string;
};

export function AlertFormDialog({
  patientId,
  alert,
}: {
  patientId: string;
  alert?: AlertDefaults;
}) {
  const t = useTranslations('alerts');
  const tc = useTranslations('common');
  const uid = useId();
  const editing = Boolean(alert);

  // An allergy that does not name its substance cannot be checked against a
  // prescription, so the field appears — and is required — only for that kind.
  const [kind, setKind] = useState(alert?.kind ?? 'ALLERGY');

  return (
    <FormDialog
      key={alert?.id ?? 'new'}
      action={saveAlert}
      resetOnSuccess={!editing}
      onClose={() => setKind(alert?.kind ?? 'ALLERGY')}
      title={editing ? t('edit') : t('new')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={editing ? t('edit') : t('new')}
      triggerClassName={editing ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}
      trigger={
        editing ? (
          <>
            <Pencil size={18} aria-hidden />
            <span className="sr-only">{t('edit')}</span>
          </>
        ) : (
          <>
            <Plus size={20} aria-hidden />
            {t('new')}
          </>
        )
      }
    >
      <input type="hidden" name="patientId" value={patientId} />
      {alert ? <input type="hidden" name="id" value={alert.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id={`${uid}-kind`}
          name="kind"
          label={t('kind')}
          defaultValue={alert?.kind ?? 'ALLERGY'}
          onChange={(event) => setKind(event.target.value)}
        >
          {ALERT_KINDS.map((option) => (
            <option key={option} value={option}>
              {t(`kind_${option}`)}
            </option>
          ))}
        </SelectField>

        <SelectField
          id={`${uid}-severity`}
          name="severity"
          label={t('severity')}
          defaultValue={alert?.severity ?? 'IMPORTANT'}
        >
          {ALERT_SEVERITIES.map((option) => (
            <option key={option} value={option}>
              {t(`severity_${option}`)}
            </option>
          ))}
        </SelectField>
      </div>

      {kind === 'ALLERGY' || kind === 'LATEX' || kind === 'OTHER' ? (
        <TextField
          id={`${uid}-substance`}
          name="substance"
          label={t('substance')}
          hint={t('substanceHint')}
          required={kind === 'ALLERGY'}
          defaultValue={alert?.substance}
          placeholder="Penicilinë"
        />
      ) : null}

      <TextAreaField
        id={`${uid}-notes`}
        name="notes"
        label={tc('notes')}
        optional={tc('optional')}
        rows={3}
        defaultValue={alert?.notes}
      />
    </FormDialog>
  );
}
