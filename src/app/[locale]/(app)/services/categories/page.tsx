import { ArrowLeft, Plus, Tags, Trash2 } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ServiceCategoryFormDialog } from '@/components/services/CategoryFormDialog';
import { ActionForm } from '@/components/ui/ActionForm';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { deleteServiceCategory } from '@/lib/actions/services';
import { requirePermission } from '@/lib/auth/guard';
import { Link } from '@/i18n/navigation';
import { prisma } from '@/lib/prisma';
import { getServiceCategories } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/**
 * The headings the catalogue is filed by.
 *
 * Named here, once, and picked from everywhere else — the service form offers
 * this list and nothing but this list, which is what keeps one department from
 * becoming three spellings of itself. Two levels: a department, and the
 * subdivisions inside it.
 *
 * Needs `service.edit` rather than `service.view`, like the shelves screen in
 * stock: the names are already on every treatment on the services page, so a
 * viewer landing here would only be able to read a list they can neither add to
 * nor change.
 */
export default async function ServiceCategoriesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('service.edit');
  const canDelete = user.permissions.includes('service.delete');

  const t = await getTranslations('serviceCategories');
  const tc = await getTranslations('common');
  const tservices = await getTranslations('services');

  // On its own, and first: this is where the practice's old typed-in category
  // names become rows, and the treatments have to be counted *after* that rather
  // than beside it — otherwise the first render of this screen reports every
  // heading as empty.
  const categories = await getServiceCategories();
  const departments = categories.filter((category) => category.parentId === null);
  const childrenOf = new Map<string, typeof categories>();
  for (const category of categories) {
    if (!category.parentId) continue;
    childrenOf.set(category.parentId, [...(childrenOf.get(category.parentId) ?? []), category]);
  }

  const filed = await prisma.service.findMany({
    where: { categoryId: { not: null } },
    select: { categoryId: true, category: { select: { parentId: true } } },
  });

  // How many treatments each heading holds. A department counts everything
  // printed under it, its subcategories included — the number is there to answer
  // "what does dropping this heading affect", and dropping a department takes
  // its subcategories with it.
  const servicesPerCategory = new Map<string, number>();
  for (const service of filed) {
    for (const id of [service.categoryId, service.category?.parentId]) {
      if (id) servicesPerCategory.set(id, (servicesPerCategory.get(id) ?? 0) + 1);
    }
  }

  const newLink = (
    <Link href="/services/categories/new" className="btn btn-primary">
      <Plus size={18} aria-hidden />
      {t('new')}
    </Link>
  );

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        trail={[{ href: '/services', label: tservices('title') }, { label: t('title') }]}
        actions={
          <>
            <Link href="/services" className="btn btn-secondary">
              <ArrowLeft size={18} aria-hidden />
              {tc('back')}
            </Link>
            {newLink}
          </>
        }
      />

      {departments.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Tags size={40} aria-hidden />}
            title={t('empty')}
            action={newLink}
            explain
          />
        </div>
      ) : (
        <ul className="card divide-y divide-line">
          {departments.map((department) => {
            const children = childrenOf.get(department.id) ?? [];

            return (
              <li key={department.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <p className="text-body font-bold text-ink">{department.name}</p>
                    <p className="text-meta text-ink-soft">
                      {t('serviceCount', {
                        count: servicesPerCategory.get(department.id) ?? 0,
                      })}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Adding a subdivision belongs on the department it
                        subdivides, not in a form that asks which one. */}
                    <Link
                      href={`/services/categories/new?parent=${department.id}`}
                      className="btn btn-secondary btn-sm"
                      title={t('newChild')}
                    >
                      <Plus size={17} aria-hidden />
                      <span className="sr-only">{t('newChild')}</span>
                    </Link>
                    <ServiceCategoryFormDialog
                      category={{
                        id: department.id,
                        name: department.name,
                        parentId: '',
                        hasChildren: children.length > 0,
                      }}
                      departments={departments}
                    />
                    {canDelete ? (
                      <ActionForm
                        action={deleteServiceCategory}
                        values={{ id: department.id }}
                        confirmMessage={
                          children.length > 0
                            ? t('confirmDeleteParent', { count: children.length })
                            : t('confirmDelete')
                        }
                      >
                        <button type="submit" className="btn btn-danger btn-sm" title={tc('delete')}>
                          <Trash2 size={17} aria-hidden />
                          <span className="sr-only">{tc('delete')}</span>
                        </button>
                      </ActionForm>
                    ) : null}
                  </div>
                </div>

                {children.length > 0 ? (
                  <ul className="mt-2 space-y-1.5 border-l-2 border-line pl-4">
                    {children.map((child) => (
                      <li
                        key={child.id}
                        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-ink">{child.name}</p>
                          <p className="text-meta text-ink-soft">
                            {t('serviceCount', { count: servicesPerCategory.get(child.id) ?? 0 })}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <ServiceCategoryFormDialog
                            category={{
                              id: child.id,
                              name: child.name,
                              parentId: department.id,
                              hasChildren: false,
                            }}
                            departments={departments}
                          />
                          {canDelete ? (
                            <ActionForm
                              action={deleteServiceCategory}
                              values={{ id: child.id }}
                              confirmMessage={t('confirmDelete')}
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
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
