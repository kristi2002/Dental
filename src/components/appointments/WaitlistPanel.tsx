import { CalendarClock, Check, Clock, ListChecks, MessageCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Link } from '@/i18n/navigation';
import { resolveWaitlistEntry } from '@/lib/actions/waitlist';
import type { FreeGap } from '@/lib/scheduling';
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
};

/**
 * The list of people who would take an earlier appointment, paired with the gaps
 * actually available on the day being viewed.
 *
 * The matching is the useful part: a 60-minute root canal is not a candidate for
 * a 20-minute hole, and showing it as one would waste a phone call. Each row
 * says plainly whether the day can hold it.
 */
export function WaitlistPanel({
  entries,
  freeGaps,
  dayLabel,
  services,
  canEdit,
}: {
  entries: WaitlistRow[];
  /** Empty stretches on the day currently in view. */
  freeGaps: FreeGap[];
  dayLabel: string;
  services: ServiceOption[];
  canEdit: boolean;
}) {
  const t = useTranslations('waitlist');
  const tc = useTranslations('common');
  const tr = useTranslations('reminders');

  const gapFor = (durationMin: number) => freeGaps.find((gap) => gap.minutes >= durationMin);

  return (
    <Card>
      <CardHeader
        title={t('title')}
        subtitle={t('subtitle', { count: entries.length })}
        icon={<ListChecks size={22} aria-hidden />}
        action={canEdit ? <WaitlistFormDialog services={services} /> : null}
      />

      {freeGaps.length > 0 ? (
        <p className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-soft px-5 py-3 text-[0.95rem] text-ink-soft">
          <Clock size={16} aria-hidden className="text-brand" />
          {t('freeOn', { day: dayLabel })}
          {freeGaps.map((gap) => (
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
          {entries.map((entry) => {
            const gap = gapFor(entry.durationMin);
            const message = gap
              ? tr('waitlistWhatsapp', {
                  name: entry.patientName.split(' ')[0] ?? entry.patientName,
                  day: dayLabel,
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
                      className="truncate text-[1.05rem] font-bold text-ink no-underline hover:text-brand-deep"
                    >
                      {entry.patientName}
                    </Link>
                    {entry.urgent ? <Badge tone="danger">{t('urgent')}</Badge> : null}
                    {entry.serviceName ? <Badge tone="brand">{entry.serviceName}</Badge> : null}
                  </p>
                  <p className="mt-0.5 text-[0.92rem] text-ink-soft">
                    {entry.durationMin} {tc('minutes')}
                    {entry.note ? ` · ${entry.note}` : ''}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      'flex items-center gap-1.5 text-[0.92rem] font-semibold',
                      gap ? 'text-ok' : 'text-ink-faint',
                    )}
                  >
                    <CalendarClock size={16} aria-hidden />
                    {gap ? t('fitsAt', { time: gap.startTime }) : t('noFit')}
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
