import { Activity, Clock, Package, Stethoscope, Trash2 } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ServiceFormDialog } from '@/components/services/ServiceFormDialog';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar } from '@/components/ui/FilterBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { deleteService } from '@/lib/actions/services';
import { requirePermission } from '@/lib/auth/guard';
import { byDepartment, departmentOf } from '@/lib/catalog';
import { addMonths, today } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { ACTIVE_STOCK, getServiceCategories } from '@/lib/queries';
import { cn, matches } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Sentinel for "this service has no category" — a category id is a uuid, never this. */
const NO_CATEGORY = '__none__';

export default async function ServicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; category?: string; materials?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('service.view');
  const canEdit = user.permissions.includes('service.edit');
  const canDelete = user.permissions.includes('service.delete');

  const t = await getTranslations('services');
  const tc = await getTranslations('common');

  // On its own, and first: the load that ships this feature is also the one that
  // moves the practice's old typed-in categories onto real rows, and the
  // treatments have to be read *after* that rather than beside it — otherwise
  // the first render of the catalogue files every last one under
  // "Uncategorized".
  const categories = await getServiceCategories();
  const departments = categories.filter((category) => category.parentId === null);
  const childrenOf = new Map<string, typeof categories>();
  for (const category of categories) {
    if (!category.parentId) continue;
    childrenOf.set(category.parentId, [...(childrenOf.get(category.parentId) ?? []), category]);
  }

  // Six months, matching the statistics page, so the two never disagree about
  // what "recently" means.
  const since = addMonths(today(), -6);

  const [allServices, stockItems, performed] = await Promise.all([
    prisma.service.findMany({
      orderBy: { name: 'asc' },
      include: {
        category: { select: { id: true, name: true, parent: { select: { id: true, name: true } } } },
        materials: {
          select: { itemId: true, quantity: true, item: { select: { name: true, unit: true } } },
        },
      },
    }),
    // A retired material must not be offered as something a new treatment
    // consumes; existing bills of materials that name one keep working.
    prisma.stockItem.findMany({
      where: ACTIVE_STOCK,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, unit: true, packSize: true },
    }),
    // How often each treatment was actually performed. The catalogue is where an
    // owner decides what to keep, what to reprice and what to stop offering, and
    // it could not see a single consequence of any of those decisions — the
    // question needed a join that did not exist until `VisitService` did.
    prisma.visitService.groupBy({
      by: ['serviceId'],
      where: { serviceId: { not: null }, visit: { visitDate: { gte: since } } },
      _count: { _all: true },
    }),
  ]);

  const timesPerformed = new Map(
    performed.map((row) => [row.serviceId!, row._count._all]),
  );

  const { q, category, materials } = await searchParams;
  const query = (q ?? '').trim();
  const categoryFilter = category ?? '';
  const materialsFilter = materials === 'with' || materials === 'none' ? materials : '';

  const services = allServices.filter((service) => {
    if (
      query &&
      !matches(service.name, query) &&
      !matches(service.category?.name ?? '', query) &&
      !matches(service.category?.parent?.name ?? '', query)
    ) {
      return false;
    }
    if (categoryFilter === NO_CATEGORY) {
      if (service.categoryId) return false;
    } else if (
      categoryFilter &&
      // Filtering by a department means the whole department, subcategories
      // included — the alternative is a heading that hides most of its own list.
      service.categoryId !== categoryFilter &&
      service.category?.parent?.id !== categoryFilter
    ) {
      return false;
    }
    if (materialsFilter === 'with' && service.materials.length === 0) return false;
    if (materialsFilter === 'none' && service.materials.length > 0) return false;
    return true;
  });

  const isFiltered = Boolean(query || categoryFilter || materialsFilter);

  // Grouped by department, so the catalog reads like a printed price list —
  // minus the prices. The same split the booking and visit forms use, which is
  // why a subcategory does not get its own heading here: it is a label on the
  // row, inside the department it belongs to.
  const grouped = byDepartment(
    services
      .map((s) => ({
        ...s,
        category: departmentOf(s.category),
        subcategory: s.category?.parent ? s.category.name : '',
        // The form asks the two levels separately, so a treatment filed against
        // a subcategory has to hand back the department above it as well.
        departmentId: s.category?.parent?.id ?? s.category?.id ?? '',
        subcategoryId: s.category?.parent ? s.category.id : '',
      }))
      .sort(
        (a, b) =>
          a.category.localeCompare(b.category) ||
          a.subcategory.localeCompare(b.subcategory) ||
          a.name.localeCompare(b.name),
      ),
  );

  const newDialog = canEdit ? (
    <ServiceFormDialog categories={categories} stockItems={stockItems} />
  ) : null;

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={newDialog}
        trail={[{ label: t('title') }]}
      />

      {/* Nothing to narrow down until the catalog exists. */}
      {allServices.length > 0 ? (
        <FilterBar
          basePath="/services"
          label={tc('filters')}
          values={{ q: query, category: categoryFilter, materials: materialsFilter }}
          chips={{
            name: 'materials',
            label: t('filterMaterialsLabel'),
            options: [
              { value: '', label: tc('all') },
              { value: 'with', label: t('filterWithMaterials') },
              { value: 'none', label: t('filterNoMaterials') },
            ],
          }}
          search={{
            name: 'q',
            label: tc('search'),
            placeholder: t('searchPlaceholder'),
          }}
          selects={[
            {
              name: 'category',
              label: t('category'),
              anyLabel: t('anyCategory'),
              // Departments each followed by their own subcategories, indented,
              // because a flat alphabetical list of both levels reads as one
              // level with some odd names in it.
              options: [
                ...departments.flatMap((department) => [
                  { value: department.id, label: department.name },
                  ...(childrenOf.get(department.id) ?? []).map((child) => ({
                    value: child.id,
                    // Figure spaces, not ordinary ones: a `<select>` collapses
                    // leading whitespace inside an option and the indent vanishes.
                    label: `\u2007\u2007${child.name}`,
                  })),
                ]),
                { value: NO_CATEGORY, label: t('uncategorized') },
              ],
            },
          ]}
          submitLabel={tc('filter')}
          clearLabel={tc('clearFilters')}
          summary={t('showing', { count: services.length, total: allServices.length })}
        />
      ) : null}

      {services.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Stethoscope size={40} aria-hidden />}
            title={isFiltered ? t('emptyFiltered') : t('empty')}
            action={isFiltered ? null : newDialog}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ department, items }) => (
            <section key={department || 'uncategorized'}>
              <h2 className="mb-2 text-[0.9rem] font-bold tracking-wide text-ink-faint uppercase">
                {department || t('uncategorized')}
              </h2>

              <ul className="card divide-y-2 divide-line">
                {items.map((service) => (
                  <li
                    key={service.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="text-[1.12rem] font-bold text-ink">{service.name}</span>
                        {/* Which part of the department this sits in. On the row
                            rather than as its own heading, so the catalogue
                            still reads as one list per department. */}
                        {service.subcategory ? <Badge>{service.subcategory}</Badge> : null}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.95rem] text-ink-soft">
                        <span className="flex items-center gap-1.5">
                          <Clock size={15} aria-hidden />
                          {service.durationMin} {tc('minutes')}
                        </span>
                        {/* Never performed is as much a fact about a catalogue
                            entry as performed forty times, and the more useful
                            one — so it says so rather than showing nothing. */}
                        <span
                          className={cn(
                            'flex items-center gap-1.5',
                            (timesPerformed.get(service.id) ?? 0) === 0 && 'text-ink-faint',
                          )}
                        >
                          <Activity size={15} aria-hidden />
                          {timesPerformed.get(service.id)
                            ? t('performedCount', { count: timesPerformed.get(service.id)! })
                            : t('performedNever')}
                        </span>
                      </p>

                      {/* What this treatment eats, and therefore what recording
                          it will take off the shelf. */}
                      {service.materials.length > 0 ? (
                        <p className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Package
                            size={15}
                            aria-hidden
                            className="text-brand"
                            aria-label={t('materials')}
                          />
                          {service.materials.map((material) => (
                            <Badge key={material.itemId} tone="brand">
                              {material.item.name} ×{material.quantity} {material.item.unit}
                            </Badge>
                          ))}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-2">
                      {canEdit ? (
                        <ServiceFormDialog
                          service={{
                            id: service.id,
                            name: service.name,
                            departmentId: service.departmentId,
                            subcategoryId: service.subcategoryId,
                            durationMin: service.durationMin,
                            materials: service.materials.map(({ itemId, quantity }) => ({
                              itemId,
                              quantity,
                            })),
                          }}
                          categories={categories}
                          stockItems={stockItems}
                          compact
                        />
                      ) : null}
                      {canDelete ? (
                        <ActionForm
                          action={deleteService}
                          values={{ id: service.id }}
                          confirmMessage={tc('confirmDelete')}
                        >
                          <button
                            type="submit"
                            className="btn btn-danger btn-sm"
                            title={tc('delete')}
                          >
                            <Trash2 size={17} aria-hidden />
                            <span className="sr-only">{tc('delete')}</span>
                          </button>
                        </ActionForm>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
