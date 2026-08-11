'use client';

import { Pill, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { SelectField, TextAreaField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { issuePrescription } from '@/lib/actions/prescriptions';

export type TemplateOption = { id: string; name: string; category: string; body: string };

export function PrescriptionDialog({
  patientId,
  patientName,
  templates,
}: {
  patientId: string;
  patientName: string;
  templates: TemplateOption[];
}) {
  const t = useTranslations('prescriptions');
  const tc = useTranslations('common');
  const uid = useId();

  const [templateId, setTemplateId] = useState('');
  const [body, setBody] = useState('');
  // Set only after the server reports a recorded allergy in the wording, and
  // cleared when the dialog closes: overriding it is a decision, never a default.
  const [force, setForce] = useState(false);

  return (
    <FormDialog
      action={issuePrescription}
      onClose={() => {
        setTemplateId('');
        setBody('');
        setForce(false);
      }}
      title={t('new')}
      submitLabel={t('issue')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerClassName="btn btn-primary btn-sm"
      trigger={
        <>
          <Pill size={18} aria-hidden />
          {t('new')}
        </>
      }
    >
      {(state) => (
        <>
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="templateId" value={templateId} />
      {force ? <input type="hidden" name="force" value="1" /> : null}

      <p className="text-[1rem] text-ink-soft">{t('forPatient', { name: patientName })}</p>

      <SelectField
        id={`${uid}-template`}
        name="template"
        label={t('template')}
        hint={t('templateHint')}
        value={templateId}
        onChange={(event) => {
          const chosen = templates.find((option) => option.id === event.target.value);
          setTemplateId(event.target.value);
          // The template fills the box once; from there it is free text, because
          // what gets issued is whatever the dentist actually wrote.
          if (chosen) setBody(chosen.body);
        }}
      >
        <option value="">{t('templateNone')}</option>
        {templates.map((option) => (
          <option key={option.id} value={option.id}>
            {option.category ? `${option.category} · ${option.name}` : option.name}
          </option>
        ))}
      </SelectField>

      <TextAreaField
        id={`${uid}-body`}
        name="body"
        label={t('body')}
        required
        rows={10}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />

      {state.status === 'error' && state.code === 'allergy' ? (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border-2 border-danger bg-danger-soft px-3 py-2.5 font-semibold text-danger">
          <input
            type="checkbox"
            checked={force}
            onChange={(event) => setForce(event.target.checked)}
            className="mt-1 size-4 shrink-0 accent-current"
          />
          <span className="flex items-start gap-1.5">
            <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
            {t('issueAnyway')}
          </span>
        </label>
      ) : null}
        </>
      )}
    </FormDialog>
  );
}
