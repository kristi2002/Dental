import { ArrowLeft, FlaskConical, Mail, MapPin, Phone, User } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { LabOrderSheet, type LabOrderValues } from '@/components/lab/LabOrderSheet';
import { PrintButton } from '@/components/prescriptions/PrintButton';
import { Badge } from '@/components/ui/Badge';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { toDateKey } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { getClinicProfile, getServiceOptions } from '@/lib/queries';
import { matches } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const STATUS_TONE: Record<string, 'brand' | 'ok' | 'neutral'> = {
  SENT: 'brand',
  RECEIVED: 'ok',
  FITTED: 'neutral',
  CANCELLED: 'neutral',
};

/**
 * The order sheet — one lab case, opened up.
 *
 * A case is a row on two lists and, until now, a four-field dialog. That is
 * enough to record that a crown was sent somewhere, and not enough to *order*
 * one: which teeth and which faces of them, what else is on the same docket,
 * when the try-in is, and what the patient is told at fitting. All of that is
 * here, and it is what gets printed and handed over.
 */
export default async function LabOrderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('plan.view');
  const canEdit = user.permissions.includes('plan.edit');

  const t = await getTranslations('lab');
  const tc = await getTranslations('common');
  const format = await getFormatter();

  const [labCase, services, profile] = await Promise.all([
    prisma.labCase.findUnique({
      where: { id },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            address: true,
          },
        },
        items: { orderBy: { position: 'asc' } },
      },
    }),
    getServiceOptions(),
    getClinicProfile(),
  ]);
  if (!labCase) notFound();

  // The trail this case has already left. `AuditLog` has recorded every lab
  // write since the feature shipped, so the history tab needed no new table —
  // only a filter.
  const history = await prisma.auditLog.findMany({
    where: { entity: 'lab', entityId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, action: true, summary: true, actorName: true, createdAt: true },
  });

  const values: LabOrderValues = {
    id: labCase.id,
    labName: labCase.labName,
    kind: labCase.kind,
    teeth: labCase.teeth ?? '',
    status: labCase.status,
    sentAt: toDateKey(labCase.sentAt),
    dueAt: labCase.dueAt ? toDateKey(labCase.dueAt) : '',
    receivedAt: labCase.receivedAt ? toDateKey(labCase.receivedAt) : '',
    tryInAt: labCase.tryInAt ? toDateKey(labCase.tryInAt) : '',
    deliveryFrom: labCase.deliveryFrom ?? '',
    deliveryTo: labCase.deliveryTo ?? '',
    careInstructions: labCase.careInstructions ?? '',
    notes: labCase.notes ?? '',
    items: labCase.items.map((item) => ({
      id: item.id,
      name: item.name,
      serviceId: item.serviceId ?? '',
      notes: item.notes ?? '',
    })),
  };

  // "Recommended" is the catalogue read through what this case actually is — a
  // case called "zirconia crown" surfaces the crown services rather than all
  // forty. Nothing clever, but it beats scrolling a select on every order.
  const chosen = new Set(labCase.items.map((item) => item.serviceId).filter(Boolean));
  const suggestions = services
    .filter(
      (service) =>
        !chosen.has(service.id) &&
        (matches(service.name, labCase.kind) ||
          (service.category !== '' && matches(labCase.kind, service.category))),
    )
    .slice(0, 4)
    .map((service) => ({ id: service.id, name: service.name }));

  const patientName = `${labCase.patient.lastName} ${labCase.patient.firstName}`;

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <Link href="/lab" className="btn btn-ghost btn-sm">
          <ArrowLeft size={18} aria-hidden />
          {t('title')}
        </Link>
      </div>

      <header className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <span className="text-brand">
              <FlaskConical size={26} aria-hidden />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-ink sm:text-3xl">{t('orderTitle')}</h1>
              <p className="text-[1.02rem] text-ink-soft">{labCase.kind}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={STATUS_TONE[labCase.status] ?? 'neutral'}>
              {t(`status_${labCase.status}`)}
            </Badge>
            <p className="text-[0.95rem] font-semibold text-ink-soft tabular-nums">
              {format.dateTime(labCase.createdAt, {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        </div>

        <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <Detail icon={<User size={16} aria-hidden />} label={t('patient')}>
            <Link href={`/patients/${labCase.patient.id}`} className="font-bold">
              {patientName}
            </Link>
          </Detail>
          <Detail icon={<Phone size={16} aria-hidden />} label={t('phone')}>
            <a href={`tel:${labCase.patient.phone}`}>{labCase.patient.phone}</a>
          </Detail>
          <Detail icon={<Mail size={16} aria-hidden />} label={t('email')}>
            {labCase.patient.email ? (
              <a href={`mailto:${labCase.patient.email}`}>{labCase.patient.email}</a>
            ) : (
              <span className="text-ink-faint">{tc('none')}</span>
            )}
          </Detail>
          <Detail icon={<MapPin size={16} aria-hidden />} label={t('address')}>
            {labCase.patient.address || (
              <span className="text-ink-faint">{tc('none')}</span>
            )}
          </Detail>
        </dl>
      </header>

      <LabOrderSheet
        values={values}
        services={services.map((service) => ({ id: service.id, name: service.name }))}
        suggestions={suggestions}
        numbering={profile.toothNumbering}
        canEdit={canEdit}
        history={
          history.length === 0 ? (
            <p className="py-6 text-center text-ink-faint">{t('noHistory')}</p>
          ) : (
            <ul className="space-y-3">
              {history.map((entry) => (
                <li key={entry.id} className="border-l-2 border-line pl-3">
                  <p className="font-semibold text-ink">{entry.summary}</p>
                  <p className="text-[0.9rem] text-ink-soft">
                    {entry.actorName} ·{' '}
                    <span className="tabular-nums">
                      {format.dateTime(entry.createdAt, {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )
        }
      />

      <div className="flex flex-wrap justify-end gap-3 print:hidden">
        <Link href={`/lab/${labCase.id}/sheet`} className="btn btn-secondary">
          {t('printOrder')}
        </Link>
        <PrintButton label={t('printReport')} />
      </div>
    </div>
  );
}

function Detail({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[0.85rem] font-bold text-ink-faint uppercase">
        <span className="text-brand">{icon}</span>
        {label}
      </dt>
      <dd className="mt-0.5 text-[1.02rem] text-ink">{children}</dd>
    </div>
  );
}
