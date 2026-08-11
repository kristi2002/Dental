import { ShoppingCart, TrendingDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import type { ReorderLine } from '@/lib/reorder';
import { reorderAsText } from '@/lib/reorder';
import { cn } from '@/lib/utils';

/**
 * The shopping list, derived from what was actually consumed.
 *
 * Nothing here is ordered automatically — a purchase is the owner's decision.
 * The WhatsApp button just hands the finished list to whoever places the order.
 */
export function ReorderPanel({ lines }: { lines: ReorderLine[] }) {
  const t = useTranslations('reorder');

  if (lines.length === 0) return null;

  const text = reorderAsText(lines, t('messageHeading'));
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(text)}`;

  return (
    <Card className="mb-6">
      <CardHeader
        title={t('title')}
        subtitle={t('subtitle', { count: lines.length })}
        icon={<ShoppingCart size={22} aria-hidden />}
        action={
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
          >
            {t('send')}
          </a>
        }
      />

      <ul className="divide-y border-line">
        {lines.map((line) => (
          <li
            key={line.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-3 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="truncate text-[1.05rem] font-bold text-ink">{line.name}</span>
                {line.urgent ? <Badge tone="danger">{t('urgent')}</Badge> : null}
                {/* Already answered: shown, not hidden, so nobody re-orders it
                    and nobody forgets it is still not on the shelf. */}
                {line.orderedAt ? <Badge tone="brand">{t('onOrder')}</Badge> : null}
                {line.supplierName ? (
                  <span className="text-[0.88rem] text-ink-faint">{line.supplierName}</span>
                ) : null}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[0.92rem] text-ink-soft">
                <span className="flex items-center gap-1.5">
                  <TrendingDown size={15} aria-hidden />
                  {t('monthlyUse', { qty: line.monthlyUse, unit: line.unit })}
                </span>
                <span
                  className={cn(
                    line.daysLeft !== null && line.daysLeft <= 14 ? 'font-bold text-warn' : '',
                  )}
                >
                  {line.daysLeft === null
                    ? t('noUsage')
                    : t('daysLeft', { days: line.daysLeft })}
                </span>
              </p>
            </div>

            <p className="shrink-0 text-right">
              <span className="block text-[1.15rem] font-bold text-brand-deep tabular-nums">
                +{line.suggested} {line.unit}
              </span>
              <span className="block text-[0.85rem] text-ink-faint">{t('suggested')}</span>
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
