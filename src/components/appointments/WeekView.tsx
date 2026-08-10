import { useFormatter, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { isSameDay, minutesToTime, timeToMinutes, today, toDateKey, weekDays } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { AppointmentView } from './types';

const STATUS_STYLE: Record<string, string> = {
  SCHEDULED: 'border-brand bg-brand-soft text-ink',
  COMPLETED: 'border-ok bg-ok-soft text-ink',
  CANCELLED: 'border-line-strong bg-paper text-ink-faint line-through',
  NO_SHOW: 'border-warn bg-warn-soft text-ink',
};

/** Seven columns at a glance; each day links through to its hour grid. */
export function WeekView({
  anchor,
  appointments,
}: {
  /** Any date inside the week to render. */
  anchor: Date;
  appointments: AppointmentView[];
}) {
  const t = useTranslations('appointments');
  const format = useFormatter();
  const now = today();

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[52rem] grid-cols-7">
        {weekDays(anchor).map((day) => {
          const key = toDateKey(day);
          const dayAppointments = appointments.filter((a) => a.date === key);
          const isToday = isSameDay(day, now);

          return (
            <div key={key} className="min-w-0 border-r-2 border-line last:border-r-0">
              <Link
                href={`/appointments?view=day&date=${key}`}
                className={cn(
                  'block border-b-2 border-line px-3 py-2.5 no-underline transition-colors hover:bg-brand-soft',
                  isToday && 'bg-ink text-white hover:bg-ink',
                )}
              >
                <span
                  className={cn(
                    'block text-[0.85rem] font-bold tracking-wide uppercase',
                    isToday ? 'text-white/80' : 'text-ink-faint',
                  )}
                >
                  {format.dateTime(day, { weekday: 'short' })}
                </span>
                <span className="block text-[1.3rem] font-bold tabular-nums">
                  {format.dateTime(day, { day: 'numeric' })}
                </span>
              </Link>

              <div className="min-h-40 space-y-1.5 p-1.5">
                {dayAppointments.length === 0 ? (
                  <p className="px-1 py-2 text-[0.85rem] text-ink-faint">{t('emptyDay')}</p>
                ) : (
                  dayAppointments.map((appointment) => (
                    <Link
                      key={appointment.id}
                      href={`/appointments?view=day&date=${appointment.date}`}
                      className={cn(
                        'block rounded-md border-2 px-2 py-1.5 no-underline',
                        STATUS_STYLE[appointment.status] ?? STATUS_STYLE.SCHEDULED,
                      )}
                    >
                      <span className="block text-[0.85rem] font-bold tabular-nums">
                        {appointment.startTime}–
                        {minutesToTime(
                          timeToMinutes(appointment.startTime) + appointment.durationMin,
                        )}
                      </span>
                      <span className="block truncate text-[0.92rem] font-semibold">
                        {appointment.patient.firstName} {appointment.patient.lastName}
                      </span>
                      {appointment.serviceName ? (
                        <span className="block truncate text-[0.85rem] opacity-80">
                          {appointment.serviceName}
                        </span>
                      ) : null}
                    </Link>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
