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
  quantity: number;
  notes: string;
};

const LEVEL_TONE = { EXPIRED: 'danger', SOON: 'warn', OK: 'neutral' } as const;

/** The lots behind one item's counter, oldest date first. */
export async function BatchList({
  batches,
  unit,
  canEdit,
}: {
  batches: BatchView[];
  unit: string;
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

        return (
          <li
            key={batch.id}
            className={cn(
              'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[0.9rem]',
              level === 'EXPIRED'
                ? 'border-danger bg-danger-soft text-danger'
                : level === 'SOON'
                  ? 'border-warn bg-warn-soft text-warn'
                  : 'border-line bg-paper text-ink-soft',
            )}
          >
            <span className="font-bold tabular-nums">
              {batch.quantity} {unit}
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
                <button type="submit" className="opacity-70 hover:opacity-100" title={tc('delete')}>
                  <Trash2 size={15} aria-hidden />
                  <span className="sr-only">{tc('delete')}</span>
                </button>
              </ActionForm>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
