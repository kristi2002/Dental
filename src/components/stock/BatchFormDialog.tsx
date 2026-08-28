'use client';

import { PackagePlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { TextAreaField, TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveBatch } from '@/lib/actions/stock';

/**
 * Recording a delivery.
 *
 * This is deliberately the same action as restocking rather than a separate
 * bookkeeping step: the quantity goes up, the ledger gets its movement and the
 * "on order" flag clears, all on one press. Three separate steps would be three
 * chances to do two of them.
 */
export function BatchFormDialog({
  itemId,
  itemName,
  today,
}: {
  itemId: string;
  itemName: string;
  /** `YYYY-MM-DD`, used to bound the date pickers and to default the purchase. */
  today: string;
}) {
  const t = useTranslations('stock');
  const tc = useTranslations('common');
  const uid = useId();

  return (
    <FormDialog
      action={saveBatch}
      title={t('batchNew', { name: itemName })}
      submitLabel={t('batchSave')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      // Labelled, and the full width of the card's action column: this is the
      // opposite of "take out" sitting directly above it, and two unlabelled
      // squares differing only by the direction of a small arrow is how a
      // delivery gets recorded as a withdrawal.
      triggerClassName="btn btn-secondary btn-sm w-full leading-tight"
      triggerTitle={t('batchNewShort')}
      trigger={
        <>
          <PackagePlus size={17} aria-hidden />
          {t('batchNewShort')}
        </>
      }
    >
      <input type="hidden" name="itemId" value={itemId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${uid}-quantity`}
          name="quantity"
          type="number"
          min={1}
          step={1}
          label={t('batchQuantity')}
          required
          defaultValue={1}
        />
        {/* Blank is a legitimate answer — plenty of materials carry no date, and
            treating a blank as a warning would make the whole signal noise. */}
        <TextField
          id={`${uid}-expiry`}
          name="expiryDate"
          type="date"
          label={t('batchExpiry')}
          optional={tc('optional')}
          min={today}
        />
      </div>

      {/* The invoice, not the keystroke. A delivery typed in a fortnight late
          belongs in the week it arrived — the burn rate reads these dates. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id={`${uid}-purchased`}
          name="purchasedAt"
          type="date"
          label={t('batchPurchased')}
          hint={t('batchPurchasedHint')}
          max={today}
          defaultValue={today}
        />
        <TextField
          id={`${uid}-manufactured`}
          name="manufacturedAt"
          type="date"
          label={t('batchManufactured')}
          optional={tc('optional')}
          max={today}
        />
      </div>

      {/* The number a recall notice asks for. Nothing else can answer it. */}
      <TextField
        id={`${uid}-lot`}
        name="lotNumber"
        label={t('batchLot')}
        hint={t('batchLotHint')}
        optional={tc('optional')}
      />

      <TextAreaField
        id={`${uid}-notes`}
        name="notes"
        label={tc('notes')}
        optional={tc('optional')}
        rows={2}
      />
    </FormDialog>
  );
}
