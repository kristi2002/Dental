'use client';

import { NotebookPen, Package } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import type { ServiceOption } from '@/components/appointments/AppointmentFormDialog';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveVisit } from '@/lib/actions/patients';
import { cn, parseServiceList } from '@/lib/utils';

export function VisitFormDialog({
  patientId,
  services: catalog,
  today,
}: {
  patientId: string;
  /** Service catalog, offered as one-tap chips. */
  services: ServiceOption[];
  /** `YYYY-MM-DD` default for the visit date. */
  today: string;
}) {
  const t = useTranslations('patients');
  const tc = useTranslations('common');
  const uid = useId();
  const [services, setServices] = useState('');

  const selected = parseServiceList(services);

  // Ids of the chips that are on, matched back from the text field so a name
  // typed by hand simply has no id — and therefore deducts nothing.
  const selectedIds = catalog.filter((s) => selected.includes(s.name)).map((s) => s.id);
  const deducting = catalog.filter(
    (s) => selectedIds.includes(s.id) && s.materialCount > 0,
  );

  function toggleService(name: string) {
    const next = selected.includes(name)
      ? selected.filter((s) => s !== name)
      : [...selected, name];
    setServices(next.join(', '));
  }

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
      <input type="hidden" name="serviceIds" value={selectedIds.join(',')} />

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

        {catalog.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {catalog.map((service) => {
              const active = selected.includes(service.name);
              return (
                <button
                  key={service.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleService(service.name)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-[0.9rem] font-semibold transition-colors',
                    active
                      ? 'border-brand-dark bg-brand-dark text-white'
                      : 'border-line-strong bg-surface text-ink-soft hover:border-ink hover:text-ink',
                  )}
                >
                  {service.name}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Saying so up front beats a silent stock change nobody expected. */}
      {deducting.length > 0 ? (
        <p className="flex items-start gap-2 rounded-lg border border-brand/30 bg-brand-soft px-3 py-2.5 text-[0.95rem] text-brand-deep">
          <Package size={18} aria-hidden className="mt-0.5 shrink-0" />
          {t('willDeduct', { services: deducting.map((s) => s.name).join(', ') })}
        </p>
      ) : null}
    </FormDialog>
  );
}
