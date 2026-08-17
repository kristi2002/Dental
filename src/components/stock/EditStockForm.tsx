'use client';

import { Package, ShoppingCart, Tags, Truck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import {
  CountFields,
  IdentityFields,
  OrderFields,
  SupplyFields,
  type StockDefaults,
} from '@/components/stock/StockFields';
import { Badge } from '@/components/ui/Badge';
import { FormActions, FormLayout, FormPreview, FormSection } from '@/components/ui/FormPage';
import { saveStockItem } from '@/lib/actions/stock';
import { useRecoveredForm } from '@/lib/form-recovery';
import { cn } from '@/lib/utils';

/**
 * Correcting a material, as a screen rather than as a dialog.
 *
 * This was a modal opened off the row, on the theory that an edit is one nudged
 * field done without losing your place. It is not: the same ten questions are
 * asked here as on the "new material" page, and inside a dialog they arrived as
 * one undivided stack with no room to say what a minimum level or a pack group
 * is *for* — scrolling its own little window inside a page that was already
 * scrolling, and throwing the lot away on a stray press of Escape.
 *
 * As a page it gets the same four labelled cards the new-material form has, so
 * the two screens read as one form seen twice rather than two designs. It also
 * gets the one thing the dialog could not show: what the row says *now*. The
 * count typed here is absolute, and saving it writes the difference to the
 * ledger as a movement — so the figure being replaced, and the movement about to
 * be recorded, belong on screen beside the field that causes them.
 */
export function EditStockForm({
  item,
  categories,
  products,
  suppliers,
  from,
}: {
  item: StockDefaults;
  categories: Array<{ id: string; name: string }>;
  /** Product names already in use, offered as autocomplete on the group field. */
  products: string[];
  suppliers: Array<{ id: string; name: string }>;
  /**
   * Which list this was opened from — the catalogue, or the storage room. A
   * closed word rather than a path, because it is posted back with the form and
   * decides where the save returns to: a redirect target that arrives as free
   * text is a redirect target somebody else can choose.
   */
  from: 'catalog' | 'list';
}) {
  const t = useTranslations('stock');
  const tc = useTranslations('common');
  const uid = useId();

  const { state, formAction, formRef } = useRecoveredForm(saveStockItem);

  // The row as it will read once saved, kept in step as it is typed. The fields
  // stay uncontrolled — this listens to the change events they bubble, so the
  // preview costs the form nothing and cannot fall out of sync with it.
  const [preview, setPreview] = useState({
    name: item.name,
    code: item.code,
    categoryId: item.categoryId,
    variantName: item.variantName,
    quantity: String(item.quantity),
    minLimit: String(item.minLimit),
  });

  const quantity = Math.max(0, Number(preview.quantity) || 0);
  const minLimit = Math.max(0, Number(preview.minLimit) || 0);
  const category = categories.find((option) => option.id === preview.categoryId);

  // What the save will write to the ledger. Zero is the ordinary case — most
  // edits are a corrected name or a minimum nudged up — and says nothing.
  const delta = quantity - item.quantity;

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
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="from" value={from} />

      <FormLayout
        aside={
          <FormPreview title={t('editPreviewTitle')}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[1.12rem] font-bold text-ink">
                {preview.name.trim() || <span className="text-ink-faint">{t('edit')}</span>}
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

            <p className="mt-1 text-[0.95rem] text-ink-soft">
              {category?.name || t('uncategorized')} · {t('minShort', { min: minLimit })}
            </p>

            <p className="mt-3 flex items-baseline gap-2 text-[1.15rem] font-bold tabular-nums text-ink">
              {quantity}
              <span className="text-[0.9rem] font-semibold">{t('boxes', { count: quantity })}</span>
              {delta !== 0 ? (
                <span
                  className={cn(
                    'text-[0.95rem] font-bold tabular-nums',
                    delta < 0 ? 'text-warn' : 'text-ok',
                  )}
                >
                  {delta > 0 ? '+' : '−'}
                  {Math.abs(delta)}
                </span>
              ) : null}
            </p>

            {/* What the shelf says at this moment, against what is being typed
                over it. Worth its own line only once the two differ. */}
            {delta !== 0 ? (
              <div className="mt-3 space-y-1 border-t border-line pt-3">
                <p className="text-[0.9rem] font-semibold text-ink-soft tabular-nums">
                  {t('stocktakeOnRecord', { qty: item.quantity })}
                </p>
                <p className="text-[0.9rem] text-ink-faint">
                  {t('editMovementNote', {
                    delta: `${delta > 0 ? '+' : '−'}${Math.abs(delta)} ${t('boxes', {
                      count: Math.abs(delta),
                    })}`,
                  })}
                </p>
              </div>
            ) : null}
          </FormPreview>
        }
      >
        <FormSection
          title={t('sectionIdentity')}
          subtitle={t('sectionIdentityHint')}
          icon={<Tags size={22} aria-hidden />}
        >
          <IdentityFields uid={uid} item={item} categories={categories} products={products} />
        </FormSection>

        <FormSection
          title={t('sectionCounts')}
          subtitle={t('sectionCountsHint')}
          icon={<Package size={22} aria-hidden />}
        >
          <CountFields uid={uid} item={item} />
        </FormSection>

        <FormSection
          title={t('sectionOrdering')}
          subtitle={t('sectionOrderingHint')}
          icon={<ShoppingCart size={22} aria-hidden />}
        >
          <OrderFields uid={uid} item={item} />
        </FormSection>

        {/* Dropped entirely when the practice has recorded no suppliers, rather
            than shown as a card with an empty select inside it. */}
        {suppliers.length > 0 ? (
          <FormSection
            title={t('sectionSupplier')}
            subtitle={t('sectionSupplierHint')}
            icon={<Truck size={22} aria-hidden />}
          >
            <SupplyFields uid={uid} item={item} suppliers={suppliers} />
          </FormSection>
        ) : null}
      </FormLayout>

      <FormActions
        state={state}
        cancelHref={from === 'catalog' ? '/stock/catalog' : '/stock'}
        cancelLabel={tc('cancel')}
        saveLabel={tc('save')}
        pendingLabel={tc('saving')}
      />
    </form>
  );
}
