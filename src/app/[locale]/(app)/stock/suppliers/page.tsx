import { ArrowLeft, Plus, Trash2, Truck } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SupplierFormDialog } from '@/components/stock/SupplierFormDialog';
import { ActionForm } from '@/components/ui/ActionForm';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { deleteSupplier } from '@/lib/actions/stock';
import { requirePermission } from '@/lib/auth/guard';
import { Link } from '@/i18n/navigation';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Who to buy it from.
 *
 * Enough to place an order and no more — there is no purchasing or invoicing in
 * this app by design, so a supplier is a name, a way to reach them, and the
 * count of materials that point at them.
 *
 * Needs `stock.edit`, like the categories screen beside it: the supplier's name
 * is already on every material on the stock page, so there is nothing here to
 * read that a viewer cannot already see.
 */
export default async function SuppliersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('stock.edit');
  const canDelete = user.permissions.includes('stock.delete');

  const t = await getTranslations('suppliers');
  const tc = await getTranslations('common');
  const tstock = await getTranslations('stock');

  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { items: true } } },
  });

  const newLink = (
    <Link href="/stock/suppliers/new" className="btn btn-primary">
      <Plus size={18} aria-hidden />
      {t('new')}
    </Link>
  );

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        trail={[{ href: '/stock', label: tstock('title') }, { label: t('title') }]}
        actions={
          <>
            <Link href="/stock" className="btn btn-secondary">
              <ArrowLeft size={18} aria-hidden />
              {tc('back')}
            </Link>
            {newLink}
          </>
        }
      />

      {suppliers.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Truck size={40} aria-hidden />}
            title={t('empty')}
            action={newLink}
            explain
          />
        </div>
      ) : (
        <ul className="card divide-y divide-line">
          {suppliers.map((supplier) => (
            <li
              key={supplier.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4"
            >
              <div className="min-w-0">
                <p className="text-body font-bold text-ink">{supplier.name}</p>
                <p className="text-meta text-ink-soft">
                  {[supplier.phone, supplier.email].filter(Boolean).join(' · ') || t('noContact')}
                  {' · '}
                  {t('itemCount', { count: supplier._count.items })}
                </p>
                {supplier.notes ? (
                  <p className="mt-1 text-meta whitespace-pre-line text-ink-soft">
                    {supplier.notes}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <SupplierFormDialog
                  supplier={{
                    id: supplier.id,
                    name: supplier.name,
                    phone: supplier.phone ?? '',
                    email: supplier.email ?? '',
                    notes: supplier.notes ?? '',
                  }}
                />
                {canDelete ? (
                  <ActionForm
                    action={deleteSupplier}
                    values={{ id: supplier.id }}
                    confirmMessage={tc('confirmDelete')}
                  >
                    <button type="submit" className="btn btn-danger btn-sm" title={tc('delete')}>
                      <Trash2 size={17} aria-hidden />
                      <span className="sr-only">{tc('delete')}</span>
                    </button>
                  </ActionForm>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
