import { Trash2 } from 'lucide-react';
import { getFormatter, getTranslations } from 'next-intl/server';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { deleteBatch } from '@/lib/actions/stock';
import { expiryLevel } from '@/lib/expiry';
import { cn } from '@/lib/utils';

export type BatchView = {
  id: string;
  lotNumber: string;
  /** ISO string, or empty when the material carries no date. */
  expiryDate: string;
  /** ISO string. Empty only for lots recorded before deliveries were dated. */
  purchasedAt: string;
  /** ISO string, or empty when the box does not print one. */
  manufacturedAt: string;
  /** How many boxes arrived in this lot. */
  quantity: number;
  notes: string;
};

const LEVEL_TONE = { EXPIRED: 'danger', SOON: 'warn', OK: 'neutral' } as const;

/** The lots behind one item's counter, oldest date first. */
export async function BatchList({
  batches,
  canEdit,
}: {
  batches: BatchView[];
  canEdit: boolean;
}) {
  const t = await getTranslations('stock');
  const tc = await getTranslations('common');
  const format = await getFormatter();

  if (batches.length === 0) return null;

  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {batches.map((batch) => {
        const expiry = batch.expiryDate ? new Date(batch.expiryDate) : null;
        const level = expiryLevel(expiry);

        // What the delivery note said, kept on a second line: it is what tells
        // two lots of the same material apart months later, and what an invoice
        // is checked against — but it is not what anyone reads the chip for.
        const purchased = batch.purchasedAt ? new Date(batch.purchasedAt) : null;
        const manufactured = batch.manufacturedAt ? new Date(batch.manufacturedAt) : null;
        const hasProvenance = purchased !== null || manufactured !== null;

        return (
          <li
            key={batch.id}
            className={cn(
              'flex flex-col gap-0.5 rounded-md border px-2.5 py-1.5 text-[0.9rem]',
              level === 'EXPIRED'
                ? 'border-danger bg-danger-soft text-danger'
                : level === 'SOON'
                  ? 'border-warn bg-warn-soft text-warn'
                  : 'border-line bg-paper text-ink-soft',
            )}
          >
            {/* A `div`, not a `span`: the delete control below is a `<form>`,
                which a browser will not leave inside phrasing content. The
                parser moves it, the parsed DOM stops matching what the server
                sent, and hydration fails on the whole page. */}
            <div className="flex items-center gap-2">
              <span className="font-bold tabular-nums">
                {batch.quantity} {t('boxes', { count: batch.quantity })}
              </span>
              {batch.lotNumber ? (
                <span className="tabular-nums">{t('lotShort', { lot: batch.lotNumber })}</span>
              ) : null}
              {expiry ? (
                <span className="tabular-nums">
                  {format.dateTime(expiry, { month: 'short', year: 'numeric' })}
                </span>
              ) : null}
              {level !== 'OK' ? (
                <Badge tone={LEVEL_TONE[level]}>
                  {level === 'EXPIRED' ? t('expired') : t('expiringSoon')}
                </Badge>
              ) : null}

              {canEdit ? (
                <ActionForm
                  action={deleteBatch}
                  values={{ id: batch.id }}
                  confirmMessage={t('batchDeleteConfirm')}
                >
                  <button
                    type="submit"
                    className="opacity-70 hover:opacity-100"
                    title={tc('delete')}
                  >
                    <Trash2 size={15} aria-hidden />
                    <span className="sr-only">{tc('delete')}</span>
                  </button>
                </ActionForm>
              ) : null}
            </div>

            {hasProvenance ? (
              <div className="flex flex-wrap items-center gap-x-2 text-[0.82rem] opacity-75">
                {purchased ? (
                  <span className="tabular-nums">
                    {t('batchBoughtOn', {
                      date: format.dateTime(purchased, { day: 'numeric', month: 'short' }),
                    })}
                  </span>
                ) : null}
                {manufactured ? (
                  <span className="tabular-nums">
                    {t('batchMadeOn', {
                      date: format.dateTime(manufactured, { month: 'short', year: 'numeric' }),
                    })}
                  </span>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
