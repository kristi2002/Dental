'use client';

import { Package, ShoppingCart, Tags, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import {
  CountFields,
  IdentityFields,
  OrderFields,
  SupplyFields,
} from '@/components/stock/StockFields';
import { Badge } from '@/components/ui/Badge';
import { FormActions, FormLayout, FormPreview, FormSection } from '@/components/ui/FormPage';
import { saveStockItem } from '@/lib/actions/stock';
import { useRecoveredForm } from '@/lib/form-recovery';

/**
 * Recording a material, as a screen rather than as a dialog.
 *
 * Adding to the storage room is a stock-taking errand, not a correction: it is
 * done with a delivery note or a supplier's invoice in hand, ten fields at a
 * time, and often for several materials one after another. A modal has no room
 * to explain what a pack size or a minimum level is *for*, scrolls its own little
 * window inside the page, and loses everything typed if it is dismissed by
 * accident. A page can be left and come back to, and linked to from anywhere.
 *
 * Correcting a material is the same form with the answers already in it, and is
 * a page for the same reasons — see `EditStockForm`.
 */
export function NewStockForm({
  categories,
  products,
  suppliers,
}: {
  categories: Array<{ id: string; name: string }>;
  /** Product names already in use, offered as autocomplete on the group field. */
  products: string[];
  suppliers: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations('stock');
  const tc = useTranslations('common');
  const uid = useId();

  const { state, formAction, formRef } = useRecoveredForm(saveStockItem);

  // What the shelf row will look like once saved, kept in step as it is typed.
  // The fields stay uncontrolled — this listens to the change events they bubble,
  // so the preview costs the form nothing and cannot fall out of sync with it.
  const [preview, setPreview] = useState({
    name: '',
    code: '',
    categoryId: '',
    variantName: '',
    quantity: '0',
    minLimit: '5',
  });

  const quantity = Math.max(0, Number(preview.quantity) || 0);
  const minLimit = Math.max(0, Number(preview.minLimit) || 0);
  const category = categories.find((option) => option.id === preview.categoryId);

  return (
    <form
      ref={formRef}
      action={formAction}
      onChange={(event) => {
        const field = event.target;
        if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLSelectElement)) return;
        if (field.name in preview) {
          setPreview((current) => ({ ...current, [field.name]: field.value }));
        }
      }}
    >
      <FormLayout
        aside={
          /* The row this form is building, as it is built. It is the same shape
             the stock list shows, so the badge answers the one question the two
             number fields ask together — a minimum of 5 typed against a count of
             2 means the material is filed away already below its own limit, and
             that is worth seeing before it is saved rather than after. */
          <FormPreview title={t('previewTitle')}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-lead font-bold text-ink">
                {preview.name.trim() || <span className="text-ink-faint">{t('new')}</span>}
                {preview.variantName.trim() ? (
                  <span className="ml-1.5 font-semibold text-ink-soft">
                    {preview.variantName.trim()}
                  </span>
                ) : null}
              </p>
              {preview.code.trim() ? (
                <span className="font-semibold tabular-nums text-ink-faint">
                  #{preview.code.trim()}
                </span>
              ) : null}
              {quantity === 0 ? (
                <Badge tone="danger">{t('out')}</Badge>
              ) : quantity <= minLimit ? (
                <Badge tone="warn">{t('low')}</Badge>
              ) : (
                <Badge tone="ok">{t('ok')}</Badge>
              )}
            </div>

            <p className="mt-1 text-body text-ink-soft">
              {category?.name || t('uncategorized')} · {t('minShort', { min: minLimit })}
            </p>

            <p className="mt-3 text-lead font-bold tabular-nums text-ink">
              {quantity} <span className="text-meta font-semibold">{t('boxes', { count: quantity })}</span>
            </p>
          </FormPreview>
        }
      >
        <FormSection
          title={t('sectionIdentity')}
          subtitle={t('sectionIdentityHint')}
          icon={<Tags size={22} aria-hidden />}
        >
          <IdentityFields uid={uid} categories={categories} products={products} />
        </FormSection>

        <FormSection
          title={t('sectionCounts')}
          subtitle={t('sectionCountsHint')}
          icon={<Package size={22} aria-hidden />}
        >
          <CountFields uid={uid} />
        </FormSection>

        <FormSection
          title={t('sectionOrdering')}
          subtitle={t('sectionOrderingHint')}
          icon={<ShoppingCart size={22} aria-hidden />}
        >
          <OrderFields uid={uid} />
        </FormSection>

        <FormSection
          title={t('sectionSupplier')}
          subtitle={t('sectionSupplierHint')}
          icon={<Truck size={22} aria-hidden />}
        >
          <SupplyFields uid={uid} suppliers={suppliers} />
        </FormSection>
      </FormLayout>

      <FormActions
        state={state}
        cancelHref="/stock"
        cancelLabel={tc('cancel')}
        discardMessage={tc('discardUnsaved')}
        saveLabel={tc('save')}
        pendingLabel={tc('saving')}
      />
    </form>
  );
}
