import {
  CalendarSync,
  CalendarX2,
  CircleCheck,
  Clock,
  DoorOpen,
  History,
  Hourglass,
  Trash2,
  UserX,
} from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/Badge';
import { ActionForm } from '@/components/ui/ActionForm';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Link } from '@/i18n/navigation';
import { deleteAppointment, setAppointmentStatus } from '@/lib/actions/appointments';
import { can } from '@/lib/auth/session';
import { confirmationToken, confirmationUrl } from '@/lib/confirmations';
import { clinicMinutesNow, minutesToTime, timeToMinutes, toDateKey, today } from '@/lib/dates';
import { getOperatoryOptions, getProviderOptions } from '@/lib/queries';
import { composeReminder } from '@/lib/reminder-messages';
import { AppointmentFormDialog, type ServiceOption } from './AppointmentFormDialog';
import { AppointmentStatusBadge } from './AppointmentStatusBadge';
import { ReminderLinks } from './ReminderLinks';
import { RescheduleDialog } from './RescheduleDialog';
import type { AppointmentView } from './types';

/**
 * Reads its own permissions rather than taking them as props: the row appears on
 * four different screens, and threading two booleans through every one of them
 * would be four chances to forget. `getCurrentUser` is cached per request.
 */
export async function AppointmentRow({
  appointment,
  services,
  showDate = false,
}: {
  appointment: AppointmentView;
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

  const endMinutes = timeToMinutes(appointment.startTime) + appointment.durationMin;
  const endTime = minutesToTime(endMinutes);
  const patientName = `${appointment.patient.firstName} ${appointment.patient.lastName}`;
  // Whether the slot itself is over: an earlier day, or today once the booked
  // end time has gone by. Both dates are `YYYY-MM-DD`, which compares correctly
  // as text; the clock is the clinic's own, not the reader's browser.
  const isOver =
    appointment.date < toDateKey(today()) ||
    (appointment.date === toDateKey(today()) && clinicMinutesNow() >= endMinutes);

  // A slot whose time has run out and that nobody ever closed: it is still
  // sitting there as a plan for something that has already not happened. Same
  // moment the no-show button appears, so the card says why the button is there.
  const isOverdue = isOver && appointment.status === 'SCHEDULED';
  // Otherwise, simply an earlier day. Deliberately by date and not by end time:
  // on the day list every finished morning slot would carry the badge, and a
  // list where most rows are marked tells you nothing. What this answers is the
  // question a mixed list raises — which of these already happened.
  const isPastDay = !isOverdue && appointment.date < toDateKey(today());

  // Worked out at render rather than stored, and only while they are actually
  // in the waiting room. Floored at zero because a clock skew between the
  // database and the renderer should read "just arrived", never "-2 min".
  const waitingMinutes =
    appointment.status === 'ARRIVED' && appointment.arrivedAt
      ? Math.max(0, Math.round((Date.now() - new Date(appointment.arrivedAt).getTime()) / 60000))
      : null;

  // The link the patient taps to answer. Derived, not stored — see confirmations.ts.
  // It points at *their* language, not the reader's, so the confirmation page
  // opens in the same tongue as the message that carried it.
  const reminder = await composeReminder({
    patientId: appointment.patient.id,
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
       layout it has no room for.

       A bordered card rather than a hairline-separated row: an appointment is
       one object you act on, and the box says where it starts and stops. The
       whole box opens the patient — `relative` here is what the patient link's
       overlay stretches against.

       `@container` also puts each card in a stacking context of its own, which
       would leave the actions menu painted underneath the next card down. So
       while the menu is open its card is lifted over its neighbours — keyed off
       the trigger's own `aria-expanded`, so there is only one thing on the page
       saying whether the menu is open. */
    <div className="@container relative rounded-[var(--radius-card)] border border-line bg-surface transition-colors hover:border-line-strong hover:shadow-card has-[[aria-expanded=true]]:z-20">
      <article className="grid items-baseline gap-x-4 gap-y-3 px-4 py-3.5 @[30rem]:grid-cols-[10.5rem_minmax(0,1fr)] @[75rem]:grid-cols-[10.5rem_minmax(0,1fr)_max-content]">
        <div className="flex items-baseline gap-2 @[30rem]:flex-col @[30rem]:gap-0.5">
          <span className="text-2xl font-bold tabular-nums text-ink">{appointment.startTime}</span>
          <span className="flex items-center gap-1 text-meta text-ink-faint tabular-nums">
            <Clock size={14} aria-hidden />
            {endTime} · {t('durationValue', { min: appointment.durationMin })}
          </span>
          {showDate ? (
            <span className="text-meta font-semibold text-ink-soft">{appointment.date}</span>
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* One link, stretched over the whole card by its own ::after, so
                anywhere on the box opens the patient — the name still carries
                the accessible label and the focus ring. */}
            <Link
              href={`/patients/${appointment.patient.id}`}
              className="text-lead/8 font-bold text-ink underline decoration-line-strong decoration-2 underline-offset-4 after:absolute after:inset-0 after:rounded-[var(--radius-card)] hover:decoration-brand"
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

            {/* How long they have been sitting there. The status said somebody
                was waiting and never since when, which is the half that decides
                who gets seen next and whether the day is running late. */}
            {waitingMinutes !== null ? (
              <Badge tone={waitingMinutes >= 20 ? 'warn' : 'neutral'}>
                <Hourglass size={14} aria-hidden />
                {t('waitingFor', { minutes: waitingMinutes })}
              </Badge>
            ) : null}

            {/* Where the slot sits against the clock — a list mixes the two
                freely, and the date alone makes the reader do the arithmetic.
                Only one of the pair can show: an overdue slot is past too, and
                saying so twice would be a row of badges arguing with itself. */}
            {isOverdue ? (
              <Badge tone="warn">
                <CalendarX2 size={14} aria-hidden />
                {t('overdueBadge')}
              </Badge>
            ) : isPastDay ? (
              <Badge tone="neutral">
                <History size={14} aria-hidden />
                {t('pastBadge')}
              </Badge>
            ) : null}

            {/* This slot replaced an earlier one. Worth seeing before agreeing
                to move it again. */}
            {appointment.moved ? (
              <Badge tone="neutral">
                <CalendarSync size={14} aria-hidden />
                {t('movedBadge')}
              </Badge>
            ) : null}
          </div>

          {appointment.serviceName ? (
            <p className="mt-1 text-body text-ink-soft">{appointment.serviceName}</p>
          ) : null}
          {appointment.staffName || appointment.operatoryName ? (
            <p className="mt-1 text-body font-semibold text-ink-soft">
              {[appointment.staffName, appointment.operatoryName].filter(Boolean).join(' · ')}
            </p>
          ) : null}
          {appointment.notes ? (
            <p className="mt-1 text-body text-ink-faint">{appointment.notes}</p>
          ) : null}
        </div>

        {/* One strip of "things you do to this appointment" — splitting them
            across two lines made the row look twice as busy as it is. Sits under
            the details until the row is wide enough for a third column, so the
            details never get squeezed into a sliver.

            What is out here is what the front desk presses through the day; the
            rest is behind the menu at the end. Offering all of it at once gave
            the buttons pressed every hour exactly the weight of the ones pressed
            once a week, and left the eye to read the whole line to find either.

            One line, always: the strip never wraps, so a card with four actions
            is exactly as tall as a card with one. The labels are what would
            overflow, so they are what gives way — they appear only once the card
            is wide enough to hold the longest set any locale can produce
            (Italian's "Non si è presentato" is the one that sets the bar), and
            below that the buttons stand on their icons with the label still read
            aloud and still in the tooltip.

            `relative` lifts the strip back above the card-wide patient link, so
            marking someone arrived does not navigate away instead. */}
        <div className="relative flex flex-nowrap items-center gap-2 whitespace-nowrap @[30rem]:col-start-2 @[30rem]:justify-end @[75rem]:col-start-3 @[75rem]:row-start-1 @[75rem]:self-start">
          {/* The front desk’s most-pressed button. Without it the day list is a
              plan; with it, it is a queue the dentist can work down. */}
          {canEdit && appointment.status === 'SCHEDULED' ? (
            <ActionForm action={setAppointmentStatus} values={{ id: appointment.id, status: 'ARRIVED' }}>
              <button type="submit" className="btn btn-secondary btn-sm" title={t('markArrived')}>
                <DoorOpen size={18} aria-hidden />
                <span className="sr-only @[58rem]:not-sr-only">{t('markArrived')}</span>
              </button>
            </ActionForm>
          ) : null}

          {canEdit && (appointment.status === 'SCHEDULED' || appointment.status === 'ARRIVED') ? (
            <ActionForm action={setAppointmentStatus} values={{ id: appointment.id, status: 'COMPLETED' }}>
              <button type="submit" className="btn btn-secondary btn-sm" title={t('markCompleted')}>
                <CircleCheck size={18} aria-hidden />
                <span className="sr-only @[58rem]:not-sr-only">{t('markCompleted')}</span>
              </button>
            </ActionForm>
          ) : null}

          {/* Only once the slot itself has run out — its own end time today, any
              time on the days after. "Did not come" is not a thing anybody can
              know at half past nine, and offering it beside "arrived" all day is
              how a slot gets written off ten minutes before its patient walks in.
              Once the booked time has passed it is an honest answer, and the
              front desk can close the day it is standing in rather than waiting
              for tomorrow's dashboard to ask.

              Still waiting on a slot that has run over is not the same as never
              having come: somebody marked ARRIVED walked through the door, and
              the only truthful way to close them is `COMPLETED` — which is
              offered whatever the date. So this is the answer for a booking that
              was never touched, and nothing else. */}
          {canEdit && isOver && appointment.status === 'SCHEDULED' ? (
            <ActionForm
              action={setAppointmentStatus}
              values={{ id: appointment.id, status: 'NO_SHOW' }}
            >
              <button type="submit" className="btn btn-secondary btn-sm" title={t('markNoShow')}>
                <UserX size={18} aria-hidden />
                <span className="sr-only @[58rem]:not-sr-only">{t('markNoShow')}</span>
              </button>
            </ActionForm>
          ) : null}

          {/* Moving a live booking is a different act from editing it — see
              `RescheduleDialog`. Not offered once the slot is closed: a
              completed or missed appointment is a record of what happened, and
              what happens next is a new booking. */}
          {canEdit &&
          (appointment.status === 'SCHEDULED' || appointment.status === 'ARRIVED') ? (
            <RescheduleDialog
              appointment={{
                id: appointment.id,
                date: appointment.date,
                startTime: appointment.startTime,
                durationMin: appointment.durationMin,
                staffUserId: appointment.staffUserId,
              }}
              compact
            />
          ) : null}

          {/* Messaging the patient, editing the booking and deleting it: three
              things that happen to an appointment now and then, and none of
              them the reason anyone opened this screen. */}
          <ActionMenu label={tc('moreActions')}>
            <ReminderLinks
              patientId={appointment.patient.id}
              appointmentId={appointment.id}
              whatsapp={reminder.whatsapp}
              mail={reminder.mail}
              body={reminder.body}
              consent={appointment.patient.contactConsent}
              variant="menu"
            />

            {canEdit ? (
              <div className="border-t border-line">
                <AppointmentFormDialog
                  // The row already knows whose appointment this is; nothing
                  // needs the rest of the drawer to edit one booking.
                  defaultPatient={{ id: appointment.patient.id, name: patientName }}
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
                    serviceId: appointment.serviceId,
                    notes: appointment.notes,
                    staffUserId: appointment.staffUserId,
                    operatoryId: appointment.operatoryId,
                  }}
                  triggerClassName="menu-item"
                />
              </div>
            ) : null}

            {canDelete ? (
              <ActionForm
                action={deleteAppointment}
                values={{ id: appointment.id }}
                confirmMessage={tc('confirmDelete')}
                className={canEdit ? 'block' : 'block border-t border-line'}
              >
                <button type="submit" role="menuitem" className="menu-item menu-item-danger">
                  <Trash2 size={19} aria-hidden className="shrink-0" />
                  {tc('delete')}
                </button>
              </ActionForm>
            ) : null}
          </ActionMenu>
        </div>
      </article>
    </div>
  );
}
