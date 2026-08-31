import { CalendarCheck, Clock } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { getOperatoryOptions, getProviderOptions } from '@/lib/queries';
import type { FreeGap } from '@/lib/scheduling';
import { AppointmentFormDialog, type PatientOption, type ServiceOption } from './AppointmentFormDialog';

/**
 * The chair time still unsold today, and a way to sell it.
 *
 * Gaps are derived from the bookings themselves rather than stored, so they need
 * no maintenance: filling half of an hour-long gap leaves the other half sitting
 * here the moment the booking saves, ready for the next person.
 */
export async function FreeTimeCard({
  gaps,
  date,
  services,
  canBook,
  canCreatePatient,
}: {
  gaps: FreeGap[];
  /** `YYYY-MM-DD` the gaps belong to. */
  date: string;
  services: ServiceOption[];
  canBook: boolean;
  canCreatePatient: boolean;
}) {
  const t = await getTranslations('dashboard');
  const tc = await getTranslations('common');
  const [staff, operatories] = await Promise.all([getProviderOptions(), getOperatoryOptions()]);

  const totalMinutes = gaps.reduce((sum, gap) => sum + gap.minutes, 0);

  return (
    <Card>
      <CardHeader
        title={t('freeTime')}
        subtitle={t('freeTimeTotal', { minutes: totalMinutes })}
        icon={<Clock size={22} aria-hidden />}
      />

      {gaps.length === 0 ? (
        <EmptyState icon={<CalendarCheck size={40} aria-hidden />} title={t('freeTimeNone')} />
      ) : (
        <ul>
          {gaps.map((gap) => (
            <li
              key={gap.startTime}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5 last:border-b-0"
            >
              <span className="min-w-0">
                <span className="block text-body font-bold text-ink tabular-nums">
                  {gap.startTime} – {gap.endTime}
                </span>
                <span className="block text-meta text-ink-soft">
                  {gap.minutes} {tc('minutes')}
                </span>
              </span>

              {canBook ? (
                <AppointmentFormDialog
                  services={services}
                  staff={staff}
                  operatories={operatories}
                  defaultDate={date}
                  defaultStartTime={gap.startTime}
                  slot={gap}
                  canCreatePatient={canCreatePatient}
                  triggerClassName="btn btn-secondary btn-sm"
                  triggerLabel={t('freeTimeBook')}
                />
              ) : (
                <Badge tone="ok">{t('freeTimeOpen')}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
