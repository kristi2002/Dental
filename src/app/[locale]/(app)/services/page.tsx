import { Clock, Package, Pill, Stethoscope, Trash2 } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TemplateFormDialog } from '@/components/prescriptions/TemplateFormDialog';
import { ServiceFormDialog } from '@/components/services/ServiceFormDialog';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { deletePrescriptionTemplate } from '@/lib/actions/prescriptions';
import { deleteService } from '@/lib/actions/services';
import { requirePermission } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
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
    ? await prisma.prescriptionTemplate.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] })
    : [];
  const templateCategories = [
    ...new Set(templates.map((template) => template.category).filter(Boolean)),
  ] as string[];

  const [services, stockItems] = await Promise.all([
    prisma.service.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: {
        materials: {
          select: { itemId: true, quantity: true, item: { select: { name: true, unit: true } } },
        },
      },
    }),
    prisma.stockItem.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, unit: true },
    }),
  ]);

  const categories = [...new Set(services.map((s) => s.category).filter(Boolean))] as string[];

  // Group so the catalog reads like a printed price list — minus the prices.
  const grouped = new Map<string, typeof services>();
  for (const service of services) {
    const key = service.category ?? '';
    grouped.set(key, [...(grouped.get(key) ?? []), service]);
  }

  const newDialog = canEdit ? (
    <ServiceFormDialog categories={categories} stockItems={stockItems} />
  ) : null;

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} actions={newDialog} />

      {services.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Stethoscope size={40} aria-hidden />}
            title={t('empty')}
            action={newDialog}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {[...grouped.entries()].map(([category, items]) => (
            <section key={category || 'uncategorized'}>
              <h2 className="mb-2 text-[0.9rem] font-bold tracking-wide text-ink-faint uppercase">
                {category || t('uncategorized')}
              </h2>

              <ul className="card divide-y-2 divide-line">
                {items.map((service) => (
                  <li
                    key={service.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                  >
                    <div className="min-w-0">
                      <p className="text-[1.12rem] font-bold text-ink">{service.name}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[0.95rem] text-ink-soft">
                        <Clock size={15} aria-hidden />
                        {service.durationMin} {tc('minutes')}
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
                <TemplateFormDialog categories={templateCategories} />
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
                        }}
                        categories={templateCategories}
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
