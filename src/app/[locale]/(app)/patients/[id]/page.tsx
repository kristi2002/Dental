import { ArrowLeft, Cake, CalendarDays, Mail, Phone, Trash2 } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AppointmentFormDialog } from '@/components/appointments/AppointmentFormDialog';
import { AppointmentRow } from '@/components/appointments/AppointmentRow';
import { DocumentGallery } from '@/components/documents/DocumentGallery';
import { DocumentUploadDialog } from '@/components/documents/DocumentUploadDialog';
import { DentalChart, type ToothRecordMap } from '@/components/patients/DentalChart';
import { PatientFormDialog } from '@/components/patients/PatientFormDialog';
import { ReliabilityBadge } from '@/components/patients/ReliabilityBadge';
import { VisitFormDialog } from '@/components/patients/VisitFormDialog';
import { VisitTimeline } from '@/components/patients/VisitTimeline';
import { PlanFormDialog } from '@/components/plans/PlanFormDialog';
import { TreatmentPlans } from '@/components/plans/TreatmentPlans';
import { PrescriptionDialog } from '@/components/prescriptions/PrescriptionDialog';
import { PrescriptionList } from '@/components/prescriptions/PrescriptionList';
import { ActionForm } from '@/components/ui/ActionForm';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Link } from '@/i18n/navigation';
import { deletePatient } from '@/lib/actions/patients';
import { requirePermission } from '@/lib/auth/guard';
import type { Permission } from '@/lib/auth/permissions';
import { age, toDateKey, today } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { getPatientAppointments, getPatientOptions, getServiceOptions } from '@/lib/queries';
import { getReliability } from '@/lib/reliability';
import { cn, initials } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const TABS = [
  'details',
  'chart',
  'history',
  'plans',
  'documents',
  'prescriptions',
  'appointments',
] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  details: 'tabDetails',
  chart: 'tabChart',
  history: 'tabHistory',
  plans: 'tabPlans',
  documents: 'tabDocuments',
  prescriptions: 'tabPrescriptions',
  appointments: 'tabAppointments',
};

/**
 * Tabs that are part of the medical record. Each also has its own permission,
 * checked below — this list is what keeps the front desk from seeing the tab
 * exists at all.
 */
const TAB_PERMISSION: Partial<Record<Tab, Permission>> = {
  chart: 'patient.medical.view',
  history: 'patient.medical.view',
  plans: 'plan.view',
  documents: 'document.view',
  prescriptions: 'prescription.view',
};

export default async function PatientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('patient.view');
  const can = (permission: Permission) => user.permissions.includes(permission);

  const canSeeMedical = can('patient.medical.view');
  const canEditMedical = can('patient.medical.edit');
  const canEdit = can('patient.edit');
  const canDelete = can('patient.delete');
  const canBook = can('appointment.edit');

  const t = await getTranslations('patients');
  const tc = await getTranslations('common');
  const tt = await getTranslations('teeth');
  const format = await getFormatter();

  // A tab the person may not open is not offered, and a hand-typed `?tab=chart`
  // lands on details rather than on someone's diagnosis.
  const tabs = TABS.filter((option) => {
    const permission = TAB_PERMISSION[option];
    return permission === undefined || can(permission);
  });
  const { tab: rawTab } = await searchParams;
  const tab: Tab = tabs.includes(rawTab as Tab) ? (rawTab as Tab) : 'details';

  const patient = await prisma.patient.findUnique({
    where: { id },
    include: {
      teethRecords: true,
      visitRecords: {
        orderBy: { visitDate: 'desc' },
        include: { staffUser: { select: { firstName: true, lastName: true } } },
      },
      plans: {
        orderBy: { createdAt: 'desc' },
        include: { steps: { orderBy: { position: 'asc' } } },
      },
      documents: {
        orderBy: { createdAt: 'desc' },
        include: { uploadedBy: { select: { firstName: true, lastName: true } } },
      },
      prescriptions: {
        orderBy: { createdAt: 'desc' },
        include: { issuedBy: { select: { firstName: true, lastName: true } } },
      },
    },
  });

  if (!patient) notFound();

  const [reliability, templates] = await Promise.all([
    getReliability(id),
    can('prescription.view')
      ? prisma.prescriptionTemplate.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] })
      : Promise.resolve([]),
  ]);

  // Stripped once, here, rather than at each render site. The edit dialog is a
  // client component, so anything handed to it crosses to the browser whether or
  // not it is displayed — a hidden field is still a leak.
  const medicalNotes = canSeeMedical ? (patient.medicalNotes ?? '') : '';

  const [appointments, patientOptions, services] = await Promise.all([
    getPatientAppointments(id),
    getPatientOptions(),
    getServiceOptions(),
  ]);

  const teeth: ToothRecordMap = Object.fromEntries(
    patient.teethRecords.map((record) => [
      record.toothNum,
      { status: record.status, notes: record.notes ?? '' },
    ]),
  );

  const fullName = `${patient.lastName} ${patient.firstName}`;

  return (
    <>
      <Link
        href="/patients"
        className="mb-4 inline-flex items-center gap-1.5 font-semibold text-ink-soft no-underline hover:text-ink"
      >
        <ArrowLeft size={18} aria-hidden />
        {t('title')}
      </Link>

      <header className="card mb-6 flex flex-wrap items-start gap-5 p-5">
        <span
          aria-hidden
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-line-strong bg-paper text-[1.4rem] font-bold text-ink-soft"
        >
          {initials(patient.firstName, patient.lastName)}
        </span>

        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight text-ink">
            {fullName}
            <ReliabilityBadge reliability={reliability} />
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[1.02rem] text-ink-soft">
            <a href={`tel:${patient.phone}`} className="flex items-center gap-1.5 hover:text-ink">
              <Phone size={17} aria-hidden />
              {patient.phone}
            </a>
            {patient.email ? (
              <a
                href={`mailto:${patient.email}`}
                className="flex items-center gap-1.5 hover:text-ink"
              >
                <Mail size={17} aria-hidden />
                {patient.email}
              </a>
            ) : null}
            {patient.dateOfBirth ? (
              <span className="flex items-center gap-1.5">
                <Cake size={17} aria-hidden />
                {t('age', { age: age(patient.dateOfBirth) })}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[0.92rem] text-ink-faint">
            {t('registered', {
              date: format.dateTime(patient.createdAt, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              }),
            })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canBook ? (
            <AppointmentFormDialog
              patients={patientOptions}
              services={services}
              defaultPatientId={patient.id}
              defaultDate={toDateKey(today())}
            />
          ) : null}
          {canEdit ? (
            <PatientFormDialog
              canEditMedical={canEditMedical}
              patient={{
                id: patient.id,
                firstName: patient.firstName,
                lastName: patient.lastName,
                phone: patient.phone,
                email: patient.email ?? '',
                dateOfBirth: patient.dateOfBirth ? toDateKey(patient.dateOfBirth) : '',
                medicalNotes,
                recallMonths: patient.recallMonths,
              }}
            />
          ) : null}
          {canDelete ? (
            <ActionForm
              action={deletePatient}
              values={{ id: patient.id }}
              confirmMessage={`${t('deleteWarning')}\n\n${tc('confirmDelete')}`}
            >
              <button type="submit" className="btn btn-danger" title={tc('delete')}>
                <Trash2 size={19} aria-hidden />
                <span className="sr-only">{tc('delete')}</span>
              </button>
            </ActionForm>
          ) : null}
        </div>
      </header>

      <nav className="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-line-strong p-1">
        {tabs.map((option) => (
          <Link
            key={option}
            href={`/patients/${patient.id}?tab=${option}`}
            aria-current={option === tab ? 'page' : undefined}
            className={cn(
              'min-h-11 rounded-md px-4 py-2 font-bold whitespace-nowrap no-underline transition-colors',
              option === tab ? 'bg-brand-dark text-white' : 'text-ink-soft hover:bg-paper hover:text-ink',
            )}
          >
            {t(TAB_LABEL[option])}
          </Link>
        ))}
      </nav>

      {tab === 'details' ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title={t('contactInfo')} />
            <CardBody className="space-y-3">
              <Detail label={t('phone')} value={patient.phone || t('noPhone')} />
              <Detail label={t('email')} value={patient.email || t('noEmail')} />
              <Detail
                label={t('dateOfBirth')}
                value={
                  patient.dateOfBirth
                    ? format.dateTime(patient.dateOfBirth, {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    : tc('none')
                }
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={canSeeMedical ? t('medicalNotes') : t('recallTitle')} />
            <CardBody>
              {canSeeMedical ? (
                <p
                  className={cn(
                    'whitespace-pre-line text-[1.05rem]',
                    medicalNotes ? 'text-ink' : 'text-ink-faint',
                  )}
                >
                  {medicalNotes || t('noNotes')}
                </p>
              ) : (
                <p className="text-[1.05rem] text-ink-faint">{t('medicalHidden')}</p>
              )}

              <p className="mt-4 text-[0.9rem] font-bold tracking-wide text-ink-faint uppercase">
                {t('recallEvery')}
              </p>
              <p className="text-[1.05rem] text-ink">
                {patient.recallMonths > 0
                  ? t('recallMonths', { months: patient.recallMonths })
                  : t('recallOff')}
              </p>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === 'chart' ? (
        <Card>
          <CardHeader title={tt('title')} />
          <CardBody>
            <DentalChart patientId={patient.id} records={teeth} readOnly={!canEditMedical} />
          </CardBody>
        </Card>
      ) : null}

      {tab === 'history' ? (
        <Card>
          <CardHeader
            title={t('visitHistory')}
            action={
              canEditMedical ? (
                <VisitFormDialog
                  patientId={patient.id}
                  services={services}
                  today={toDateKey(today())}
                />
              ) : null
            }
          />
          <VisitTimeline
            canDelete={canDelete}
            visits={patient.visitRecords.map((visit) => ({
              id: visit.id,
              visitDate: visit.visitDate.toISOString(),
              notes: visit.notes,
              services: visit.services,
              recordedBy: visit.staffUser
                ? `${visit.staffUser.firstName} ${visit.staffUser.lastName}`
                : '',
            }))}
          />
        </Card>
      ) : null}

      {tab === 'plans' ? (
        <Card>
          <CardHeader
            title={t('tabPlans')}
            action={can('plan.edit') ? <PlanFormDialog patientId={patient.id} /> : null}
          />
          <TreatmentPlans
            patientId={patient.id}
            canEdit={can('plan.edit')}
            canDelete={canDelete}
            plans={patient.plans.map((plan) => ({
              id: plan.id,
              title: plan.title,
              notes: plan.notes ?? '',
              status: plan.status,
              steps: plan.steps.map((step) => ({
                id: step.id,
                position: step.position,
                title: step.title,
                toothNum: step.toothNum,
                notes: step.notes ?? '',
                status: step.status,
              })),
            }))}
          />
        </Card>
      ) : null}

      {tab === 'documents' ? (
        <Card>
          <CardHeader
            title={t('tabDocuments')}
            action={
              can('document.edit') ? <DocumentUploadDialog patientId={patient.id} /> : null
            }
          />
          <DocumentGallery
            patientId={patient.id}
            canUpload={can('document.edit')}
            canDelete={can('document.delete')}
            documents={patient.documents.map((document) => ({
              id: document.id,
              kind: document.kind,
              fileName: document.fileName,
              mimeType: document.mimeType,
              sizeBytes: document.sizeBytes,
              toothNum: document.toothNum,
              notes: document.notes ?? '',
              uploadedBy: document.uploadedBy
                ? `${document.uploadedBy.firstName} ${document.uploadedBy.lastName}`
                : '',
              createdAt: document.createdAt.toISOString(),
            }))}
          />
        </Card>
      ) : null}

      {tab === 'prescriptions' ? (
        <Card>
          <CardHeader
            title={t('tabPrescriptions')}
            action={
              can('prescription.edit') ? (
                <PrescriptionDialog
                  patientId={patient.id}
                  patientName={fullName}
                  templates={templates.map((template) => ({
                    id: template.id,
                    name: template.name,
                    category: template.category ?? '',
                    body: template.body,
                  }))}
                />
              ) : null
            }
          />
          <PrescriptionList
            patientId={patient.id}
            patientName={fullName}
            canIssue={can('prescription.edit')}
            canDelete={canDelete}
            templates={templates.map((template) => ({
              id: template.id,
              name: template.name,
              category: template.category ?? '',
              body: template.body,
            }))}
            prescriptions={patient.prescriptions.map((prescription) => ({
              id: prescription.id,
              body: prescription.body,
              issuedBy: prescription.issuedBy
                ? `${prescription.issuedBy.firstName} ${prescription.issuedBy.lastName}`
                : '',
              createdAt: prescription.createdAt.toISOString(),
            }))}
          />
        </Card>
      ) : null}

      {tab === 'appointments' ? (
        <Card>
          <CardHeader
            title={t('tabAppointments')}
            action={
              canBook ? (
                <AppointmentFormDialog
                  patients={patientOptions}
                  services={services}
                  defaultPatientId={patient.id}
                  defaultDate={toDateKey(today())}
                  triggerClassName="btn btn-primary btn-sm"
                />
              ) : null
            }
          />
          {appointments.length === 0 ? (
            <EmptyState
              icon={<CalendarDays size={40} aria-hidden />}
              title={t('noAppointments')}
            />
          ) : (
            appointments.map((appointment) => (
              <AppointmentRow
                key={appointment.id}
                appointment={appointment}
                patients={patientOptions}
                services={services}
                showDate
              />
            ))
          )}
        </Card>
      ) : null}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.9rem] font-bold tracking-wide text-ink-faint uppercase">{label}</p>
      <p className="text-[1.05rem] text-ink">{value}</p>
    </div>
  );
}
