'use client';

import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { TextField } from '@/components/ui/Field';
import { FormDialog } from '@/components/ui/FormDialog';
import { saveStockProduct } from '@/lib/actions/stock';

/**
 * Correcting the name a group of variants is filed under.
 *
 * The product row is made by typing its name on the material form, which is what
 * keeps grouping cheap enough to actually happen — and also means a typo becomes
 * a group of one that nothing will ever join. This is the fix, and like a shelf
 * category it reaches every variant at once.
 */
export function ProductFormDialog({
  product,
}: {
  product: { id: string; name: string; brand: string };
}) {
  const t = useTranslations('stock');
  const tc = useTranslations('common');
  const uid = useId();

  return (
    <FormDialog
      key={product.id}
      action={saveStockProduct}
      resetOnSuccess={false}
      title={t('productEdit')}
      submitLabel={tc('save')}
      pendingLabel={tc('saving')}
      cancelLabel={tc('cancel')}
      closeLabel={tc('close')}
      triggerTitle={t('productEdit')}
      triggerClassName="btn btn-ghost btn-sm"
      trigger={
        <>
          <Pencil size={17} aria-hidden />
          <span className="sr-only">{t('productEdit')}</span>
        </>
      }
    >
      <input type="hidden" name="id" value={product.id} />

      <TextField
        id={`${uid}-name`}
        name="name"
        label={t('product')}
        required
        autoComplete="off"
        defaultValue={product.name}
      />
      <TextField
        id={`${uid}-brand`}
        name="brand"
        label={t('brand')}
        hint={t('brandHint')}
        optional={tc('optional')}
        autoComplete="off"
        defaultValue={product.brand}
      />
    </FormDialog>
  );
}
