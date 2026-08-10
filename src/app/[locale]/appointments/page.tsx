import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { AppointmentFormDialog } from '@/components/appointments/AppointmentFormDialog';
import { DayView } from '@/components/appointments/DayView';
import { ListView } from '@/components/appointments/ListView';
import { WeekView } from '@/components/appointments/WeekView';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  fromDateKey,
  startOfMonth,
  startOfWeek,
  toDateKey,
  today,
} from '@/lib/dates';
import { getAppointmentsBetween, getPatientOptions, getServiceOptions } from '@/lib/queries';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type CalendarView = 'day' | 'week' | 'list';
const VIEWS: CalendarView[] = ['day', 'week', 'list'];

export default async function AppointmentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('appointments');
  const format = await getFormatter();

  const { view: rawView, date: rawDate } = await searchParams;
  const view: CalendarView = VIEWS.includes(rawView as CalendarView)
    ? (rawView as CalendarView)
    : 'day';
  const anchor = fromDateKey(rawDate);

  const range =
    view === 'day'
      ? { from: anchor, to: anchor }
      : view === 'week'
        ? { from: startOfWeek(anchor), to: endOfWeek(anchor) }
        : { from: startOfMonth(anchor), to: endOfMonth(anchor) };

  const [appointments, patients, services] = await Promise.all([
    getAppointmentsBetween(range.from, range.to),
    getPatientOptions(),
    getServiceOptions(),
  ]);

  const step = (direction: -1 | 1) =>
    view === 'day'
      ? addDays(anchor, direction)
      : view === 'week'
        ? addDays(anchor, direction * 7)
        : addMonths(anchor, direction);

  const hrefFor = (date: Date, nextView: CalendarView = view) =>
    `/appointments?view=${nextView}&date=${toDateKey(date)}`;

  const label =
    view === 'day'
      ? format.dateTime(anchor, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : view === 'week'
        ? `${format.dateTime(range.from, { day: 'numeric', month: 'short' })} – ${format.dateTime(
            range.to,
            { day: 'numeric', month: 'short', year: 'numeric' },
          )}`
        : format.dateTime(anchor, { month: 'long', year: 'numeric' });

  return (
    <>
      <PageHeader
        title={t('title')}
        actions={
          <AppointmentFormDialog
            patients={patients}
            services={services}
            defaultDate={toDateKey(view === 'day' ? anchor : today())}
          />
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={hrefFor(step(-1))} className="btn btn-secondary" aria-label={t('prev')}>
            <ChevronLeft size={20} aria-hidden />
          </Link>
          <Link href={hrefFor(today())} className="btn btn-secondary">
            {t('today')}
          </Link>
          <Link href={hrefFor(step(1))} className="btn btn-secondary" aria-label={t('next')}>
            <ChevronRight size={20} aria-hidden />
          </Link>
          <p className="ml-2 text-[1.15rem] font-bold text-ink">{label}</p>
        </div>

        <div
          role="group"
          aria-label={t('title')}
          className="flex gap-1 rounded-lg border-2 border-line-strong p-1"
        >
          {VIEWS.map((option) => (
            <Link
              key={option}
              href={hrefFor(anchor, option)}
              aria-current={option === view ? 'true' : undefined}
              className={cn(
                'min-h-10 rounded-md px-3.5 py-1.5 font-bold no-underline transition-colors',
                option === view
                  ? 'bg-ink text-white'
                  : 'text-ink-soft hover:bg-paper hover:text-ink',
              )}
            >
              {t(option === 'day' ? 'viewDay' : option === 'week' ? 'viewWeek' : 'viewList')}
            </Link>
          ))}
        </div>
      </div>

      <Card>
        {view === 'day' ? (
          <DayView appointments={appointments} patients={patients} services={services} />
        ) : view === 'week' ? (
          <WeekView anchor={anchor} appointments={appointments} />
        ) : (
          <ListView appointments={appointments} patients={patients} services={services} />
        )}
      </Card>
    </>
  );
}
