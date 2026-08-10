import { Clock, Stethoscope, Trash2 } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ServiceFormDialog } from '@/components/services/ServiceFormDialog';
import { ActionForm } from '@/components/ui/ActionForm';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { deleteService } from '@/lib/actions/services';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('services');
  const tc = await getTranslations('common');

  const services = await prisma.service.findMany({
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });

  const categories = [...new Set(services.map((s) => s.category).filter(Boolean))] as string[];

  // Group so the catalog reads like a printed price list — minus the prices.
  const grouped = new Map<string, typeof services>();
  for (const service of services) {
    const key = service.category ?? '';
    grouped.set(key, [...(grouped.get(key) ?? []), service]);
  }

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={<ServiceFormDialog categories={categories} />}
      />

      {services.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Stethoscope size={40} aria-hidden />}
            title={t('empty')}
            action={<ServiceFormDialog categories={categories} />}
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
                    </div>

                    <div className="flex items-center gap-2">
                      <ServiceFormDialog
                        service={{
                          id: service.id,
                          name: service.name,
                          category: service.category ?? '',
                          durationMin: service.durationMin,
                        }}
                        categories={categories}
                        compact
                      />
                      <ActionForm
                        action={deleteService}
                        values={{ id: service.id }}
                        confirmMessage={tc('confirmDelete')}
                      >
                        <button type="submit" className="btn btn-danger btn-sm" title={tc('delete')}>
                          <Trash2 size={17} aria-hidden />
                          <span className="sr-only">{tc('delete')}</span>
                        </button>
                      </ActionForm>
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
