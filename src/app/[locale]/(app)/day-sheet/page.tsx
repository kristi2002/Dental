import { TriangleAlert } from 'lucide-react';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { PrintButton } from '@/components/prescriptions/PrintButton';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { describeRanges } from '@/lib/clinic-hours';
import { fromDateKey, minutesToTime, timeToMinutes, toDateKey } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { getClinicProfile, getDaySchedule, getProviderOptions } from '@/lib/queries';
import { findFreeGaps } from '@/lib/scheduling';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'daySheet' });
  return { title: t('title') };
}

/**
 * The day on one sheet of paper.
 *
 * A clinic that runs on a screen still wants the list on the wall: it survives
 * the wifi going down, it is readable from across the room, and it is what the
 * nurse ticks off. Rendered as an ordinary page and printed by the browser —
 * `print:` utilities and the rules in `globals.css` strip the app chrome, so
 * what comes out is the list and nothing else.
 */
export default async function DaySheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ date?: string; staff?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission('appointment.view');

  const t = await getTranslations('daySheet');
  const ta = await getTranslations('appointments');
  const format = await getFormatter();

  const { date: rawDate, staff: rawStaff } = await searchParams;
  const day = fromDateKey(rawDate);

  const providers = await getProviderOptions();
  const staffFilter = providers.some((person) => person.id === rawStaff) ? rawStaff! : '';

  const [appointments, schedule, profile, freeGaps] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        date: day,
        ...(staffFilter ? { staffUserId: staffFilter } : {}),
        // A cancelled slot is not work; printing it as a line to tick off is
        // how somebody ends up calling a patient who already called off.
        status: { not: 'CANCELLED' },
      },
      select: {
        id: true,
        startTime: true,
        durationMin: true,
        status: true,
        serviceName: true,
        notes: true,
        confirmedAt: true,
        patient: {
          select: {
            firstName: true,
            lastName: true,
            phone: true,
            alerts: {
              // Only what would change what happens in the chair. An INFO note
              // does not belong on a sheet pinned to a wall.
              where: { severity: { in: ['CRITICAL', 'IMPORTANT'] } },
              select: { kind: true, substance: true, severity: true },
            },
          },
        },
        staffUser: { select: { firstName: true, lastName: true } },
        operatory: { select: { name: true } },
      },
    }),
    getDaySchedule(day, staffFilter),
    getClinicProfile(),
    // What is still sellable. The sheet on the wall is what the front desk reads
    // when the screen is busy and somebody rings wanting to come in today —
    // without the holes marked, the only way to answer is to go back to a
    // computer, which is the moment the printed sheet stops being useful.
    findFreeGaps({ date: day, staffUserId: staffFilter || undefined }),
  ]);

  const ordered = [...appointments].sort(
    (a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
  );

  const heading = format.dateTime(day, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3" data-print-hide>
        {/* The trail keeps the day and the provider filter in the link back, so
            returning to the diary returns to the day this sheet is of. */}
        <Breadcrumbs
          items={[
            {
              href: `/appointments?view=day&date=${toDateKey(day)}${staffFilter ? `&staff=${staffFilter}` : ''}`,
              label: ta('title'),
            },
            { label: t('title') },
          ]}
        />
        <PrintButton label={t('print')} />
      </div>

      <article className="card p-8 print:border-0 print:p-0 print:shadow-none">
        <header className="mb-5 border-b-2 border-line pb-4">
          <p className="text-[0.9rem] font-bold tracking-wide text-ink-faint uppercase">
            {profile.name || 'DentOrganizer'}
          </p>
          <h1 className="text-2xl font-bold text-ink">{heading}</h1>
          <p className="mt-1 text-[1rem] text-ink-soft tabular-nums">
            {schedule.closed
              ? (schedule.closureReason ?? ta('closedDay'))
              : describeRanges(schedule.ranges)}
            {staffFilter
              ? ` · ${providers.find((p) => p.id === staffFilter)?.name}`
              : ''}
            {` · ${t('count', { count: ordered.length })}`}
          </p>
        </header>

        {ordered.length === 0 ? (
          <p className="py-8 text-center text-[1.05rem] text-ink-soft">{ta('emptyDay')}</p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                <th className="py-2 pr-3 text-[0.85rem] font-bold tracking-wide text-ink-faint uppercase">
                  {t('time')}
                </th>
                <th className="py-2 pr-3 text-[0.85rem] font-bold tracking-wide text-ink-faint uppercase">
                  {t('patient')}
                </th>
                <th className="py-2 pr-3 text-[0.85rem] font-bold tracking-wide text-ink-faint uppercase">
                  {t('treatment')}
                </th>
                <th className="py-2 text-[0.85rem] font-bold tracking-wide text-ink-faint uppercase">
                  {t('done')}
                </th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((appointment) => {
                const end = minutesToTime(
                  timeToMinutes(appointment.startTime) + appointment.durationMin,
                );

                return (
                  <tr key={appointment.id} className="border-b border-line align-top">
                    <td className="py-3 pr-3 font-bold tabular-nums whitespace-nowrap">
                      {appointment.startTime}
                      <span className="block text-[0.85rem] font-normal text-ink-soft">
                        {end}
                      </span>
                    </td>

                    <td className="py-3 pr-3">
                      <span className="text-[1.05rem] font-bold text-ink">
                        {appointment.patient.lastName} {appointment.patient.firstName}
                      </span>
                      <span className="block text-[0.9rem] text-ink-soft tabular-nums">
                        {appointment.patient.phone}
                        {appointment.confirmedAt ? ` · ${ta('confirmed')}` : ''}
                      </span>

                      {/* The one thing on this sheet that must not be missed,
                          and the reason it is worth printing at all. */}
                      {appointment.patient.alerts.length > 0 ? (
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 font-bold text-danger">
                          <TriangleAlert size={15} aria-hidden />
                          {appointment.patient.alerts
                            .map((alert) =>
                              alert.substance
                                ? `${alert.kind}: ${alert.substance}`
                                : alert.kind,
                            )
                            .join(' · ')}
                        </span>
                      ) : null}
                    </td>

                    <td className="py-3 pr-3 text-[0.98rem] text-ink-soft">
                      {appointment.serviceName || '—'}
                      {appointment.staffUser || appointment.operatory ? (
                        <span className="block text-[0.88rem] text-ink-faint">
                          {[
                            appointment.staffUser
                              ? `${appointment.staffUser.firstName} ${appointment.staffUser.lastName}`
                              : '',
                            appointment.operatory?.name ?? '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      ) : null}
                      {appointment.notes ? (
                        <span className="block text-[0.88rem] text-ink-faint">
                          {appointment.notes}
                        </span>
                      ) : null}
                    </td>

                    {/* An empty box, because the sheet is going on a wall and
                        somebody is going to tick it with a pen. */}
                    <td className="py-3">
                      <span
                        aria-hidden
                        className="inline-block h-6 w-6 rounded border-2 border-line-strong"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Under the list, not in it: these are not appointments and must never
            be read as a line to tick off. */}
        {freeGaps.length > 0 ? (
          <footer className="mt-5 border-t-2 border-line pt-3">
            <p className="text-[0.85rem] font-bold tracking-wide text-ink-faint uppercase">
              {t('freeTitle')}
            </p>
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[1rem] font-semibold text-ink tabular-nums">
              {freeGaps.map((gap) => (
                <span key={gap.startTime}>
                  {gap.startTime}–{gap.endTime}
                  <span className="ml-1 font-normal text-ink-soft">
                    ({ta('durationValue', { min: gap.minutes })})
                  </span>
                </span>
              ))}
            </p>
          </footer>
        ) : null}
      </article>
    </>
  );
}
