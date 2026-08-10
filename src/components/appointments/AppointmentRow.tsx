import { CircleCheck, Clock, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ActionForm } from '@/components/ui/ActionForm';
import { Link } from '@/i18n/navigation';
import { deleteAppointment, setAppointmentStatus } from '@/lib/actions/appointments';
import { minutesToTime, timeToMinutes } from '@/lib/dates';
import { AppointmentFormDialog, type PatientOption, type ServiceOption } from './AppointmentFormDialog';
import { AppointmentStatusBadge } from './AppointmentStatusBadge';
import { ReminderLinks } from './ReminderLinks';
import type { AppointmentView } from './types';

export function AppointmentRow({
  appointment,
  patients,
  services,
  showDate = false,
}: {
  appointment: AppointmentView;
  patients: PatientOption[];
  services: ServiceOption[];
  showDate?: boolean;
}) {
  const t = useTranslations('appointments');
  const tc = useTranslations('common');

  const endTime = minutesToTime(timeToMinutes(appointment.startTime) + appointment.durationMin);
  const patientName = `${appointment.patient.firstName} ${appointment.patient.lastName}`;

  return (
    <article className="flex flex-col gap-4 border-b-2 border-line px-5 py-4 last:border-b-0 lg:flex-row lg:items-start">
      <div className="flex shrink-0 items-baseline gap-2 lg:w-40 lg:flex-col lg:gap-0.5">
        <span className="text-2xl font-bold tabular-nums text-ink">{appointment.startTime}</span>
        <span className="flex items-center gap-1 text-[0.9rem] text-ink-faint tabular-nums">
          <Clock size={14} aria-hidden />
          {endTime} · {t('durationValue', { min: appointment.durationMin })}
        </span>
        {showDate ? (
          <span className="text-[0.9rem] font-semibold text-ink-soft">{appointment.date}</span>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link
            href={`/patients/${appointment.patient.id}`}
            className="text-[1.15rem] font-bold text-ink underline decoration-line-strong decoration-2 underline-offset-4 hover:decoration-brand"
          >
            {patientName}
          </Link>
          <AppointmentStatusBadge status={appointment.status} />
        </div>

        {appointment.serviceName ? (
          <p className="mt-1 text-[1.02rem] text-ink-soft">{appointment.serviceName}</p>
        ) : null}
        {appointment.notes ? (
          <p className="mt-1 text-[0.95rem] text-ink-faint">{appointment.notes}</p>
        ) : null}

        <div className="mt-3">
          <ReminderLinks
            patientName={patientName}
            phone={appointment.patient.phone}
            email={appointment.patient.email}
            date={appointment.date}
            startTime={appointment.startTime}
          />
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {appointment.status === 'SCHEDULED' ? (
          <ActionForm action={setAppointmentStatus} values={{ id: appointment.id, status: 'COMPLETED' }}>
            <button type="submit" className="btn btn-secondary btn-sm" title={t('markCompleted')}>
              <CircleCheck size={18} aria-hidden />
              <span className="sr-only lg:not-sr-only">{t('markCompleted')}</span>
            </button>
          </ActionForm>
        ) : null}

        <AppointmentFormDialog
          patients={patients}
          services={services}
          appointment={{
            id: appointment.id,
            patientId: appointment.patient.id,
            date: appointment.date,
            startTime: appointment.startTime,
            durationMin: appointment.durationMin,
            status: appointment.status,
            serviceName: appointment.serviceName,
            notes: appointment.notes,
          }}
          triggerClassName="btn btn-secondary btn-sm"
          compact
        />

        <ActionForm
          action={deleteAppointment}
          values={{ id: appointment.id }}
          confirmMessage={tc('confirmDelete')}
        >
          <button type="submit" className="btn btn-danger btn-sm" title={tc('delete')}>
            <Trash2 size={18} aria-hidden />
            <span className="sr-only">{tc('delete')}</span>
          </button>
        </ActionForm>
      </div>
    </article>
  );
}
