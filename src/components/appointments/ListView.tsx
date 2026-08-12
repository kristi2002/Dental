import { CalendarDays } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { EmptyState } from '@/components/ui/EmptyState';
import { AppointmentRow } from './AppointmentRow';
import type { PatientOption, ServiceOption } from './AppointmentFormDialog';
import type { AppointmentView } from './types';

/** A flat agenda for the whole month, grouped by day. */
export function ListView({
  appointments,
  services,
}: {
  appointments: AppointmentView[];
  services: ServiceOption[];
}) {
  const t = useTranslations('appointments');
  const format = useFormatter();

  if (appointments.length === 0) {
    return <EmptyState icon={<CalendarDays size={40} aria-hidden />} title={t('empty')} />;
  }

  const days = [...new Set(appointments.map((a) => a.date))];

  return (
    <div>
      {days.map((day) => (
        <section key={day}>
          <h3 className="border-b border-line bg-paper px-5 py-2.5 text-[1.05rem] font-bold text-ink">
            {format.dateTime(new Date(`${day}T00:00:00.000Z`), {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </h3>
          <div className="space-y-3 p-3">
            {appointments
              .filter((a) => a.date === day)
              .map((appointment) => (
                <AppointmentRow
                  key={appointment.id}
                  appointment={appointment}
                  services={services}
                />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
