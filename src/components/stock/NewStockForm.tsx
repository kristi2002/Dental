'use client';

import { Package, ShoppingCart, Tags, Wallet } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState, type ReactNode } from 'react';
import {
  CountFields,
  IdentityFields,
  OrderFields,
  PricingFields,
} from '@/components/stock/StockFields';
import { Badge } from '@/components/ui/Badge';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Link } from '@/i18n/navigation';
import { saveStockItem } from '@/lib/actions/stock';
import { useRecoveredForm } from '@/lib/form-recovery';

/** A card with a heading that says what the group of fields is for. */
function Section({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card overflow-hidden">
      <header className="flex items-start gap-3 border-b border-line bg-surface-soft px-5 py-4">
        <span className="mt-0.5 text-brand">{icon}</span>
        <div>
          <h2 className="text-[1.15rem] font-bold text-ink">{title}</h2>
          <p className="text-[0.95rem] text-ink-soft">{subtitle}</p>
        </div>
      </header>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

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
 * Editing stays a dialog — that is a change to one field on a row you are already
 * looking at, not a form you work through.
 */
export function NewStockForm({
  categories,
  units,
  suppliers,
  currency,
}: {
  categories: Array<{ id: string; name: string }>;
  units: string[];
  suppliers: Array<{ id: string; name: string }>;
  /** ISO 4217 code, so the price field says which money it means. */
  currency: string;
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
    quantity: '0',
    minLimit: '5',
    unit: 'pcs',
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
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Section
            title={t('sectionIdentity')}
            subtitle={t('sectionIdentityHint')}
            icon={<Tags size={22} aria-hidden />}
          >
            <IdentityFields uid={uid} categories={categories} />
          </Section>

          <Section
            title={t('sectionCounts')}
            subtitle={t('sectionCountsHint')}
            icon={<Package size={22} aria-hidden />}
          >
            <CountFields uid={uid} units={units} />
          </Section>

          <Section
            title={t('sectionOrdering')}
            subtitle={t('sectionOrderingHint')}
            icon={<ShoppingCart size={22} aria-hidden />}
          >
            <OrderFields uid={uid} />
          </Section>

          <Section
            title={t('sectionPricing')}
            subtitle={t('sectionPricingHint')}
            icon={<Wallet size={22} aria-hidden />}
          >
            <PricingFields uid={uid} currency={currency} suppliers={suppliers} />
          </Section>
        </div>

        {/* The row this form is building, as it is built. It is the same shape
            the stock list shows, so the badge answers the one question the two
            number fields ask together — a minimum of 5 typed against a count of
            2 means the material is filed away already below its own limit, and
            that is worth seeing before it is saved rather than after. */}
        <aside className="card sticky top-6 hidden p-5 xl:block">
          <h2 className="mb-3 text-[0.9rem] font-bold tracking-wide text-ink-faint uppercase">
            {t('previewTitle')}
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[1.12rem] font-bold text-ink">
              {preview.name.trim() || <span className="text-ink-faint">{t('new')}</span>}
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

          <p className="mt-3 text-[1.15rem] font-bold tabular-nums text-ink">
            {quantity}{' '}
            <span className="text-[0.9rem] font-semibold">{preview.unit.trim() || 'pcs'}</span>
          </p>
        </aside>
      </div>

      {/* Sticky, because the form is longer than a screen and whoever is filling
          it in is standing in the storage room with a delivery note in hand. */}
      <div className="sticky bottom-0 z-10 mt-5 rounded-xl border border-line bg-surface px-5 py-4 shadow-pop">
        {state.status === 'error' ? (
          <p
            role="alert"
            className="mb-3 rounded-lg border border-danger bg-danger-soft px-3 py-2 font-semibold text-danger"
          >
            {state.message}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link href="/stock" className="btn btn-secondary">
            {tc('cancel')}
          </Link>
          <SubmitButton label={tc('save')} pendingLabel={tc('saving')} />
        </div>
      </div>
    </form>
  );
}
