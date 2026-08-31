import { CalendarClock, CalendarX2, CircleCheck, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { StatCard } from '@/components/ui/StatCard';
import { cn } from '@/lib/utils';

type Alert = {
  key: string;
  tone: 'danger' | 'warn';
  Icon: LucideIcon;
  count: number;
  label: string;
  /** Where the answer lives. Undefined when the reader may not open it. */
  href?: string;
};

/* One, two or three of these can be true at once, and a lone card stretched
 * across the page reads as a banner rather than a count — so the row is only as
 * wide as it has cards to fill. */
const COLUMNS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
};

/**
 * What is wrong with the storeroom.
 *
 * Each of these was a loose bold sentence above the filter bar, with the money
 * line sitting between two of them — three unrelated-looking scraps rather than
 * one status panel. Worse, they were dead ends: "4 materials below minimum" is
 * only half an answer, and the list that names the four was already one filter
 * away.
 *
 * So they are one row of counts, the same card the dashboard opens with: the
 * number is what the eye lands on, the tint says how bad it is, and the whole
 * card is what you press to see which materials it means. Expired first — an
 * expired box is the only one of these that must not reach a patient — then low
 * stock, which can empty a shelf this week, then the ninety-day horizon, which
 * is a purchasing decision rather than a problem.
 *
 * There was a fourth line under these, totalling what the room was worth. It is
 * gone, along with every other price in the storage room: what the practice
 * spends is the owner's business and this screen is read by whoever happens to
 * be standing at the cupboard.
 */
export async function StockAlerts({
  lowCount,
  expiredCount,
  expiringCount,
  canEdit,
}: {
  lowCount: number;
  expiredCount: number;
  expiringCount: number;
  canEdit: boolean;
}) {
  const t = await getTranslations('stock');

  // The lot-by-lot screen is `stock.edit`, because what it adds is the write-off
  // action. A reader who cannot open it is told the fact without the dead link.
  const expiryHref = canEdit ? '/stock/expiry' : undefined;

  const alerts: Alert[] = [];

  if (expiredCount > 0) {
    alerts.push({
      key: 'expired',
      tone: 'danger',
      Icon: CalendarX2,
      count: expiredCount,
      label: t('alertExpiredLabel'),
      href: expiryHref,
    });
  }

  if (lowCount > 0) {
    alerts.push({
      key: 'low',
      tone: 'warn',
      Icon: TriangleAlert,
      count: lowCount,
      label: t('alertLowLabel'),
      // The same value the dashboard's stock alert links to — keep it stable.
      href: '/stock?filter=low',
    });
  }

  if (expiringCount > 0) {
    alerts.push({
      key: 'expiring',
      tone: 'warn',
      Icon: CalendarClock,
      count: expiringCount,
      label: t('alertExpiringLabel'),
      href: expiryHref,
    });
  }

  // Silence is not the same as an answer: with nothing wrong, the panel says so
  // rather than disappearing and leaving the reader to wonder whether the checks
  // ran at all. No number here — nought of three separate things is a sentence,
  // not a count.
  if (alerts.length === 0) {
    return (
      <section
        className="card mb-6 flex items-center gap-4 px-5 py-4"
        aria-label={t('alertsLabel')}
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ok-soft text-ok">
          <CircleCheck size={22} aria-hidden />
        </span>
        <span className="text-body font-bold text-ok">{t('lowAlert', { count: 0 })}</span>
      </section>
    );
  }

  return (
    <section className={cn('mb-6 grid gap-4', COLUMNS[alerts.length])} aria-label={t('alertsLabel')}>
      {alerts.map((alert) => (
        <StatCard
          key={alert.key}
          label={alert.label}
          value={alert.count}
          Icon={alert.Icon}
          href={alert.href}
          tone={alert.tone}
        />
      ))}
    </section>
  );
}
