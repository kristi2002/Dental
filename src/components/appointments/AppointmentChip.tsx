import { CircleCheck, Trash2 } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { Link } from '@/i18n/navigation';
import { deleteAppointment, setAppointmentStatus } from '@/lib/actions/appointments';
import { can } from '@/lib/auth/session';
import { confirmationToken, confirmationUrl } from '@/lib/confirmations';
import { minutesToTime, timeToMinutes } from '@/lib/dates';
import { getOperatoryOptions, getProviderOptions } from '@/lib/queries';
import { composeReminder } from '@/lib/reminder-messages';
import { cn } from '@/lib/utils';
import { AppointmentFormDialog, type PatientOption, type ServiceOption } from './AppointmentFormDialog';
import { ReminderLinks } from './ReminderLinks';
import type { AppointmentView } from './types';

const STATUS_STYLE: Record<string, string> = {
  SCHEDULED: 'border-brand/40 bg-brand-soft',
  COMPLETED: 'border-ok/30 bg-ok-soft',
  CANCELLED: 'border-line-strong bg-paper opacity-70',
  NO_SHOW: 'border-warn/30 bg-warn-soft',
};

/** The dense form of an appointment used inside the day grid. */
export async function AppointmentChip({
  appointment,
  patients,
  services,
}: {
  appointment: AppointmentView;
  patients: PatientOption[];
  services: ServiceOption[];
}) {
  const t = await getTranslations('appointments');
  const tc = await getTranslations('common');
  // Fetched here rather than drilled through the grid: both are `cache()`d, so
  // a day with thirty chips still costs one query each.
  const [canEdit, canDelete, locale, staff, operatories] = await Promise.all([
    can('appointment.edit'),
    can('appointment.delete'),
    getLocale(),
    getProviderOptions(),
    getOperatoryOptions(),
  ]);

  const patientName = `${appointment.patient.firstName} ${appointment.patient.lastName}`;
  const endTime = minutesToTime(timeToMinutes(appointment.startTime) + appointment.durationMin);

  // Same ask as the row form, so a reminder sent from the day grid carries the
  // confirmation link too — and is written in the patient's language.
  const reminder = await composeReminder({
    patientName,
    phone: appointment.patient.phone,
    email: appointment.patient.email,
    date: appointment.date,
    startTime: appointment.startTime,
    patientLocale: appointment.patient.locale,
    confirmLink: confirmationUrl(
      appointment.patient.locale || locale,
      await confirmationToken(appointment.id),
    ),
  });

  return (
    <article
      className={cn(
        'rounded-lg border px-3 py-2.5',
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
        {appointment.confirmed ? <Badge tone="ok">{t('confirmed')}</Badge> : null}
      </div>

      {appointment.serviceName ? (
        <p className="text-[0.95rem] text-ink-soft">{appointment.serviceName}</p>
      ) : null}

      {appointment.staffName || appointment.operatoryName ? (
        <p className="text-[0.95rem] font-semibold text-ink-soft">
          {[appointment.staffName, appointment.operatoryName].filter(Boolean).join(' · ')}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {canEdit && appointment.status === 'SCHEDULED' ? (
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

        {reminder.whatsapp || reminder.mail ? (
          <ReminderLinks
            patientId={appointment.patient.id}
            appointmentId={appointment.id}
            whatsapp={reminder.whatsapp}
            mail={reminder.mail}
            body={reminder.body}
          />
        ) : null}

        {canEdit ? (
          <AppointmentFormDialog
            patients={patients}
            services={services}
            staff={staff}
            operatories={operatories}
            appointment={{
              id: appointment.id,
              patientId: appointment.patient.id,
              date: appointment.date,
              startTime: appointment.startTime,
              durationMin: appointment.durationMin,
              status: appointment.status,
              serviceName: appointment.serviceName,
              notes: appointment.notes,
              staffUserId: appointment.staffUserId,
              operatoryId: appointment.operatoryId,
            }}
            triggerClassName="btn btn-secondary btn-sm"
            compact
          />
        ) : null}

        {canDelete ? (
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
        ) : null}
      </div>
    </article>
  );
}
