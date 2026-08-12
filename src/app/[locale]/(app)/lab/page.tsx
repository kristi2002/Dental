import { FlaskConical, TriangleAlert, Users } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AppointmentFormDialog } from '@/components/appointments/AppointmentFormDialog';
import { LabCaseList } from '@/components/lab/LabCaseList';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { toDateKey, today } from '@/lib/dates';
import { LAB_STATUSES, isLabStatus } from '@/lib/lab';
import { prisma } from '@/lib/prisma';
import {
  getOperatoryOptions,
  getPatientOptions,
  getProviderOptions,
  getServiceOptions,
} from '@/lib/queries';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Everything that is out at a laboratory, in one place.
 *
 * The dashboard already shows what is overdue and a patient's tab shows their
 * own cases, but nothing answered "what is at the lab this week" — the question
 * the practice actually asks on a Monday morning.
 */
export default async function LabPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('lab.view');
  const canEdit = user.permissions.includes('lab.edit');
  const canBook = user.permissions.includes('appointment.edit');
  const canDelete = user.permissions.includes('patient.delete');

  const t = await getTranslations('lab');

  const { status } = await searchParams;
  const filter = isLabStatus(status) ? status : undefined;

  const cases = await prisma.labCase.findMany({
    where: filter ? { status: filter } : undefined,
    // Outstanding work first, and within it whatever is due soonest. A case with
    // no promised date sorts last rather than first, which is where a null lands
    // if nobody says otherwise.
    orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { sentAt: 'desc' }],
    include: { patient: { select: { id: true, firstName: true, lastName: true } } },
  });

  const labNames = [...new Set(cases.map((labCase) => labCase.labName))].sort();

  // Late only counts while the work is still out. A crown that arrived a day
  // after it was promised is not a problem any more — one that has not arrived
  // at all is the practice's problem of the week, and nothing said so.
  const now = today();
  const overdue = cases.filter(
    (labCase) => labCase.status === 'SENT' && labCase.dueAt !== null && labCase.dueAt < now,
  ).length;

  const [patients, services, providers, operatories] = await Promise.all([
    canEdit ? getPatientOptions() : Promise.resolve([]),
    canEdit ? getServiceOptions() : Promise.resolve([]),
    canEdit ? getProviderOptions() : Promise.resolve([]),
    canEdit ? getOperatoryOptions() : Promise.resolve([]),
  ]);

  return (
    <div>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      {overdue > 0 ? (
        <p className="mb-4 flex items-center gap-2 font-bold text-danger">
          <TriangleAlert size={19} aria-hidden />
          {t('overdueAlert', { count: overdue })}
        </p>
      ) : null}

      <nav className="mb-4 flex flex-wrap gap-2" aria-label={t('status')}>
        <FilterLink active={!filter} href="/lab" label={t('allCases')} />
        {LAB_STATUSES.map((option) => (
          <FilterLink
            key={option}
            active={filter === option}
            href={`/lab?status=${option}`}
            label={t(`status_${option}`)}
          />
        ))}
      </nav>

      <Card>
        {cases.length === 0 && !filter ? (
          // Without this the page is a dead end: a case can only start from the
          // patient it is for, and nothing on an empty list said so.
          <EmptyState
            icon={<FlaskConical size={40} aria-hidden />}
            title={t('emptyHint')}
            action={
              <Link href="/patients" className="btn btn-primary btn-sm">
                <Users size={18} aria-hidden />
                {t('goToPatients')}
              </Link>
            }
          />
        ) : (
          <LabCaseList
            cases={cases.map((labCase) => ({
              id: labCase.id,
              labName: labCase.labName,
              kind: labCase.kind,
              teeth: labCase.teeth ?? '',
              status: labCase.status,
              sentAt: toDateKey(labCase.sentAt),
              dueAt: labCase.dueAt ? toDateKey(labCase.dueAt) : '',
              receivedAt: labCase.receivedAt ? toDateKey(labCase.receivedAt) : '',
              notes: labCase.notes ?? '',
              patientId: labCase.patient.id,
              patientName: `${labCase.patient.lastName} ${labCase.patient.firstName}`,
            }))}
            labNames={labNames}
            canEdit={canEdit}
            canDelete={canDelete}
            bookFitting={
              canEdit && canBook
                ? (labCase) => (
                    <AppointmentFormDialog
                      patients={patients}
                      services={services}
                      staff={providers}
                      operatories={operatories}
                      defaultPatientId={labCase.patientId}
                      defaultDate={toDateKey(today())}
                      triggerClassName="btn btn-secondary btn-sm whitespace-nowrap"
                      triggerLabel={t('bookFitting')}
                    />
                  )
                : undefined
            }
          />
        )}
      </Card>

      {cases.length === 0 && filter ? (
        <p className="mt-4 flex items-center justify-center gap-2 text-ink-faint">
          <FlaskConical size={18} aria-hidden />
          {t('empty')}
        </p>
      ) : null}
    </div>
  );
}

function FilterLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-[0.92rem] font-semibold no-underline transition-colors',
        active
          ? 'border-brand bg-brand-soft text-brand-deep'
          : 'border-line-strong text-ink-soft hover:border-ink hover:text-ink',
      )}
    >
      {label}
    </Link>
  );
}
