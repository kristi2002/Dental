'use client';

import { Pill } from 'lucide-react';
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

  return (
    <FormDialog
      action={issuePrescription}
      onClose={() => {
        setTemplateId('');
        setBody('');
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
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="templateId" value={templateId} />

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
    </FormDialog>
  );
}
