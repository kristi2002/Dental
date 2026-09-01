import { ArrowLeft } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BarcodeList } from '@/components/stock/BarcodeList';
import { EditStockForm } from '@/components/stock/EditStockForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { getStockCategories,
  ACTIVE_SUPPLIERS,
} from '@/lib/queries';

export const dynamic = 'force-dynamic';

/**
 * Correcting a material.
 *
 * The twin of `/stock/new`, and deliberately the same screen: the questions do
 * not change between recording a box and correcting one, so neither should their
 * layout. This used to be a dialog on the list — see `EditStockForm` for why it
 * stopped being one.
 *
 * `?from=catalog` is the only thing the two entry points differ by. It is a
 * word, not a path: it decides where cancelling and saving return to, and a
 * return address that arrives as a URL is a return address a crafted link can
 * choose.
 */
export default async function EditStockItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  await requirePermission('stock.edit');

  const t = await getTranslations('stock');
  const tc = await getTranslations('common');

  // On its own and first, for the reason the stock list does it: this is where
  // the practice's old typed-in category names become rows, and the material has
  // to be read after it or the select opens on a shelf that does not exist yet.
  const categories = await getStockCategories();

  const [item, products, suppliers] = await Promise.all([
    prisma.stockItem.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        code: true,
        categoryId: true,
        location: true,
        quantity: true,
        minLimit: true,
        variantName: true,
        orderQty: true,
        supplierId: true,
        // The name too, so a retired supplier can still be shown as this
        // material's own option — see `supplierOptions` below.
        supplier: { select: { name: true } },
        product: { select: { name: true } },
        // What the scanner has been taught this material is. Read here because
        // this is the only screen in the app that could ever have shown it —
        // and until it did, a code linked to the wrong material was permanent.
        barcodes: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            code: true,
            packQty: true,
            label: true,
            createdAt: true,
          },
        },
      },
    }),
    // The products already recorded, offered as autocomplete — it is what keeps
    // "Filtek Z250", "filtek z250" and "Filtek  Z250" from becoming three
    // products holding one shade each.
    prisma.stockProduct.findMany({ orderBy: { name: 'asc' }, select: { name: true } }),
    prisma.supplier.findMany({
      where: ACTIVE_SUPPLIERS,
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  if (!item) notFound();

  /**
   * The active suppliers, plus this material's own if it has been retired.
   *
   * A select whose value matches no option shows the *first* one, which here is
   * "none" — so opening this form to change a minimum and pressing save would
   * quietly detach the material from whoever the practice buys it from. The
   * list is filtered so a retired supplier stops being offered to *other*
   * materials; the one already named by this one has to stay visible, which is
   * the same rule the laboratory list in `WorkLinesField` follows.
   *
   * Done here rather than in `StockFields`, which is handed a list and should
   * not have to know that some of it is history.
   */
  const supplierOptions =
    item.supplierId && !suppliers.some((supplier) => supplier.id === item.supplierId)
      ? [...suppliers, { id: item.supplierId, name: item.supplier?.name ?? '' }]
      : suppliers;

  const { from: rawFrom } = await searchParams;
  const from = rawFrom === 'catalog' ? 'catalog' : 'list';
  const backHref = from === 'catalog' ? '/stock/catalog' : '/stock';

  return (
    <>
      <PageHeader
        title={t('edit')}
        subtitle={t('editSubtitle', { name: item.name })}
        trail={[
          { href: '/stock', label: t('title') },
          // The catalogue is a screen under the storage room, so a correction
          // opened from it is three deep rather than two.
          ...(from === 'catalog' ? [{ href: '/stock/catalog', label: t('catalog') }] : []),
          { label: item.name },
        ]}
        actions={
          <Link href={backHref} className="btn btn-secondary">
            <ArrowLeft size={18} aria-hidden />
            {tc('back')}
          </Link>
        }
      />

      <EditStockForm
        item={{
          id: item.id,
          name: item.name,
          code: item.code ?? '',
          categoryId: item.categoryId ?? '',
          location: item.location ?? '',
          productName: item.product?.name ?? '',
          variantName: item.variantName ?? '',
          quantity: item.quantity,
          minLimit: item.minLimit,
          // Blank rather than zero: "no stated quantity" is a real answer the
          // reorder list projects around, and zero would mean "order nothing".
          orderQty: item.orderQty === null ? '' : String(item.orderQty),
          supplierId: item.supplierId ?? '',
        }}
        categories={categories}
        products={products.map((row) => row.name)}
        suppliers={supplierOptions}
        from={from}
      />

      {/* Below the save bar, deliberately. These rows are not part of what
          **Save** is collecting — unlinking is immediate — and putting them
          inside the form would say the opposite. It would also be invalid
          markup: the unlink verb is a form of its own, and forms do not nest. */}
      <BarcodeList
        barcodes={item.barcodes.map((barcode) => ({
          id: barcode.id,
          code: barcode.code,
          packQty: barcode.packQty,
          label: barcode.label ?? '',
          createdAt: barcode.createdAt,
        }))}
      />
    </>
  );
}
