import { Activity, Clock, Package, Pill, Stethoscope, Trash2 } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TemplateFormDialog } from '@/components/prescriptions/TemplateFormDialog';
import { ServiceFormDialog } from '@/components/services/ServiceFormDialog';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterBar } from '@/components/ui/FilterBar';
import { PageHeader } from '@/components/ui/PageHeader';
import { deletePrescriptionTemplate } from '@/lib/actions/prescriptions';
import { deleteService } from '@/lib/actions/services';
import { requirePermission } from '@/lib/auth/guard';
import { byDepartment } from '@/lib/catalog';
import { addMonths, today } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { ACTIVE_STOCK } from '@/lib/queries';
import { cn, matches } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Sentinel for "this service has no category" — a real category can never be empty. */
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
  const canSeeTemplates = user.permissions.includes('prescription.view');
  const canEditTemplates = user.permissions.includes('prescription.edit');

  const t = await getTranslations('services');
  const tp = await getTranslations('prescriptions');
  const tc = await getTranslations('common');

  const templates = canSeeTemplates
    ? await prisma.prescriptionTemplate.findMany({
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
        include: { services: { select: { serviceId: true, service: { select: { name: true } } } } },
      })
    : [];
  const templateCategories = [
    ...new Set(templates.map((template) => template.category).filter(Boolean)),
  ] as string[];

  // Six months, matching the statistics page, so the two never disagree about
  // what "recently" means.
  const since = addMonths(today(), -6);

  const [allServices, stockItems, performed] = await Promise.all([
    prisma.service.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: {
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

  // Derived from the whole catalog, never from the filtered view: the dropdown
  // has to keep offering the category you are about to switch to, and the new/edit
  // dialogs suggest from the full set.
  const categories = [...new Set(allServices.map((s) => s.category).filter(Boolean))] as string[];

  const { q, category, materials } = await searchParams;
  const query = (q ?? '').trim();
  const categoryFilter = category ?? '';
  const materialsFilter = materials === 'with' || materials === 'none' ? materials : '';

  const services = allServices.filter((service) => {
    if (query && !matches(service.name, query) && !matches(service.category ?? '', query)) {
      return false;
    }
    if (categoryFilter === NO_CATEGORY) {
      if (service.category) return false;
    } else if (categoryFilter && service.category !== categoryFilter) {
      return false;
    }
    if (materialsFilter === 'with' && service.materials.length === 0) return false;
    if (materialsFilter === 'none' && service.materials.length > 0) return false;
    return true;
  });

  const isFiltered = Boolean(query || categoryFilter || materialsFilter);

  // Grouped by department, so the catalog reads like a printed price list —
  // minus the prices. The same split the booking and visit forms use.
  const grouped = byDepartment(services.map((s) => ({ ...s, category: s.category ?? '' })));

  // The whole catalogue, not the filtered view: a template is tied to a
  // treatment regardless of what the list above is currently narrowed to.
  const serviceOptions = allServices.map((service) => ({
    id: service.id,
    name: service.name,
    category: service.category ?? '',
    durationMin: service.durationMin,
    materialCount: service.materials.length,
  }));

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
              options: [
                ...categories.map((value) => ({ value, label: value })),
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
                      <p className="text-[1.12rem] font-bold text-ink">{service.name}</p>
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
                            category: service.category ?? '',
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

      {/* The other catalog the clinic maintains: standard wording for the few
          things a dentist prescribes every week. */}
      {canSeeTemplates ? (
        <Card className="mt-8">
          <CardHeader
            title={tp('templatesTitle')}
            subtitle={tp('templatesSubtitle')}
            icon={<Pill size={22} aria-hidden />}
            action={
              canEditTemplates ? (
                <TemplateFormDialog
                  categories={templateCategories}
                  services={serviceOptions}
                />
              ) : null
            }
          />

          {templates.length === 0 ? (
            <EmptyState icon={<Pill size={36} aria-hidden />} title={tp('templatesEmpty')} />
          ) : (
            <ul className="divide-y-2 divide-line">
              {templates.map((template) => (
                <li
                  key={template.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-5 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-[1.08rem] font-bold text-ink">{template.name}</span>
                      {template.category ? <Badge>{template.category}</Badge> : null}
                      {/* What this wording follows. Without it on the row, the
                          only way to know why a template is suggested after an
                          extraction is to open it. */}
                      {template.services.map((link) => (
                        <Badge key={link.serviceId} tone="brand">
                          {link.service.name}
                        </Badge>
                      ))}
                    </p>
                    <p className="mt-1 text-[0.95rem] whitespace-pre-line text-ink-soft">
                      {template.body}
                    </p>
                  </div>

                  {canEditTemplates ? (
                    <div className="flex items-center gap-2">
                      <TemplateFormDialog
                        template={{
                          id: template.id,
                          name: template.name,
                          category: template.category ?? '',
                          body: template.body,
                          serviceIds: template.services.map((link) => link.serviceId),
                        }}
                        categories={templateCategories}
                        services={serviceOptions}
                      />
                      <ActionForm
                        action={deletePrescriptionTemplate}
                        values={{ id: template.id }}
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
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </>
  );
}
