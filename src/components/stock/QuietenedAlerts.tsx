import { BellRing, ChevronDown } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/ui/ActionForm';
import { Link } from '@/i18n/navigation';
import { restoreStockAlert } from '@/lib/actions/stock';
import { alertHref, alertLabel, type StockAlert } from '@/lib/stock-alerts';

/**
 * What the board has been told to stop asking about, and the way to take it
 * back.
 *
 * **Not now** is one press on a list somebody is skimming, which makes it
 * exactly the press that gets mis-aimed — and until this existed it was the only
 * press in the app with no way back short of a database client. The alert came
 * back only if the shelf got *worse*, so a mis-aimed dismissal on a material the
 * practice buys once a year stayed silent right up to the morning it ran out.
 *
 * Folded, and last. These rows are the opposite of urgent: every one of them is
 * a decision somebody already took, and a board that reopened that decision on
 * every load would be arguing with its own users. Collapsed it costs one quiet
 * line; the count in that line is what makes it worth opening — "3 quietened" is
 * a sentence, and it is the sentence somebody needs on the morning they wonder
 * why nothing warned them.
 *
 * A `<details>` rather than state: this is a server component inside a modal
 * that already stays open across a server action, and the browser's own
 * disclosure needs no hydration to work.
 */
export async function QuietenedAlerts({ alerts }: { alerts: ReadonlyArray<StockAlert> }) {
  const t = await getTranslations('reminderBoard');
  const format = await getFormatter();

  if (alerts.length === 0) return null;

  return (
    <details className="group border-t border-line bg-paper">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-[0.88rem] font-semibold text-ink-faint hover:text-ink sm:px-6">
        <ChevronDown
          size={16}
          aria-hidden
          className="transition-transform group-open:rotate-180"
        />
        {t('quietenedSummary', { count: alerts.length })}
      </summary>

      <ul className="divide-y divide-line border-t border-line bg-surface">
        {alerts.map((alert) => (
          <li
            key={alert.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 sm:px-6"
          >
            <div className="min-w-0">
              <Link href={alertHref(alert)} className="font-semibold text-ink-soft">
                {alertLabel(alert)}
              </Link>
              {/* Who and when, because the commonest reason to open this list is
                  that somebody else quietened something and the shelf is now a
                  problem. A name makes it obvious whose decision is being
                  reopened — which is the difference between undoing a mistake
                  and overruling a colleague. */}
              <p className="mt-0.5 text-[0.88rem] text-ink-faint">
                {t('quietenedAt', { qty: alert.usable, min: alert.minLimit })}
                {alert.dismissedAt
                  ? ` · ${
                      alert.dismissedByName
                        ? t('quietenedByOn', {
                            name: alert.dismissedByName,
                            date: format.dateTime(alert.dismissedAt, {
                              day: 'numeric',
                              month: 'short',
                            }),
                          })
                        : t('quietenedOn', {
                            date: format.dateTime(alert.dismissedAt, {
                              day: 'numeric',
                              month: 'short',
                            }),
                          })
                    }`
                  : ''}
              </p>
            </div>

            {/* No confirmation. Restoring puts a row back on a board — the
                gentlest possible outcome, and undoable by pressing "not now"
                again. A dialog here would be the app asking somebody to be sure
                they want to be warned about something. */}
            <ActionForm action={restoreStockAlert} values={{ id: alert.id }}>
              <button type="submit" className="btn btn-secondary btn-sm">
                <BellRing size={16} aria-hidden />
                {t('quietenedRestore')}
              </button>
            </ActionForm>
          </li>
        ))}
      </ul>
    </details>
  );
}
