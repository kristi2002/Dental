'use client';

import { CalendarPlus, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { SelectField, TextAreaField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveAppointment } from '@/lib/actions/appointments';

export type PatientOption = { id: string; name: string };
export type ServiceOption = { id: string; name: string; durationMin: number };

export type AppointmentDefaults = {
  id: string;
  patientId: string;
  /** `YYYY-MM-DD` */
  date: string;
  startTime: string;
  durationMin: number;
  status: string;
  serviceName: string;
  notes: string;
};

const STATUSES = ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;

export function AppointmentFormDialog({
  patients,
  services,
  appointment,
  defaultDate,
  defaultPatientId,
  triggerClassName,
  compact = false,
}: {
  patients: PatientOption[];
  services: ServiceOption[];
  appointment?: AppointmentDefaults;
  /** `YYYY-MM-DD` used when creating from a specific calendar day. */
  defaultDate?: string;
  defaultPatientId?: string;
  triggerClassName?: string;
  compact?: boolean;
}) {
  const t = useTranslations('appointments');
  const tc = useTranslations('common');
  const editing = Boolean(appointment);
  const uid = useId();

  // Picking a service pre-fills the duration — the dentist can still override it.
  const [duration, setDuration] = useState(appointment?.durationMin ?? 30);

  return (
    <FormDialog
      key={appointment?.id ?? 'new'}
      action={saveAppointment}
      resetOnSuccess={!editing}
      onClose={() => setDuration(appointment?.durationMin ?? 30)}
      title={editing ? t('edit') : t('new')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={editing ? t('edit') : t('new')}
      triggerClassName={triggerClassName ?? (editing ? 'btn btn-secondary' : 'btn btn-primary')}
      trigger={
        editing ? (
          <>
            <Pencil size={19} aria-hidden />
            {compact ? <span className="sr-only">{t('edit')}</span> : tc('edit')}
          </>
        ) : (
          <>
            <CalendarPlus size={20} aria-hidden />
            {t('new')}
          </>
        )
      }
    >
      {appointment ? <input type="hidden" name="id" value={appointment.id} /> : null}

      {patients.length === 0 ? (
        <p className="rounded-lg border-2 border-warn bg-warn-soft px-3 py-2 font-semibold text-warn">
          {t('noPatients')}
        </p>
      ) : null}

      <SelectField
        id={`${uid}-patient`}
        name="patientId"
        label={t('patient')}
        required
        defaultValue={appointment?.patientId ?? defaultPatientId ?? ''}
      >
        <option value="" disabled>
          {t('selectPatient')}
        </option>
        {patients.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </SelectField>

      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          id={`${uid}-date`}
          name="date"
          type="date"
          label={t('date')}
          required
          defaultValue={appointment?.date ?? defaultDate}
        />
        <TextField
          id={`${uid}-startTime`}
          name="startTime"
          type="time"
          label={t('startTime')}
          required
          step={300}
          defaultValue={appointment?.startTime ?? '09:00'}
        />
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

      <SelectField
        id={`${uid}-service`}
        name="serviceName"
        label={t('service')}
        optional={tc('optional')}
        defaultValue={appointment?.serviceName ?? ''}
        onChange={(event) => {
          const match = services.find((s) => s.name === event.target.value);
          if (match) setDuration(match.durationMin);
        }}
      >
        <option value="">{t('selectService')}</option>
        {services.map((s) => (
          <option key={s.id} value={s.name}>
            {s.name}
          </option>
        ))}
      </SelectField>

      <SelectField
        id={`${uid}-status`}
        name="status"
        label={t('status')}
        defaultValue={appointment?.status ?? 'SCHEDULED'}
      >
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            {t(`status_${status}`)}
          </option>
        ))}
      </SelectField>

      <TextAreaField
        id={`${uid}-notes`}
        name="notes"
        label={t('notes')}
        optional={tc('optional')}
        rows={3}
        defaultValue={appointment?.notes}
      />
    </FormDialog>
  );
}
