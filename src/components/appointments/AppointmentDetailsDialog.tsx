'use client';

import {
  CalendarDays,
  CircleCheck,
  Clock,
  DoorOpen,
  Mail,
  MapPin,
  NotebookPen,
  Pencil,
  Phone,
  Stethoscope,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { AppointmentStatusBadge } from '@/components/appointments/AppointmentStatusBadge';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { Link } from '@/i18n/navigation';
import { deleteAppointment, setAppointmentStatus } from '@/lib/actions/appointments';
import { fromDateKey, minutesToTime, timeToMinutes } from '@/lib/dates';
import type { AppointmentView } from './types';

/** One labelled fact. The label is small and grey; the fact is what is read. */
function Fact({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span aria-hidden className="mt-0.5 shrink-0 text-brand">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[0.82rem] font-semibold tracking-wide text-ink-faint uppercase">
          {label}
        </p>
        <div className="text-[1.02rem] text-ink">{children}</div>
      </div>
    </div>
  );
}

/**
 * Everything about one booking, opened by clicking it on the grid.
 *
 * The week and the month are dense on purpose — a block carries a name, a time
 * and, if it is tall enough, a treatment. Everything else about the appointment
 * (who is treating, which chair, the phone number, whether they confirmed, what
 * the note says) was only ever readable by leaving the week for the day view,
 * which is a poor trade when the question is about one booking and the answer
 * costs you the seven days you were looking at.
 *
 * So the block opens here instead. The actions are the same verbs the day view
 * offers on its chips, so nothing has to be learnt twice.
 */
export function AppointmentDetailsDialog({
  appointment,
  canEdit = false,
  canDelete = false,
  onClose,
  onEdit,
}: {
  appointment: AppointmentView;
  canEdit?: boolean;
  canDelete?: boolean;
  /** Told when the dialog goes away, so the owner can unmount it. */
  onClose: () => void;
  /** Hand over to the edit form. Left out, the edit button is not drawn. */
  onEdit?: () => void;
}) {
  const t = useTranslations('appointments');
  const tc = useTranslations('common');
  const tp = useTranslations('patients');
  const format = useFormatter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Summoned by a gesture, so it opens on mount and the owner remounts it with
  // a fresh key for the next block — the same contract `FormDialog` uses.
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const name = `${appointment.patient.firstName} ${appointment.patient.lastName}`;
  const start = timeToMinutes(appointment.startTime);
  const endTime = minutesToTime(start + appointment.durationMin);
  const waitingMin = appointment.arrivedAt
    ? Math.max(0, Math.round((Date.now() - new Date(appointment.arrivedAt).getTime()) / 60_000))
    : 0;

  const close = () => dialogRef.current?.close();

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto max-h-[88vh] w-[min(92vw,32rem)] overflow-visible rounded-[var(--radius-card)] border border-line bg-surface p-0 text-ink shadow-pop"
    >
      <div className="flex max-h-[88vh] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-xl leading-tight font-bold">
              {name}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <AppointmentStatusBadge status={appointment.status} />
              {appointment.confirmed ? <Badge tone="ok">{t('confirmed')}</Badge> : null}
              {appointment.declined ? <Badge tone="danger">{t('declined')}</Badge> : null}
              {appointment.moved ? <Badge tone="neutral">{t('movedBadge')}</Badge> : null}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm shrink-0"
            aria-label={tc('close')}
            onClick={close}
          >
            <X size={20} aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <Fact icon={<CalendarDays size={19} />} label={t('date')}>
            {format.dateTime(fromDateKey(appointment.date), {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </Fact>

          <Fact icon={<Clock size={19} />} label={t('startTime')}>
            <span className="tabular-nums">
              {appointment.startTime} – {endTime}
            </span>
            <span className="text-ink-soft">
              {' · '}
              {t('durationValue', { min: appointment.durationMin })}
            </span>
          </Fact>

          {/* The waiting-room clock, and the one fact on here with a deadline
              attached: it is the difference between "arrived" and "has been
              sitting there twenty minutes". */}
          {appointment.arrivedAt ? (
            <Fact icon={<DoorOpen size={19} />} label={t('status_ARRIVED')}>
              <span className="font-semibold text-warn">
                {t('waitingFor', { minutes: waitingMin })}
              </span>
            </Fact>
          ) : null}

          {appointment.serviceName ? (
            <Fact icon={<Stethoscope size={19} />} label={t('service')}>
              {appointment.serviceName}
            </Fact>
          ) : null}

          {appointment.staffName ? (
            <Fact icon={<User size={19} />} label={t('provider')}>
              {appointment.staffName}
            </Fact>
          ) : null}

          {appointment.operatoryName ? (
            <Fact icon={<MapPin size={19} />} label={t('operatory')}>
              {appointment.operatoryName}
            </Fact>
          ) : null}

          {/* Tap-to-call and tap-to-mail, because the reason for opening a
              booking at the front desk is very often to ring the person in it. */}
          {appointment.patient.phone ? (
            <Fact icon={<Phone size={19} />} label={tp('phone')}>
              <a href={`tel:${appointment.patient.phone}`} className="font-semibold text-brand-deep">
                {appointment.patient.phone}
              </a>
            </Fact>
          ) : null}

          {appointment.patient.email ? (
            <Fact icon={<Mail size={19} />} label={tp('email')}>
              <a
                href={`mailto:${appointment.patient.email}`}
                className="font-semibold break-all text-brand-deep"
              >
                {appointment.patient.email}
              </a>
            </Fact>
          ) : null}

          {appointment.notes ? (
            <Fact icon={<NotebookPen size={19} />} label={t('notes')}>
              <p className="whitespace-pre-wrap">{appointment.notes}</p>
            </Fact>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-4">
          <Link
            href={`/patients/${appointment.patient.id}`}
            className="btn btn-secondary btn-sm"
            onClick={close}
          >
            <User size={17} aria-hidden />
            {t('openPatient')}
          </Link>

          {/* Arrived counts as still-open work, same as the day grid: otherwise
              walking someone in leaves no way to close them out from here. */}
          {canEdit && (appointment.status === 'SCHEDULED' || appointment.status === 'ARRIVED') ? (
            <ActionForm
              action={setAppointmentStatus}
              values={{ id: appointment.id, status: 'COMPLETED' }}
            >
              <button type="submit" className="btn btn-secondary btn-sm">
                <CircleCheck size={17} aria-hidden />
                {t('markCompleted')}
              </button>
            </ActionForm>
          ) : null}

          {canEdit && onEdit ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>
              <Pencil size={17} aria-hidden />
              {tc('edit')}
            </button>
          ) : null}

          {canDelete ? (
            <ActionForm
              action={deleteAppointment}
              values={{ id: appointment.id }}
              confirmMessage={tc('confirmDelete')}
              className="ms-auto"
            >
              <button type="submit" className="btn btn-danger btn-sm" title={tc('delete')}>
                <Trash2 size={17} aria-hidden />
                <span className="sr-only">{tc('delete')}</span>
              </button>
            </ActionForm>
          ) : null}
        </footer>
      </div>
    </dialog>
  );
}
