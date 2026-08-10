import { ArrowLeft, Cake, CalendarDays, Mail, Phone, Trash2 } from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AppointmentFormDialog } from '@/components/appointments/AppointmentFormDialog';
import { AppointmentRow } from '@/components/appointments/AppointmentRow';
import { DentalChart, type ToothRecordMap } from '@/components/patients/DentalChart';
import { PatientFormDialog } from '@/components/patients/PatientFormDialog';
import { VisitFormDialog } from '@/components/patients/VisitFormDialog';
import { VisitTimeline } from '@/components/patients/VisitTimeline';
import { ActionForm } from '@/components/ui/ActionForm';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Link } from '@/i18n/navigation';
import { deletePatient } from '@/lib/actions/patients';
import { age, toDateKey, today } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { getPatientAppointments, getPatientOptions, getServiceOptions } from '@/lib/queries';
import { cn, initials } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const TABS = ['details', 'chart', 'history', 'appointments'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  details: 'tabDetails',
  chart: 'tabChart',
  history: 'tabHistory',
  appointments: 'tabAppointments',
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

  const t = await getTranslations('patients');
  const tc = await getTranslations('common');
  const tt = await getTranslations('teeth');
  const format = await getFormatter();

  const { tab: rawTab } = await searchParams;
  const tab: Tab = TABS.includes(rawTab as Tab) ? (rawTab as Tab) : 'details';

  const patient = await prisma.patient.findUnique({
    where: { id },
    include: {
      teethRecords: true,
      visitRecords: { orderBy: { visitDate: 'desc' } },
    },
  });

  if (!patient) notFound();

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
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-line-strong bg-paper text-[1.4rem] font-bold text-ink-soft"
        >
          {initials(patient.firstName, patient.lastName)}
        </span>

        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold tracking-tight text-ink">{fullName}</h1>
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
          <AppointmentFormDialog
            patients={patientOptions}
            services={services}
            defaultPatientId={patient.id}
            defaultDate={toDateKey(today())}
          />
          <PatientFormDialog
            patient={{
              id: patient.id,
              firstName: patient.firstName,
              lastName: patient.lastName,
              phone: patient.phone,
              email: patient.email ?? '',
              dateOfBirth: patient.dateOfBirth ? toDateKey(patient.dateOfBirth) : '',
              medicalNotes: patient.medicalNotes ?? '',
            }}
          />
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
        </div>
      </header>

      <nav className="mb-4 flex gap-1 overflow-x-auto rounded-lg border-2 border-line-strong p-1">
        {TABS.map((option) => (
          <Link
            key={option}
            href={`/patients/${patient.id}?tab=${option}`}
            aria-current={option === tab ? 'page' : undefined}
            className={cn(
              'min-h-11 rounded-md px-4 py-2 font-bold whitespace-nowrap no-underline transition-colors',
              option === tab ? 'bg-ink text-white' : 'text-ink-soft hover:bg-paper hover:text-ink',
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
            <CardHeader title={t('medicalNotes')} />
            <CardBody>
              <p
                className={cn(
                  'whitespace-pre-line text-[1.05rem]',
                  patient.medicalNotes ? 'text-ink' : 'text-ink-faint',
                )}
              >
                {patient.medicalNotes || t('noNotes')}
              </p>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === 'chart' ? (
        <Card>
          <CardHeader title={tt('title')} />
          <CardBody>
            <DentalChart patientId={patient.id} records={teeth} />
          </CardBody>
        </Card>
      ) : null}

      {tab === 'history' ? (
        <Card>
          <CardHeader
            title={t('visitHistory')}
            action={
              <VisitFormDialog
                patientId={patient.id}
                serviceNames={services.map((s) => s.name)}
                today={toDateKey(today())}
              />
            }
          />
          <VisitTimeline
            visits={patient.visitRecords.map((visit) => ({
              id: visit.id,
              visitDate: visit.visitDate.toISOString(),
              notes: visit.notes,
              services: visit.services,
            }))}
          />
        </Card>
      ) : null}

      {tab === 'appointments' ? (
        <Card>
          <CardHeader
            title={t('tabAppointments')}
            action={
              <AppointmentFormDialog
                patients={patientOptions}
                services={services}
                defaultPatientId={patient.id}
                defaultDate={toDateKey(today())}
                triggerClassName="btn btn-primary btn-sm"
              />
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
