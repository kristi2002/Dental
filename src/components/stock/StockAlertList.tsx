import { BellOff, PackageX, Truck, TriangleAlert } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { Link } from '@/i18n/navigation';
import { dismissStockAlert, markOrdered } from '@/lib/actions/stock';
import { alertHref, alertLabel, type StockAlert } from '@/lib/stock-alerts';
import { cn } from '@/lib/utils';

/**
 * The storage room's alarms, as rows on the reminder board.
 *
 * Deliberately not the reorder panel. That screen answers "what shall I buy from
 * whom", which is a sit-down job with a supplier on the phone; this answers "is
 * anything about to stop me working today", which is read standing up in eight
 * seconds. Same underlying facts, two different questions, and squeezing the
 * first onto a board people skim would guarantee nobody skims it.
 *
 * So each row carries exactly two verbs and no third. **Order it** is the real
 * completion — it is the thing that makes the material stop being a problem, and
 * it writes the same `orderedAt` the storage room has always used, so a delivery
 * clears it and the reorder panel already agrees. **Not now** is the escape
 * hatch, and the board is unusable without one: eleven materials, four of them
 * bought once a year, and a list you cannot quieten is a list nobody reads.
 *
 * A server component. The rows carry server actions and nothing here reacts to
 * anything in the browser — the modal around it is the only client part.
 */
export async function StockAlertList({
  alerts,
  canEdit,
}: {
  alerts: ReadonlyArray<StockAlert>;
  /** Whether the two verbs are offered. A reader gets the facts, not the buttons. */
  canEdit: boolean;
}) {
  const t = await getTranslations('reminderBoard');

  if (alerts.length === 0) return null;

  return (
    <ul className="divide-y divide-line">
      {alerts.map((alert) => {
        const out = alert.severity === 'out';

        return (
          <li key={alert.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
            {/* The tile says which of the two kinds of bad this is before a word
                is read — empty today, or emptying this week. */}
            <span
              className={cn(
                'mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl',
                out ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn',
              )}
              aria-hidden
            >
              {out ? <PackageX size={18} /> : <TriangleAlert size={18} />}
            </span>

            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {/* Straight to the shelf it is about, filtered to the one row —
                    the same href a follow-up about a material already builds. */}
                <Link href={alertHref(alert)} className="font-bold text-ink">
                  {alertLabel(alert)}
                </Link>
                <Badge tone={out ? 'danger' : 'warn'}>
                  {out ? t('stockOut') : t('stockLow')}
                </Badge>
              </p>

              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.9rem] text-ink-soft">
                {/* Two numbers, because one of them is meaningless alone: three
                    boxes is a crisis for a material that wants twenty and a full
                    shelf for one that wants two. */}
                <span
                  className={cn('font-semibold tabular-nums', out ? 'text-danger' : 'text-warn')}
                >
                  {t('stockOnShelf', { qty: alert.usable, min: alert.minLimit })}
                </span>
                <span className="text-ink-faint">{t('stockOnShelfLabel')}</span>

                <span aria-hidden>·</span>
                {/* Who to ask. A material with nobody against it is worth saying
                    out loud rather than leaving as a gap — it is the reason the
                    order cannot simply be sent. */}
                <span className={cn(!alert.supplierName && 'text-ink-faint italic')}>
                  {alert.supplierName || t('stockNoSupplier')}
                </span>
              </p>

              {canEdit ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {/* The completion. Same write the storage room has always
                      made, so a delivery clears it without anyone coming back
                      here. */}
                  <ActionForm action={markOrdered} values={{ id: alert.id }}>
                    <button type="submit" className="btn btn-secondary btn-sm">
                      <Truck size={16} aria-hidden />
                      {t('stockOrder')}
                    </button>
                  </ActionForm>

                  {/* Quietening it. Not a delete — the material is still low and
                      the storage room still says so; this only stops the board
                      asking until the shelf gets worse. */}
                  <ActionForm action={dismissStockAlert} values={{ id: alert.id }}>
                    <button
                      type="submit"
                      className="btn btn-ghost btn-sm"
                      title={t('stockDismissTitle')}
                    >
                      <BellOff size={16} aria-hidden />
                      {t('stockDismiss')}
                    </button>
                  </ActionForm>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
