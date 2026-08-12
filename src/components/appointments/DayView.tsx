import { CalendarDays, CalendarOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/EmptyState';
import { gridHoursFor, type DaySchedule } from '@/lib/clinic-hours';
import { timeToMinutes } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { AppointmentChip } from './AppointmentChip';
import type { PatientOption, ServiceOption } from './AppointmentFormDialog';
import type { AppointmentView } from './types';

/** An hour-by-hour grid, so gaps in the day are as visible as the bookings. */
export function DayView({
  appointments,
  services,
  schedule,
}: {
  appointments: AppointmentView[];
  services: ServiceOption[];
  schedule: DaySchedule;
}) {
  const t = useTranslations('appointments');

  // A closure outranks everything: on a day the practice is shut, "nothing
  // scheduled" is the wrong answer to why the grid is empty.
  if (schedule.closed && appointments.length === 0) {
    return (
      <EmptyState
        icon={<CalendarOff size={40} aria-hidden />}
        title={schedule.closureReason ?? t('closedDay')}
      />
    );
  }

  if (appointments.length === 0) {
    return <EmptyState icon={<CalendarDays size={40} aria-hidden />} title={t('emptyDay')} />;
  }

  // The grid stretches to cover anything booked outside opening hours — an
  // emergency seen at seven has to appear on the grid, not in a footnote.
  const { startHour, endHour } = gridHoursFor(
    schedule,
    appointments.map((appointment) => timeToMinutes(appointment.startTime)),
  );
  const hours = Array.from({ length: Math.max(1, endHour - startHour) }, (_, i) => startHour + i);

  const isOpenHour = (hour: number) =>
    schedule.ranges.some((range) => range.start < (hour + 1) * 60 && range.end > hour * 60);

  return (
    <div>
      {schedule.closed ? (
        <p
          role="status"
          className="border-b border-line bg-warn-soft px-5 py-3 font-semibold text-warn"
        >
          {schedule.closureReason ?? t('closedDay')}
        </p>
      ) : null}

      {hours.map((hour) => {
        const slot = appointments.filter(
          (a) => Math.floor(timeToMinutes(a.startTime) / 60) === hour,
        );
        const open = isOpenHour(hour);

        return (
          <div
            key={hour}
            className={cn(
              'grid grid-cols-[4.5rem_1fr] border-b border-line last:border-b-0 sm:grid-cols-[6rem_1fr]',
              // Shut hours are shaded rather than hidden: the front desk can
              // still see that four o'clock exists and is not available.
              !open && 'bg-paper',
            )}
          >
            <div
              className={cn(
                'border-r border-line px-3 py-3 text-right text-[1.05rem] font-bold tabular-nums',
                slot.length > 0 ? 'text-ink' : 'text-ink-faint',
              )}
            >
              {String(hour).padStart(2, '0')}:00
            </div>
            <div className={cn('space-y-2 p-2', slot.length === 0 && 'min-h-14')}>
              {slot.length === 0 && !open ? (
                <p className="px-1 py-2 text-[0.9rem] text-ink-faint">{t('closedHour')}</p>
              ) : null}
              {slot.map((appointment) => (
                <AppointmentChip
                  key={appointment.id}
                  appointment={appointment}
                  services={services}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
