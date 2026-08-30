'use client';

import { ListPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { SelectField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { UrgentToggle } from '@/components/ui/UrgentToggle';
import { PatientPicker } from '@/components/patients/PatientPicker';
import { saveWaitlistEntry } from '@/lib/actions/waitlist';
import { byDepartment } from '@/lib/catalog';
import type { ServiceOption } from './AppointmentFormDialog';

export function WaitlistFormDialog({
  services,
}: {
  services: ServiceOption[];
}) {
  const t = useTranslations('waitlist');
  const ts = useTranslations('services');
  const tc = useTranslations('common');
  const uid = useId();
  const [duration, setDuration] = useState(30);
  // Same pair as the booking dialog: the name is what the row prints, the id is
  // what anything counting groups by.
  const [serviceId, setServiceId] = useState('');

  return (
    <FormDialog
      action={saveWaitlistEntry}
      onClose={() => {
        setDuration(30);
        setServiceId('');
      }}
      title={t('new')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerClassName="btn btn-secondary btn-sm"
      trigger={
        <>
          <ListPlus size={18} aria-hidden />
          {t('new')}
        </>
      }
    >
      <PatientPicker name="patientId" label={t('patient')} required />

      <input type="hidden" name="serviceId" value={serviceId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id={`${uid}-service`}
          name="serviceName"
          label={t('service')}
          optional={tc('optional')}
          defaultValue=""
          onChange={(event) => {
            const match = services.find((s) => s.name === event.target.value);
            setServiceId(match?.id ?? '');
            if (match) setDuration(match.durationMin);
          }}
        >
          <option value="">{tc('none')}</option>
          {byDepartment(services).map(({ department, items }) => (
            <optgroup key={department || 'none'} label={department || ts('uncategorized')}>
              {items.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name} · {s.durationMin} {tc('minutes')}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectField>

        <TextField
          id={`${uid}-duration`}
          name="durationMin"
          type="number"
          min={5}
          step={5}
          label={`${t('duration')} (${tc('minutes')})`}
          required
          value={duration}
          onChange={(event) => setDuration(Number(event.target.value))}
        />
      </div>

      <TextField
        id={`${uid}-note`}
        name="note"
        label={tc('notes')}
        optional={tc('optional')}
        hint={t('noteHint')}
      />

      {/* Urgent entries sort to the top and are the first offered a freed slot.
          The same control the works register and the follow-up board use, rather
          than the bare box that used to be here: "this one first" is one idea,
          and it read as an afterthought on this screen and as a decision on the
          other two. See `UrgentToggle`. */}
      <UrgentToggle name="urgent" value="1" label={t('urgent')} hint={t('urgentHint')} />
    </FormDialog>
  );
}
