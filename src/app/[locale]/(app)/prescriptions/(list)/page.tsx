import { Pill, Plus, Trash2 } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TemplateFormDialog } from '@/components/prescriptions/TemplateFormDialog';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { deletePrescriptionTemplate } from '@/lib/actions/prescriptions';
import { requirePermission } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { getServiceOptions } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/**
 * The other catalogue the clinic maintains: standard wording for the few things
 * a dentist prescribes every week.
 *
 * A section of its own rather than a list filed under the services catalogue.
 * The tie to a treatment is real — after this extraction, offer this wording
 * first — but prescribing is its own part of the day, and the issued
 * prescription a patient walks out with already lives at `/prescriptions/:id`.
 *
 * Opens on `prescription.view`, not `.edit`: the wording is not printed anywhere
 * else, so a dentist who may issue a prescription but not change the standard
 * text still has a reason to read it.
 */
export default async function PrescriptionsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('prescription.view');
  const canEdit = user.permissions.includes('prescription.edit');

  const t = await getTranslations('prescriptions');
  const tc = await getTranslations('common');

  const [templates, services] = await Promise.all([
    prisma.prescriptionTemplate.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: { services: { select: { serviceId: true, service: { select: { name: true } } } } },
    }),
    // The whole catalogue: a template is tied to a treatment, and the form has
    // to offer every one of them grouped by department.
    getServiceOptions(),
  ]);

  const categories = [
    ...new Set(templates.map((template) => template.category).filter(Boolean)),
  ] as string[];

  const newLink = canEdit ? (
    <Link href="/prescriptions/templates/new" className="btn btn-primary">
      <Plus size={18} aria-hidden />
      {t('newTemplate')}
    </Link>
  ) : null;

  return (
    <>
      <PageHeader
        title={t('templatesTitle')}
        subtitle={t('templatesSubtitle')}
        trail={[{ label: t('templatesTitle') }]}
        actions={newLink}
      />

      {templates.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Pill size={40} aria-hidden />}
            title={t('templatesEmpty')}
            action={newLink}
          />
        </div>
      ) : (
        <ul className="card divide-y-2 divide-line">
          {templates.map((template) => (
            <li
              key={template.id}
              className="flex flex-wrap items-start justify-between gap-3 px-5 py-4"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-[1.08rem] font-bold text-ink">{template.name}</span>
                  {template.category ? <Badge>{template.category}</Badge> : null}
                  {/* What this wording follows. Without it on the row, the only
                      way to know why a template is suggested after an extraction
                      is to open it. */}
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

              {canEdit ? (
                <div className="flex items-center gap-2">
                  <TemplateFormDialog
                    template={{
                      id: template.id,
                      name: template.name,
                      category: template.category ?? '',
                      body: template.body,
                      serviceIds: template.services.map((link) => link.serviceId),
                    }}
                    categories={categories}
                    services={services}
                  />
                  <ActionForm
                    action={deletePrescriptionTemplate}
                    values={{ id: template.id }}
                    confirmMessage={tc('confirmDelete')}
                  >
                    <button type="submit" className="btn btn-danger btn-sm" title={tc('delete')}>
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
    </>
  );
}
