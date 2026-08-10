import { CircleCheck, Mail, MessageCircle, Trash2 } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { ActionForm } from '@/components/ui/ActionForm';
import { Link } from '@/i18n/navigation';
import { deleteAppointment, setAppointmentStatus } from '@/lib/actions/appointments';
import { minutesToTime, timeToMinutes } from '@/lib/dates';
import { mailtoLink, whatsappLink } from '@/lib/reminders';
import { cn } from '@/lib/utils';
import { AppointmentFormDialog, type PatientOption, type ServiceOption } from './AppointmentFormDialog';
import type { AppointmentView } from './types';

const STATUS_STYLE: Record<string, string> = {
  SCHEDULED: 'border-brand bg-brand-soft',
  COMPLETED: 'border-ok bg-ok-soft',
  CANCELLED: 'border-line-strong bg-paper opacity-70',
  NO_SHOW: 'border-warn bg-warn-soft',
};

/** The dense form of an appointment used inside the day grid. */
export function AppointmentChip({
  appointment,
  patients,
  services,
}: {
  appointment: AppointmentView;
  patients: PatientOption[];
  services: ServiceOption[];
}) {
  const t = useTranslations('appointments');
  const tr = useTranslations('reminders');
  const tc = useTranslations('common');
  const format = useFormatter();

  const patientName = `${appointment.patient.firstName} ${appointment.patient.lastName}`;
  const endTime = minutesToTime(timeToMinutes(appointment.startTime) + appointment.durationMin);

  const values = {
    name: patientName,
    date: format.dateTime(new Date(`${appointment.date}T00:00:00.000Z`), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
    time: appointment.startTime,
  };
  const whatsapp = appointment.patient.phone
    ? whatsappLink(appointment.patient.phone, tr('whatsappTemplate', values))
    : null;
  const mail = appointment.patient.email
    ? mailtoLink(appointment.patient.email, tr('emailSubject', values), tr('emailBody', values))
    : null;

  return (
    <article
      className={cn(
        'rounded-lg border-2 px-3 py-2.5',
        STATUS_STYLE[appointment.status] ?? STATUS_STYLE.SCHEDULED,
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        <span className="font-bold tabular-nums text-ink">
          {appointment.startTime}–{endTime}
        </span>
        <Link
          href={`/patients/${appointment.patient.id}`}
          className="text-[1.05rem] font-bold text-ink underline decoration-line-strong decoration-2 underline-offset-2 hover:decoration-brand"
        >
          {patientName}
        </Link>
      </div>

      {appointment.serviceName ? (
        <p className="text-[0.95rem] text-ink-soft">{appointment.serviceName}</p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {appointment.status === 'SCHEDULED' ? (
          <ActionForm
            action={setAppointmentStatus}
            values={{ id: appointment.id, status: 'COMPLETED' }}
          >
            <button type="submit" className="btn btn-secondary btn-sm" title={t('markCompleted')}>
              <CircleCheck size={16} aria-hidden />
              <span className="sr-only">{t('markCompleted')}</span>
            </button>
          </ActionForm>
        ) : null}

        {whatsapp ? (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
            title={t('remindWhatsapp')}
          >
            <MessageCircle size={16} aria-hidden />
            <span className="sr-only">{t('remindWhatsapp')}</span>
          </a>
        ) : null}

        {mail ? (
          <a href={mail} className="btn btn-secondary btn-sm" title={t('remindEmail')}>
            <Mail size={16} aria-hidden />
            <span className="sr-only">{t('remindEmail')}</span>
          </a>
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
            <Trash2 size={16} aria-hidden />
            <span className="sr-only">{tc('delete')}</span>
          </button>
        </ActionForm>
      </div>
    </article>
  );
}
