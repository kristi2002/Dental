import { CalendarClock, Check, Clock, ListChecks, MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Link } from '@/i18n/navigation';
import { resolveWaitlistEntry } from '@/lib/actions/waitlist';
import { assignGaps, type DatedGap } from '@/lib/scheduling';
import { whatsappLink } from '@/lib/reminders';
import { cn } from '@/lib/utils';
import type { ServiceOption } from './AppointmentFormDialog';
import { WaitlistFormDialog } from './WaitlistFormDialog';

export type WaitlistRow = {
  id: string;
  patientId: string;
  patientName: string;
  phone: string;
  serviceName: string;
  durationMin: number;
  note: string;
  urgent: boolean;
  /** Whole days since the request, so a list nobody prunes says so. */
  waitingDays: number;
};

/** A free stretch with its day already written the way a person reads it. */
export type OfferGap = DatedGap & { dayLabel: string };

/**
 * The list of people who would take an earlier appointment, paired with the free
 * time actually coming up.
 *
 * The matching is the useful part: a 60-minute root canal is not a candidate for
 * a 20-minute hole, and showing it as one would waste a phone call. No two rows
 * are sent to the same minutes either, because the offer here is a message
 * somebody actually sends.
 *
 * The search runs past the day in view. A list read one day at a time answers
 * "not today" over and over to a person who has waited three months; what the
 * front desk is asked at the counter is when the practice *can* take them, so a
 * row that the day cannot hold names the next day that can.
 */
export function WaitlistPanel({
  entries,
  gaps,
  anchorDate,
  windowDays,
  dayLabel,
  services,
  canEdit,
}: {
  entries: WaitlistRow[];
  /** Empty stretches from the day in view onwards, in the order they happen. */
  gaps: OfferGap[];
  /** `YYYY-MM-DD` of the day in view — what counts as "this day" on a row. */
  anchorDate: string;
  /** How far ahead the search ran, so a fruitless one can say how far. */
  windowDays: number;
  dayLabel: string;
  services: ServiceOption[];
  canEdit: boolean;
}) {
  const t = useTranslations('waitlist');
  const tc = useTranslations('common');
  const tr = useTranslations('reminders');

  const offers = assignGaps(entries, gaps);
  // The badge row is about the day being looked at; the offers below may reach
  // into next week.
  const onThisDay = gaps.filter((gap) => gap.date === anchorDate);

  return (
    <Card>
      <CardHeader
        title={t('title')}
        subtitle={t('subtitle', { count: entries.length })}
        icon={<ListChecks size={22} aria-hidden />}
        action={canEdit ? <WaitlistFormDialog services={services} /> : null}
      />

      {onThisDay.length > 0 ? (
        <p className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-soft px-5 py-3 text-body text-ink-soft">
          <Clock size={16} aria-hidden className="text-brand" />
          {t('freeOn', { day: dayLabel })}
          {onThisDay.map((gap) => (
            <Badge key={gap.startTime} tone="ok">
              {gap.startTime}–{gap.endTime}
            </Badge>
          ))}
        </p>
      ) : null}

      {entries.length === 0 ? (
        <EmptyState icon={<ListChecks size={40} aria-hidden />} title={t('empty')} />
      ) : (
        <ul className="divide-y border-line">
          {offers.map(({ entry, gap }) => {
            const message = gap
              ? tr('waitlistWhatsapp', {
                  name: entry.patientName.split(' ')[0] ?? entry.patientName,
                  day: gap.dayLabel,
                  time: gap.startTime,
                })
              : '';
            const whatsapp = gap && entry.phone ? whatsappLink(entry.phone, message) : null;

            return (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-3.5 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/patients/${entry.patientId}`}
                      className="truncate text-body font-bold text-ink no-underline hover:text-brand-deep"
                    >
                      {entry.patientName}
                    </Link>
                    {entry.urgent ? <Badge tone="danger">{t('urgent')}</Badge> : null}
                    {entry.serviceName ? <Badge tone="brand">{entry.serviceName}</Badge> : null}
                  </p>
                  <p className="mt-0.5 text-meta text-ink-soft">
                    {entry.durationMin} {tc('minutes')}
                    {' · '}
                    {t('waitingSince', { days: entry.waitingDays })}
                    {entry.note ? ` · ${entry.note}` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'flex items-center gap-1.5 text-meta font-semibold',
                      gap ? 'text-ok' : 'text-ink-faint',
                    )}
                  >
                    <CalendarClock size={16} aria-hidden />
                    {gap
                      ? gap.date === anchorDate
                        ? t('fitsAt', { time: gap.startTime })
                        : t('fitsOn', { day: gap.dayLabel, time: gap.startTime })
                      : t('noFitWithin', { days: windowDays })}
                  </span>

                  {whatsapp ? (
                    <a
                      href={whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary btn-sm"
                    >
                      <MessageCircle size={17} aria-hidden />
                      {t('offer')}
                    </a>
                  ) : null}

                  {canEdit ? (
                    <ActionForm action={resolveWaitlistEntry} values={{ id: entry.id }}>
                      <button type="submit" className="btn btn-ghost btn-sm" title={t('resolve')}>
                        <Check size={17} aria-hidden />
                        <span className="sr-only">{t('resolve')}</span>
                      </button>
                    </ActionForm>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
