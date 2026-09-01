import { Pill, Plus, Trash2 } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { PrescriptionDialog } from '@/components/prescriptions/PrescriptionDialog';
import { TemplateFormDialog } from '@/components/prescriptions/TemplateFormDialog';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ArchivedList } from '@/components/ui/ArchivedList';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { deletePrescriptionTemplate,
  restorePrescriptionTemplate,
} from '@/lib/actions/prescriptions';
import { requirePermission } from '@/lib/auth/guard';
import { today } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { getServiceOptions,
  ACTIVE_TEMPLATES,
} from '@/lib/queries';

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
  const format = await getFormatter();

  const [templates, archivedTemplates, services] = await Promise.all([
    prisma.prescriptionTemplate.findMany({
      where: ACTIVE_TEMPLATES,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
      include: { services: { select: { serviceId: true, service: { select: { name: true } } } } },
    }),
    prisma.prescriptionTemplate.findMany({
      where: { archivedAt: { not: null } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, archivedAt: true },
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

  /**
   * Writing one, from the catalogue of wording it is written out of.
   *
   * Secondary, and left of the primary: this page's own job is the standard
   * text, and “New template” stays the action it leads with. But the nav item a
   * dentist opens is *Prescriptions*, and until now landing here meant reading a
   * list of the wording without being able to use any of it — the way to
   * actually prescribe was back out through the patient search. The dialog asks
   * for the patient itself, so the wording on this screen is one press from the
   * person it is for.
   */
  const writeButton = canEdit ? (
    <PrescriptionDialog
      templates={templates.map((template) => ({
        id: template.id,
        name: template.name,
        category: template.category ?? '',
        body: template.body,
        serviceIds: template.services.map((link) => link.serviceId),
      }))}
      todayLabel={format.dateTime(today(), { day: 'numeric', month: 'long', year: 'numeric' })}
      canManageTemplates={canEdit}
      triggerClassName="btn btn-secondary"
    />
  ) : null;

  return (
    <>
      <PageHeader
        title={t('templatesTitle')}
        subtitle={t('templatesSubtitle')}
        trail={[{ label: t('templatesTitle') }]}
        actions={
          <>
            {writeButton}
            {newLink}
          </>
        }
      />

      {templates.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Pill size={40} aria-hidden />}
            title={t('templatesEmpty')}
            action={newLink}
            explain
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
                  <span className="text-lead font-bold text-ink">{template.name}</span>
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
                <p className="mt-1 text-body whitespace-pre-line text-ink-soft">
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
                    confirmMessage={tc('confirmRetire')}
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

      <div className="mt-6">
        <ArchivedList
          rows={archivedTemplates}
          action={restorePrescriptionTemplate}
          title={tc('archivedTemplates')}
        />
      </div>
    </>
  );
}
