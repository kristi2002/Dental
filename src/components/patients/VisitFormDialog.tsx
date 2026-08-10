'use client';

import { NotebookPen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveVisit } from '@/lib/actions/patients';
import { cn } from '@/lib/utils';

export function VisitFormDialog({
  patientId,
  serviceNames,
  today,
}: {
  patientId: string;
  /** Service catalog, offered as one-tap chips. */
  serviceNames: string[];
  /** `YYYY-MM-DD` default for the visit date. */
  today: string;
}) {
  const t = useTranslations('patients');
  const tc = useTranslations('common');
  const uid = useId();
  const [services, setServices] = useState('');

  function toggleService(name: string) {
    const current = services
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const next = current.includes(name)
      ? current.filter((s) => s !== name)
      : [...current, name];
    setServices(next.join(', '));
  }

  const selected = services
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <FormDialog
      action={saveVisit}
      onClose={() => setServices('')}
      title={t('addVisit')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      trigger={
        <>
          <NotebookPen size={20} aria-hidden />
          {t('addVisit')}
        </>
      }
    >
      <input type="hidden" name="patientId" value={patientId} />

      <TextField
        id={`${uid}-date`}
        name="visitDate"
        type="date"
        label={t('visitDate')}
        required
        defaultValue={today}
      />

      <TextAreaField
        id={`${uid}-notes`}
        name="notes"
        label={t('visitNotes')}
        required
        rows={4}
        defaultValue=""
      />

      <div>
        <TextField
          id={`${uid}-services`}
          name="services"
          label={t('visitServices')}
          hint={t('visitServicesHint')}
          value={services}
          onChange={(event) => setServices(event.target.value)}
        />

        {serviceNames.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {serviceNames.map((name) => {
              const active = selected.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleService(name)}
                  className={cn(
                    'rounded-full border-2 px-3 py-1.5 text-[0.9rem] font-semibold transition-colors',
                    active
                      ? 'border-brand-dark bg-brand text-white'
                      : 'border-line-strong bg-surface text-ink-soft hover:border-ink hover:text-ink',
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </FormDialog>
  );
}
