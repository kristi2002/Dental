import { CircleCheck, Clock, DoorOpen, Trash2 } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/Badge';
import { ActionForm } from '@/components/ui/ActionForm';
import { Link } from '@/i18n/navigation';
import { deleteAppointment, setAppointmentStatus } from '@/lib/actions/appointments';
import { can } from '@/lib/auth/session';
import { confirmationToken, confirmationUrl } from '@/lib/confirmations';
import { minutesToTime, timeToMinutes } from '@/lib/dates';
import { getOperatoryOptions, getProviderOptions } from '@/lib/queries';
import { composeReminder } from '@/lib/reminder-messages';
import { AppointmentFormDialog, type PatientOption, type ServiceOption } from './AppointmentFormDialog';
import { AppointmentStatusBadge } from './AppointmentStatusBadge';
import { ReminderLinks } from './ReminderLinks';
import type { AppointmentView } from './types';

/**
 * Reads its own permissions rather than taking them as props: the row appears on
 * four different screens, and threading two booleans through every one of them
 * would be four chances to forget. `getCurrentUser` is cached per request.
 */
export async function AppointmentRow({
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
  const t = await getTranslations('appointments');
  const tc = await getTranslations('common');
  const [canEdit, canDelete, locale, staff, operatories] = await Promise.all([
    can('appointment.edit'),
    can('appointment.delete'),
    getLocale(),
    getProviderOptions(),
    getOperatoryOptions(),
  ]);

  const endTime = minutesToTime(timeToMinutes(appointment.startTime) + appointment.durationMin);
  const patientName = `${appointment.patient.firstName} ${appointment.patient.lastName}`;

  // The link the patient taps to answer. Derived, not stored — see confirmations.ts.
  // It points at *their* language, not the reader's, so the confirmation page
  // opens in the same tongue as the message that carried it.
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
    /* The row shows up in a full-width list and in the dashboard's narrower
       column, so it sizes itself against its own container rather than the
       viewport — a `lg:` breakpoint would give the dashboard a three-column
       layout it has no room for. */
    <div className="@container border-b border-line last:border-b-0">
      <article className="grid items-baseline gap-x-4 gap-y-3 px-5 py-4 @[30rem]:grid-cols-[10.5rem_minmax(0,1fr)] @[75rem]:grid-cols-[10.5rem_minmax(0,1fr)_max-content]">
        <div className="flex items-baseline gap-2 @[30rem]:flex-col @[30rem]:gap-0.5">
          <span className="text-2xl font-bold tabular-nums text-ink">{appointment.startTime}</span>
          <span className="flex items-center gap-1 text-[0.9rem] text-ink-faint tabular-nums">
            <Clock size={14} aria-hidden />
            {endTime} · {t('durationValue', { min: appointment.durationMin })}
          </span>
          {showDate ? (
            <span className="text-[0.9rem] font-semibold text-ink-soft">{appointment.date}</span>
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Link
              href={`/patients/${appointment.patient.id}`}
              className="text-[1.15rem]/8 font-bold text-ink underline decoration-line-strong decoration-2 underline-offset-4 hover:decoration-brand"
            >
              {patientName}
            </Link>
            <AppointmentStatusBadge status={appointment.status} />
            {/* Whether the patient has answered is separate from what the clinic
                set — a scheduled-but-silent slot is the one worth chasing. */}
            {appointment.confirmed ? (
              <Badge tone="ok">{t('confirmed')}</Badge>
            ) : appointment.declined ? (
              <Badge tone="danger">{t('declined')}</Badge>
            ) : null}
          </div>

          {appointment.serviceName ? (
            <p className="mt-1 text-[1.02rem] text-ink-soft">{appointment.serviceName}</p>
          ) : null}
          {appointment.staffName || appointment.operatoryName ? (
            <p className="mt-1 text-[0.98rem] font-semibold text-ink-soft">
              {[appointment.staffName, appointment.operatoryName].filter(Boolean).join(' · ')}
            </p>
          ) : null}
          {appointment.notes ? (
            <p className="mt-1 text-[0.95rem] text-ink-faint">{appointment.notes}</p>
          ) : null}
        </div>

        {/* Reminders and the status/edit/delete controls are one strip: they are
            all "things you do to this appointment", and splitting them across two
            lines made the row look twice as busy as it is. Sits under the details
            until the row is wide enough for a third column, so the details never
            get squeezed into a sliver — five buttons need noticeably more room
            than three, hence the later breakpoint. */}
        <div className="flex flex-wrap items-center gap-2 @[30rem]:col-start-2 @[30rem]:justify-end @[75rem]:col-start-3 @[75rem]:row-start-1 @[75rem]:self-start">
          <ReminderLinks
            patientId={appointment.patient.id}
            appointmentId={appointment.id}
            whatsapp={reminder.whatsapp}
            mail={reminder.mail}
            body={reminder.body}
          />

          {/* The front desk’s most-pressed button. Without it the day list is a
              plan; with it, it is a queue the dentist can work down. */}
          {canEdit && appointment.status === 'SCHEDULED' ? (
            <ActionForm action={setAppointmentStatus} values={{ id: appointment.id, status: 'ARRIVED' }}>
              <button type="submit" className="btn btn-secondary btn-sm" title={t('markArrived')}>
                <DoorOpen size={18} aria-hidden />
                <span className="sr-only @[30rem]:not-sr-only">{t('markArrived')}</span>
              </button>
            </ActionForm>
          ) : null}

          {canEdit && (appointment.status === 'SCHEDULED' || appointment.status === 'ARRIVED') ? (
            <ActionForm action={setAppointmentStatus} values={{ id: appointment.id, status: 'COMPLETED' }}>
              <button type="submit" className="btn btn-secondary btn-sm" title={t('markCompleted')}>
                <CircleCheck size={18} aria-hidden />
                <span className="sr-only @[30rem]:not-sr-only">{t('markCompleted')}</span>
              </button>
            </ActionForm>
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
                <Trash2 size={18} aria-hidden />
                <span className="sr-only">{tc('delete')}</span>
              </button>
            </ActionForm>
          ) : null}
        </div>
      </article>
    </div>
  );
}
