import { ArrowLeft, Package } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { StocktakeForm } from '@/components/stock/StocktakeForm';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { requirePermission } from '@/lib/auth/guard';
import { Link } from '@/i18n/navigation';
import { prisma } from '@/lib/prisma';
import { ACTIVE_STOCK, getStockCategories } from '@/lib/queries';
import { getScanIndex } from '@/lib/scan-index';

export const dynamic = 'force-dynamic';

/** Sentinel for "materials with no category" — a category id is a uuid, never this. */
const NO_CATEGORY = '__none__';

/**
 * Counting the cupboard.
 *
 * Needs `stock.edit` rather than `stock.view`: there is nothing to read here
 * that the stock page does not already show, so a viewer landing on it would
 * only be able to type numbers they cannot save.
 *
 * **Scoped, and countable by scanner.** This was the whole room in one list —
 * every active material, no filter, no pagination — which is the shape of the
 * data and not the shape of the job. A stocktake is walked one shelf at a time,
 * and a screen holding seventy rows when the person is standing in front of
 * eleven of them is a screen they have to search rather than read. Worse, the
 * length is what made the count an *event*: nobody opens a stocktake of the
 * whole practice on a Tuesday morning, so the room got counted twice a year
 * instead of a shelf a week.
 *
 * So the room is offered a shelf at a time, and the scanner is offered as a way
 * to count. See `StocktakeForm` for what beeping a box does.
 */
export default async function StocktakePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ category?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission('stock.edit');

  const t = await getTranslations('stock');
  const tc = await getTranslations('common');

  // Not for the list it returns — for what it does before returning it. This is
  // where the practice's old typed-in categories become rows, and a stocktake
  // opened before the stock page would otherwise group the entire room under
  // one "Uncategorized" heading, which is the one thing this screen must not do.
  const categories = await getStockCategories();

  const { category } = await searchParams;
  const scope = category ?? '';

  const where =
    scope === NO_CATEGORY
      ? { ...ACTIVE_STOCK, categoryId: null }
      : scope
        ? { ...ACTIVE_STOCK, categoryId: scope }
        : ACTIVE_STOCK;

  // Category first so the form's groups come out in a stable order, and the
  // room can be walked the same way twice. Uncategorized materials sort last,
  // which is where a shelf that has not been named belongs.
  const [items, index] = await Promise.all([
    prisma.stockItem.findMany({
      where,
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        code: true,
        location: true,
        category: { select: { name: true } },
        quantity: true,
      },
    }),
    // Handed down with the page so a beep costs nothing and survives the wifi
    // dropping — see `getScanIndex`. A stocktake is done in the room where the
    // signal is worst.
    getScanIndex(),
  ]);

  return (
    <>
      <PageHeader
        title={t('stocktakeTitle')}
        subtitle={t('stocktakeSubtitle')}
        trail={[{ href: '/stock', label: t('title') }, { label: t('stocktakeTitle') }]}
        actions={
          <Link href="/stock" className="btn btn-secondary">
            <ArrowLeft size={18} aria-hidden />
            {tc('back')}
          </Link>
        }
      />

      {/* Which shelf. Plain links rather than a filter form: there is one thing
          to choose, the choice belongs in the address so a half-finished count
          can be reopened where it was, and a Filter button would be a second
          press for a decision already made. */}
      <nav className="mb-4 flex flex-wrap gap-2" aria-label={t('stocktakeScopeLabel')}>
        <Link
          href="/stock/stocktake"
          className={scope ? 'btn btn-ghost btn-sm' : 'btn btn-secondary btn-sm'}
          aria-current={scope ? undefined : 'page'}
        >
          {t('stocktakeWholeRoom')}
        </Link>
        {categories.map((entry) => (
          <Link
            key={entry.id}
            href={`/stock/stocktake?category=${entry.id}`}
            className={scope === entry.id ? 'btn btn-secondary btn-sm' : 'btn btn-ghost btn-sm'}
            aria-current={scope === entry.id ? 'page' : undefined}
          >
            {entry.name}
          </Link>
        ))}
        <Link
          href={`/stock/stocktake?category=${NO_CATEGORY}`}
          className={scope === NO_CATEGORY ? 'btn btn-secondary btn-sm' : 'btn btn-ghost btn-sm'}
          aria-current={scope === NO_CATEGORY ? 'page' : undefined}
        >
          {t('uncategorized')}
        </Link>
      </nav>

      {items.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Package size={40} aria-hidden />} title={t('empty')} />
        </div>
      ) : (
        <StocktakeForm
          items={items.map((item) => ({
            ...item,
            code: item.code ?? '',
            location: item.location ?? '',
            category: item.category?.name ?? '',
          }))}
          scanIndex={index}
          scope={scope}
        />
      )}
    </>
  );
}
