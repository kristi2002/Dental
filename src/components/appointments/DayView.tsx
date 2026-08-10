import { CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/EmptyState';
import { DAY_END_HOUR, DAY_START_HOUR, timeToMinutes } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { AppointmentChip } from './AppointmentChip';
import type { PatientOption, ServiceOption } from './AppointmentFormDialog';
import type { AppointmentView } from './types';

/** An hour-by-hour grid, so gaps in the day are as visible as the bookings. */
export function DayView({
  appointments,
  patients,
  services,
}: {
  appointments: AppointmentView[];
  patients: PatientOption[];
  services: ServiceOption[];
}) {
  const t = useTranslations('appointments');

  if (appointments.length === 0) {
    return <EmptyState icon={<CalendarDays size={40} aria-hidden />} title={t('emptyDay')} />;
  }

  const hours = Array.from(
    { length: DAY_END_HOUR - DAY_START_HOUR },
    (_, i) => DAY_START_HOUR + i,
  );

  // Anything outside opening hours still has to show up somewhere.
  const outside = appointments.filter((a) => {
    const hour = Math.floor(timeToMinutes(a.startTime) / 60);
    return hour < DAY_START_HOUR || hour >= DAY_END_HOUR;
  });

  return (
    <div>
      {outside.length > 0 ? (
        <div className="space-y-2 border-b border-line p-3">
          {outside.map((appointment) => (
            <AppointmentChip
              key={appointment.id}
              appointment={appointment}
              patients={patients}
              services={services}
            />
          ))}
        </div>
      ) : null}

      {hours.map((hour) => {
        const slot = appointments.filter(
          (a) => Math.floor(timeToMinutes(a.startTime) / 60) === hour,
        );

        return (
          <div
            key={hour}
            className="grid grid-cols-[4.5rem_1fr] border-b border-line last:border-b-0 sm:grid-cols-[6rem_1fr]"
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
              {slot.map((appointment) => (
                <AppointmentChip
                  key={appointment.id}
                  appointment={appointment}
                  patients={patients}
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
