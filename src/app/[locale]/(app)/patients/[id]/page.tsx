import {
  Archive,
  ArchiveRestore,
  Baby,
  BellRing,
  Cake,
  CalendarDays,
  CreditCard,
  IdCard,
  LifeBuoy,
  ListChecks,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Printer,
  ScrollText,
  ShieldAlert,
  Sparkles,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppointmentFormDialog } from '@/components/appointments/AppointmentFormDialog';
import { AppointmentRow } from '@/components/appointments/AppointmentRow';
import { DocumentGallery } from '@/components/documents/DocumentGallery';
import { DocumentUploadDialog } from '@/components/documents/DocumentUploadDialog';
import { DentalChart, type ToothRecordMap } from '@/components/dental/DentalChart';
import { ToothDefsProvider } from '@/components/dental/ToothDefsProvider';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { PatientFormDialog } from '@/components/patients/PatientFormDialog';
import { ReliabilityBadge } from '@/components/patients/ReliabilityBadge';
import { AlertFormDialog } from '@/components/patients/AlertFormDialog';
import { IdCardPanel } from '@/components/patients/IdCardPanel';
import { ContactActions } from '@/components/patients/ContactActions';
import { ContactHistory } from '@/components/patients/ContactHistory';
import { MessageDialog } from '@/components/patients/MessageDialog';
import { PatientAlerts } from '@/components/patients/PatientAlerts';
import { VisitFormDialog } from '@/components/patients/VisitFormDialog';
import { VisitTimeline } from '@/components/patients/VisitTimeline';
import { TreatmentPlans } from '@/components/plans/TreatmentPlans';
import { PrescriptionDialog } from '@/components/prescriptions/PrescriptionDialog';
import { PrescriptionList } from '@/components/prescriptions/PrescriptionList';
import { ActionForm } from '@/components/ui/ActionForm';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { CopyButton } from '@/components/ui/CopyButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Link } from '@/i18n/navigation';
import { archivePatient, deletePatient } from '@/lib/actions/patients';
import { MergeDialog } from '@/components/patients/MergeDialog';
import { recordView, requirePermission } from '@/lib/auth/guard';
import type { Permission } from '@/lib/auth/permissions';
import { DocumentKind, TreatmentStepStatus } from '@/generated/prisma/enums';
import { addDays, addMonths, age, toDateKey, today } from '@/lib/dates';
import { isPromisedSlot } from '@/lib/plan-progress';
import { ID_KINDS } from '@/lib/documents';
import { allergyLines } from '@/lib/medical';
import { mailerStatus } from '@/lib/messages/mailer';
import { composeTemplates } from '@/lib/messages/templates';
import { prisma } from '@/lib/prisma';
import { DEFAULT_TOOTH_STATUS } from '@/lib/teeth';
import {
  getOperatoryOptions,
  getPatientAppointments,
  getProviderOptions,
  getServiceOptions,
} from '@/lib/queries';
import { clinicDisplayName, getClinicProfile } from '@/lib/queries';
import { getReliability } from '@/lib/reliability';
import { cn, initials, parseServiceList } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const TABS = [
  'details',
  'chart',
  'history',
  'plans',
  'documents',
  'prescriptions',
  'appointments',
  'contacts',
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
  contacts: 'tabContacts',
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
  // Who was messaged and when is diary information, not clinical — the front
  // desk is exactly who needs it.
  contacts: 'appointment.view',
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
  const canSeeAudit = can('audit.view');

  const t = await getTranslations('patients');
  const tc = await getTranslations('common');
  const tt = await getTranslations('teeth');
  const tcontacts = await getTranslations('contacts');
  const ta = await getTranslations('alerts');
  const tdoc = await getTranslations('documents');
  const tPlans = await getTranslations('plans');
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
      alerts: { orderBy: { createdAt: 'desc' } },
      contacts: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          actor: { select: { firstName: true, lastName: true } },
          appointment: { select: { date: true, startTime: true } },
        },
      },
      teethRecords: true,
      visitRecords: {
        orderBy: { visitDate: 'desc' },
        include: {
          staffUser: { select: { firstName: true, lastName: true } },
          performedBy: { select: { firstName: true, lastName: true } },
          // Everything the schema already recorded about a visit and the
          // timeline never showed: which treatments (as catalogue rows, not as
          // a comma-separated sentence), which teeth were charted during it,
          // and what came off the shelf because of it.
          services: { orderBy: { position: 'asc' } },
          toothRecords: {
            select: { toothNum: true, status: true, surfaces: true, notes: true },
          },
          stockMovements: {
            select: { delta: true, item: { select: { name: true } } },
          },
        },
      },
      plans: {
        orderBy: { createdAt: 'desc' },
        include: {
          steps: {
            orderBy: { position: 'asc' },
            // The slot a step is booked into, so the plan and the calendar
            // finally show the same thing — with its `status`, because a slot
            // the patient cancelled is not a date this plan is waiting for. The
            // practice-wide list has always known that (`isPromisedSlot`); this
            // tab printed any linked appointment as if it still stood.
            include: {
              appointment: { select: { date: true, startTime: true, status: true } },
            },
          },
        },
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

  // The chart is on the screen from here down, so this is the line that says so.
  await recordView(user, {
    entity: 'patient',
    entityId: patient.id,
    summary: `Opened the record of ${patient.firstName} ${patient.lastName}`,
  });

  const [reliability, templates, clinicProfile, referralRows, planTitleRows] = await Promise.all([
    getReliability(id),
    can('prescription.view')
      ? prisma.prescriptionTemplate.findMany({
          orderBy: [{ category: 'asc' }, { name: 'asc' }],
          include: { services: { select: { serviceId: true } } },
        })
      : Promise.resolve([]),
    getClinicProfile(),
    prisma.patient.findMany({
      where: { referralSource: { not: null } },
      distinct: ['referralSource'],
      orderBy: { referralSource: 'asc' },
      select: { referralSource: true },
    }),
    // Plan names the practice has already used, suggested on the next one so
    // "Upper right quadrant" does not become four differently worded plans.
    can('plan.view')
      ? prisma.treatmentPlan.findMany({
          distinct: ['title'],
          orderBy: { title: 'asc' },
          take: 40,
          select: { title: true },
        })
      : Promise.resolve([]),
  ]);

  // Stripped once, here, rather than at each render site. The edit dialog is a
  // client component, so anything handed to it crosses to the browser whether or
  // not it is displayed — a hidden field is still a leak.
  const medicalNotes = canSeeMedical ? (patient.medicalNotes ?? '') : '';
  const allergies = allergyLines(medicalNotes);

  // Loudest first, so the header reads worst-case-first and the card below it
  // does not bury a CRITICAL row under three INFO ones.
  const SEVERITY_ORDER = ['CRITICAL', 'IMPORTANT', 'INFO'];
  const sortedAlerts = canSeeMedical
    ? [...patient.alerts].sort(
        (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
      )
    : [];

  const [appointments, services, staff, operatories] = await Promise.all([
    getPatientAppointments(id),
    getServiceOptions(),
    getProviderOptions(),
    getOperatoryOptions(),
  ]);

  // The soonest booking still ahead of them, which is what two of the message
  // templates are about. `getPatientAppointments` comes back newest first, so
  // the last one that is still in the future is the next one to happen.
  const todayKey = toDateKey(today());
  const nextAppointment =
    appointments
      .filter(
        (appointment) =>
          appointment.date >= todayKey &&
          appointment.status !== 'CANCELLED' &&
          appointment.status !== 'NO_SHOW',
      )
      .at(-1) ?? null;

  // Composed here rather than inside the dialog, and on the server, because
  // this is the only side of the wire where the *patient's* language can be
  // asked for — see `composeTemplates`. Cheap enough to do on every render of
  // the page: six short strings out of the message catalogue.
  const canMessage = can('message.send');
  const { locale: messageLocale, templates: messageTemplates } = await composeTemplates({
    patientName: patient.firstName,
    patientLocale: patient.locale,
    clinicName: clinicDisplayName(clinicProfile),
    clinicPhone: clinicProfile.phone ?? '',
    appointment: nextAppointment
      ? { date: nextAppointment.date, startTime: nextAppointment.startTime }
      : null,
  });

  const messageProps = {
    patientId: patient.id,
    patientName: `${patient.lastName} ${patient.firstName}`,
    phone: patient.phone,
    email: patient.email ?? '',
    consent: patient.contactConsent,
    templates: messageTemplates,
    messageLocale,
    readerLocale: locale,
    mailerConfigured: mailerStatus().configured,
  };

  const teeth: ToothRecordMap = Object.fromEntries(
    patient.teethRecords.map((record) => [
      record.toothNum,
      {
        status: record.status,
        notes: record.notes ?? '',
        surfaces: record.surfaces ?? '',
        // The periodontal half of the same row — pocket depths, which sites
        // bled, and how far the tooth moves. Passed raw and parsed in the
        // chart: `src/lib/perio.ts` owns the encoding, and a second reading of
        // it here is a second place for it to be read wrong.
        mobility: record.mobility,
        pockets: record.pockets,
        bleeding: record.bleeding,
        // When the tooth was last charted. A caries found two years ago and one
        // found this morning are the same red on the drawing and two very
        // different conversations.
        chartedOn: format.dateTime(record.updatedAt, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
      },
    ]),
  );

  const referralSources = referralRows
    .map((row) => row.referralSource)
    .filter((value): value is string => Boolean(value));
  const planTitles = planTitleRows.map((row) => row.title);

  const templateOptions = templates.map((template) => ({
    id: template.id,
    name: template.name,
    category: template.category ?? '',
    body: template.body,
    serviceIds: template.services.map((link) => link.serviceId),
  }));

  // What this patient has just had done — the last fortnight of visits. It is
  // what decides which standard wording is offered first, and a prescription is
  // written within minutes of the treatment, not weeks.
  const RECENT_DAYS = 14;
  const recentSince = addDays(today(), -RECENT_DAYS);
  const recentServices = patient.visitRecords
    .filter((visit) => visit.visitDate >= recentSince)
    .flatMap((visit) => visit.services);
  const recentWork = {
    serviceIds: [
      ...new Set(
        recentServices
          .map((row) => row.serviceId)
          .filter((value): value is string => value !== null),
      ),
    ],
    serviceNames: [...new Set(recentServices.map((row) => row.name))],
  };
  const todayLabel = format.dateTime(today(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  // The ID lives in `documents` like everything else; the details tab just
  // reaches past the gallery for the two faces it draws as a card.
  const idFront = patient.documents.find((document) => document.kind === DocumentKind.ID_FRONT);
  const idBack = patient.documents.find((document) => document.kind === DocumentKind.ID_BACK);
  const otherDocuments = patient.documents.filter(
    (document) => !ID_KINDS.includes(document.kind),
  );

  // Same arithmetic as the recall list (`recalls.ts`): count from the last visit,
  // or from the day they were entered if they have never been seen — otherwise a
  // patient added and never booked would show no due date at all.
  // Nothing in the schema ties a prescription to a visit — it is written on the
  // way out, minutes after the note. Matching them by day is the honest version
  // of that relationship, and it is the difference between a timeline that says
  // what happened and one that says half of it.
  const prescriptionsByDay = new Map<string, Array<{ id: string; body: string }>>();
  for (const prescription of patient.prescriptions) {
    const key = toDateKey(prescription.createdAt);
    const forDay = prescriptionsByDay.get(key) ?? [];
    forDay.push({ id: prescription.id, body: prescription.body });
    prescriptionsByDay.set(key, forDay);
  }

  const lastVisitDate = patient.visitRecords[0]?.visitDate ?? null;
  const recallDue = addMonths(lastVisitDate ?? patient.createdAt, patient.recallMonths);
  const recall = { dueDate: recallDue, overdue: recallDue <= today() };

  const fullName = `${patient.lastName} ${patient.firstName}`;

  /**
   * The booking dialog for every step that could take one, keyed by step.
   *
   * `AppointmentFormDialog` needs the catalogue, the providers and the chairs,
   * and the plan list should not have to load them — that much was already true
   * when this was a render prop. What changed is that the step list is a client
   * component now, so that it can move a step without a round trip, and a
   * function cannot be handed across that boundary. Elements can.
   */
  const planBookSlots: Record<string, ReactNode> = {};
  if (canBook && can('plan.view')) {
    for (const plan of patient.plans) {
      for (const step of plan.steps) {
        if (step.status !== TreatmentStepStatus.PENDING || step.appointmentId !== null)
          continue;
        planBookSlots[step.id] = (
          <AppointmentFormDialog
            // See the practice-wide list: a server-built element lands in the
            // step row's button list without a key of its own.
            key={step.id}
            services={services}
            staff={staff}
            operatories={operatories}
            defaultPatient={{ id: patient.id, name: fullName, phone: patient.phone }}
            defaultDate={toDateKey(today())}
            planStepId={step.id}
            triggerClassName="btn btn-secondary btn-sm"
            triggerLabel={t('bookStep')}
          />
        );
      }
    }
  }

  return (
    // One copy of the tooth drawings for the page, rather than one each from
    // the chart, the visit timeline and the picker inside the treatment plans —
    // which is three, and 2,162 elements apiece.
    <ToothDefsProvider>
      {/* The tab is part of the address, so it is part of the trail: leaving the
          prescriptions tab for a printed sheet and coming back must not land on
          Details. */}
      <Breadcrumbs
        items={[
          { href: '/patients', label: t('title') },
          { href: `/patients/${patient.id}`, label: fullName },
          ...(tab === 'details' ? [] : [{ label: t(TAB_LABEL[tab]) }]),
        ]}
      />

      {/* This record is out of every list and every picker. Said at the top,
          because everything below it still works and would otherwise read as an
          ordinary patient somebody could book. */}
      {patient.archivedAt ? (
        <p
          role="status"
          className="mb-4 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-warn bg-warn-soft px-4 py-3 font-semibold text-warn"
        >
          <Archive size={19} aria-hidden />
          {t('archivedOn', {
            date: format.dateTime(patient.archivedAt, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }),
          })}
        </p>
      ) : null}

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
            {/* Visible from every tab, not just the one holding the notes.
                Recorded alerts come first; the note-scanning badge stays as the
                safety net for anything not promoted to a row yet. */}
            {canSeeMedical
              ? sortedAlerts
                  .filter((alert) => alert.severity !== 'INFO')
                  .map((alert) => (
                    <Badge key={alert.id} tone={alert.severity === 'CRITICAL' ? 'alert' : 'warn'}>
                      <TriangleAlert size={15} aria-hidden />
                      {ta(`kind_${alert.kind}`)}
                      {alert.substance ? `: ${alert.substance}` : ''}
                    </Badge>
                  ))
              : null}
            {allergies.length > 0 && sortedAlerts.length === 0 ? (
              <Badge tone="alert">
                <TriangleAlert size={15} aria-hidden />
                {t('allergyBadge')}
              </Badge>
            ) : null}
            <ReliabilityBadge reliability={reliability} />
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[1.02rem] text-ink-soft">
            {/* Not links any more. A `tel:` or `mailto:` does nothing at all on
                a workstation with no handler registered for the scheme, and
                that is the ordinary state of a browser-only front desk — so
                each of these is now a short menu with at least one route out
                that works everywhere. See `ContactActions`. */}
            <ContactActions
              {...messageProps}
              preferredChannel={patient.preferredChannel}
              canMessage={canMessage}
            />
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
              services={services}
              staff={staff}
              operatories={operatories}
              defaultPatient={{ id: patient.id, name: fullName, phone: patient.phone }}
              defaultDate={toDateKey(today())}
            />
          ) : null}
          {/* The second thing anybody does from a patient record, and until now
              the one thing the record could not do. Beside "New appointment"
              rather than behind the overflow, because "book them" and "write to
              them" are the two verbs this page exists for. */}
          {canMessage ? (
            <MessageDialog
              {...messageProps}
              triggerTitle={t('messagePatient')}
              trigger={
                <>
                  <MessageSquare size={19} aria-hidden />
                  {t('message')}
                </>
              }
            />
          ) : null}
          {canEdit ? (
            <PatientFormDialog
              canEditMedical={canEditMedical}
              referralSources={referralSources}
              patient={{
                id: patient.id,
                firstName: patient.firstName,
                lastName: patient.lastName,
                phone: patient.phone,
                email: patient.email ?? '',
                dateOfBirth: patient.dateOfBirth ? toDateKey(patient.dateOfBirth) : '',
                medicalNotes,
                recallMonths: patient.recallMonths,
                contactConsent:
                  patient.contactConsent === null ? '' : patient.contactConsent ? '1' : '0',
                preferredChannel: patient.preferredChannel ?? '',
                locale: patient.locale ?? '',
                guardianName: patient.guardianName ?? '',
                guardianPhone: patient.guardianPhone ?? '',
                address: patient.address ?? '',
                fiscalCode: patient.fiscalCode ?? '',
                emergencyContact: patient.emergencyContact ?? '',
                referralSource: patient.referralSource ?? '',
              }}
            />
          ) : null}
          {/* Out here rather than in the overflow below, because the overflow is
              gated on being able to edit, merge or read the trail — and the
              whole record on one sheet is the one thing on this page that
              somebody with nothing but `patient.view` has a real errand for.
              What the sheet does and does not carry for such a reader is in the
              page itself. */}
          <Link href={`/patients/${patient.id}/print`} className="btn btn-secondary">
            <Printer size={20} aria-hidden />
            {t('recordPrint')}
          </Link>

          {/* The record-level verbs: pressed far less often than booking or
              editing, so they sit behind one button rather than four —
              matching the overflow the plan and appointment rows already
              use. */}
          {canSeeAudit || canDelete || canEdit ? (
            <ActionMenu label={tc('moreActions')} triggerClassName="btn btn-secondary">
              {/* Everything the trail has ever recorded about this person, which
                  until now could only be reached by filtering the whole practice's
                  log by entity *type* and reading for a name. Owner-only, because
                  `audit.view` is. */}
              {canSeeAudit ? (
                <Link
                  href={`/activity?patient=${patient.id}`}
                  className="menu-item"
                  role="menuitem"
                >
                  <ScrollText size={18} aria-hidden className="shrink-0" />
                  {t('history')}
                </Link>
              ) : null}

              {/* Folding a duplicate in. Owner-only, beside the delete it exists
                  to make unnecessary — the front desk's two bad options were
                  leaving both records or erasing one. */}
              {canDelete ? (
                <div className={canSeeAudit ? 'border-t border-line' : undefined}>
                  <MergeDialog
                    keepId={patient.id}
                    keepName={fullName}
                    triggerClassName="menu-item"
                  />
                </div>
              ) : null}

              {/* The ordinary way to get somebody out of the lists, and the one
                  that keeps their record. Sits before the delete deliberately. */}
              {canEdit ? (
                <ActionForm
                  action={archivePatient}
                  values={{ id: patient.id, archived: patient.archivedAt ? '0' : '1' }}
                  confirmMessage={patient.archivedAt ? undefined : t('archiveWarning')}
                  className="block border-t border-line"
                >
                  <button type="submit" role="menuitem" className="menu-item">
                    {patient.archivedAt ? (
                      <ArchiveRestore size={18} aria-hidden className="shrink-0" />
                    ) : (
                      <Archive size={18} aria-hidden className="shrink-0" />
                    )}
                    {patient.archivedAt ? t('restore') : t('archive')}
                  </button>
                </ActionForm>
              ) : null}

              {canDelete ? (
                <ActionForm
                  action={deletePatient}
                  values={{ id: patient.id }}
                  confirmMessage={`${t('deleteWarning')}\n\n${tc('confirmDelete')}`}
                  className="block border-t border-line"
                >
                  <button type="submit" role="menuitem" className="menu-item menu-item-danger">
                    <Trash2 size={18} aria-hidden className="shrink-0" />
                    {tc('delete')}
                  </button>
                </ActionForm>
              ) : null}
            </ActionMenu>
          ) : null}
        </div>
      </header>

      {/* `flex-nowrap` and a scroller rather than the shared wrap: eight tabs
          folding onto three lines would push the record itself off the screen. */}
      <nav className="segmented mb-4 flex w-full flex-nowrap overflow-x-auto">
        {tabs.map((option) => (
          <Link
            key={option}
            href={`/patients/${patient.id}?tab=${option}`}
            aria-current={option === tab ? 'page' : undefined}
            className="segment"
          >
            {t(TAB_LABEL[option])}
          </Link>
        ))}
      </nav>

      {tab === 'details' ? (
        <div className="space-y-6">
          {/* Alerts as rows, not as a sentence someone has to notice — and at
              the top of the tab rather than wedged between two cards, because
              this is the one panel that changes what happens in the chair. */}
          {canSeeMedical ? (
            <Card>
              <CardHeader
                title={ta('title')}
                subtitle={ta('subtitle')}
                icon={<ShieldAlert size={22} aria-hidden />}
                action={canEditMedical ? <AlertFormDialog patientId={patient.id} /> : undefined}
              />
              <PatientAlerts
                patientId={patient.id}
                canEdit={canEditMedical}
                alerts={sortedAlerts.map((alert) => ({
                  id: alert.id,
                  kind: alert.kind,
                  substance: alert.substance ?? '',
                  severity: alert.severity,
                  notes: alert.notes ?? '',
                }))}
              />
            </Card>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              {/* Tiles rather than a label-and-value list. The eight facts here
                  are read by *looking for one of them* — a phone number, a
                  fiscal code — and a column of identical rows makes every one of
                  those a scan from the top. An icon, a fixed slot and a stable
                  shape make it a glance. Blanks are shown rather than skipped:
                  a missing emergency contact is a fact worth seeing. */}
              <Card>
                <CardHeader title={t('contactInfo')} />
                <div className="grid gap-px overflow-hidden bg-line sm:grid-cols-2">
                  <Fact
                    icon={<Phone size={18} aria-hidden />}
                    label={t('phone')}
                    value={patient.phone}
                    href={patient.phone ? `tel:${patient.phone}` : undefined}
                    copy={{ label: tcontacts('copyNumber'), copiedLabel: tcontacts('copied') }}
                    empty={t('noPhone')}
                  />
                  <Fact
                    icon={<Mail size={18} aria-hidden />}
                    label={t('email')}
                    value={patient.email ?? ''}
                    href={patient.email ? `mailto:${patient.email}` : undefined}
                    copy={{ label: tcontacts('copyEmail'), copiedLabel: tcontacts('copied') }}
                    empty={t('noEmail')}
                  />
                  {/* Dosages and half the clinical judgement hang off the age, so
                      it is worked out here rather than in the reader's head. */}
                  <Fact
                    icon={<Cake size={18} aria-hidden />}
                    label={t('dateOfBirth')}
                    value={
                      patient.dateOfBirth
                        ? format.dateTime(patient.dateOfBirth, {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })
                        : ''
                    }
                    note={
                      patient.dateOfBirth ? t('age', { age: age(patient.dateOfBirth) }) : undefined
                    }
                    empty={tc('none')}
                  />
                  <Fact
                    icon={<MapPin size={18} aria-hidden />}
                    label={t('address')}
                    value={patient.address ?? ''}
                    empty={tc('none')}
                  />
                  <Fact
                    icon={<CreditCard size={18} aria-hidden />}
                    label={t('fiscalCode')}
                    value={patient.fiscalCode ?? ''}
                    copy={{ label: tcontacts('copyValue'), copiedLabel: tcontacts('copied') }}
                    mono
                    empty={tc('none')}
                  />
                  <Fact
                    icon={<LifeBuoy size={18} aria-hidden />}
                    label={t('emergencyContact')}
                    value={patient.emergencyContact ?? ''}
                    empty={tc('none')}
                  />
                  {/* A guardian is shown only when there is one — an adult's
                      record carrying an empty "parent or guardian" slot reads as
                      a gap in the file rather than as a question that does not
                      apply. */}
                  {patient.guardianName || patient.guardianPhone ? (
                    <Fact
                      icon={<Baby size={18} aria-hidden />}
                      label={t('guardianTitle')}
                      value={patient.guardianName ?? ''}
                      note={patient.guardianPhone ?? undefined}
                      href={patient.guardianPhone ? `tel:${patient.guardianPhone}` : undefined}
                      copy={
                        patient.guardianPhone
                          ? { label: tcontacts('copyNumber'), copiedLabel: tcontacts('copied') }
                          : undefined
                      }
                      empty={tc('none')}
                    />
                  ) : null}
                  <Fact
                    icon={<Sparkles size={18} aria-hidden />}
                    label={t('referralSource')}
                    value={patient.referralSource ?? ''}
                    empty={tc('none')}
                  />
                </div>
              </Card>

              {/* The two faces of the ID, at the proportions of an ID. */}
              {can('document.view') ? (
                <Card>
                  <CardHeader
                    title={tdoc('idTitle')}
                    subtitle={tdoc('idSubtitle')}
                    icon={<IdCard size={22} aria-hidden />}
                  />
                  <IdCardPanel
                    patientId={patient.id}
                    front={idFront ? { documentId: idFront.id } : undefined}
                    back={idBack ? { documentId: idBack.id } : undefined}
                    canEdit={can('document.edit')}
                    canDelete={can('document.delete')}
                  />
                </Card>
              ) : null}
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader title={t('medicalNotes')} />
                <CardBody>
                  {canSeeMedical ? (
                    <>
                      {/* An allergy is the one note that must not be read past,
                          so it is lifted out of the paragraph and given the
                          loudest colour the palette has. */}
                      {allergies.length > 0 ? (
                        <p
                          role="alert"
                          className="mb-3 flex items-start gap-2.5 rounded-lg border-2 border-danger bg-danger-soft px-3.5 py-3 text-danger"
                        >
                          <TriangleAlert size={20} aria-hidden className="mt-0.5 shrink-0" />
                          <span className="min-w-0">
                            <span className="block text-[0.85rem] font-bold tracking-wide uppercase">
                              {t('allergyBadge')}
                            </span>
                            <span className="block text-[1.05rem] font-bold">
                              {allergies.join(' · ')}
                            </span>
                          </span>
                        </p>
                      ) : null}

                      <p
                        className={cn(
                          'text-[1.05rem] whitespace-pre-line',
                          medicalNotes ? 'text-ink' : 'text-ink-faint',
                        )}
                      >
                        {medicalNotes || t('noNotes')}
                      </p>
                    </>
                  ) : (
                    <p className="text-[1.05rem] text-ink-faint">{t('medicalHidden')}</p>
                  )}
                </CardBody>
              </Card>

              {/* Recall was two lines of text saying "every 6 months", which is
                  the setting rather than the answer. The question anyone opening
                  this card has is *when* — so the date is worked out from the
                  last visit and coloured by whether it has already passed. */}
              <Card className={recall.overdue ? 'border-warn' : undefined}>
                <CardHeader title={t('recallTitle')} icon={<BellRing size={22} aria-hidden />} />
                <CardBody className="space-y-3">
                  {patient.recallMonths > 0 ? (
                    <>
                      <div>
                        <p className="text-[0.85rem] font-bold tracking-wide text-ink-faint uppercase">
                          {t('recallNext')}
                        </p>
                        <p
                          className={cn(
                            'text-[1.35rem] font-bold',
                            recall.overdue ? 'text-warn' : 'text-ink',
                          )}
                        >
                          {format.dateTime(recall.dueDate, {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </p>
                      </div>

                      <p className="flex flex-wrap items-center gap-2">
                        <Badge tone={recall.overdue ? 'warn' : 'brand'}>
                          {t('recallMonths', { months: patient.recallMonths })}
                        </Badge>
                        {recall.overdue ? <Badge tone="warn">{t('recallDue')}</Badge> : null}
                      </p>

                      <p className="text-[0.95rem] text-ink-soft">
                        {lastVisitDate
                          ? t('lastVisitOn', {
                              date: format.dateTime(lastVisitDate, {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                              }),
                            })
                          : t('neverSeen')}
                      </p>
                    </>
                  ) : (
                    <p className="text-[1.05rem] text-ink-faint">{t('recallOff')}</p>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'chart' ? (
        <Card>
          <CardHeader title={tt('title')} />
          <CardBody>
            {/* Under thirteen the primary arches open by themselves — a child's
                chart is unusable without them, and nobody should have to
                remember to press a button first. */}
            <DentalChart
              patientId={patient.id}
              records={teeth}
              numbering={clinicProfile.toothNumbering}
              showPrimary={patient.dateOfBirth ? age(patient.dateOfBirth) < 13 : false}
              readOnly={!canEditMedical}
              // Finding decay and planning the filling are one thought; whether
              // the chart may offer the second half is its own permission.
              canPlan={can('plan.edit')}
            />
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
                  staff={staff}
                  currentUserId={user.id}
                  today={toDateKey(today())}
                  canBook={user.permissions.includes('appointment.edit')}
                  canSpendStock={user.permissions.includes('stock.edit')}
                  // Their own recall interval, which is the answer to "when
                  // should I see you again" the record already holds. A patient
                  // with recall switched off gets no suggested date, only the
                  // empty field and the slot finder.
                  followUpDefault={
                    patient.recallMonths > 0
                      ? toDateKey(addMonths(today(), patient.recallMonths))
                      : undefined
                  }
                />
              ) : null
            }
          />
          <VisitTimeline
            canDelete={canDelete}
            numbering={clinicProfile.toothNumbering}
            now={new Date().toISOString()}
            visits={patient.visitRecords.map((visit) => ({
              id: visit.id,
              visitDate: visit.visitDate.toISOString(),
              notes: visit.notes,
              services: visit.servicesText,
              // Rows where they exist; the sentence, split, for the visits
              // recorded before `VisitService` did — otherwise a practice's
              // whole back catalogue would show no treatments at all.
              performed:
                visit.services.length > 0
                  ? visit.services.map((row) => ({
                      id: row.id,
                      name: row.name,
                      fromCatalog: row.serviceId !== null,
                    }))
                  : parseServiceList(visit.servicesText).map((name, index) => ({
                      id: `${visit.id}-${index}`,
                      name,
                      fromCatalog: false,
                    })),
              teeth: [...visit.toothRecords]
                // Only the rows that say something about the *tooth*. Probing a
                // gum creates a row too — healthy, no surfaces, holding nothing
                // but pocket depths — and the timeline draws a condition, so a
                // full periodontal examination would otherwise append thirty-two
                // teeth captioned "Healthy" to the visit that took it, none of
                // which the visit changed and none of which show the readings.
                .filter(
                  (record) =>
                    record.status !== DEFAULT_TOOTH_STATUS || record.surfaces || record.notes,
                )
                .sort((a, b) => a.toothNum - b.toothNum)
                .map((record) => ({
                  toothNum: record.toothNum,
                  status: record.status,
                  surfaces: record.surfaces ?? '',
                  notes: record.notes ?? '',
                })),
              // A consumption that spans two lots writes one movement per lot,
              // so the lines are summed back into one figure per material —
              // "composite ×2", not "composite ×1, composite ×1".
              materials: Object.values(
                visit.stockMovements.reduce<
                  Record<string, { name: string; quantity: number }>
                >((totals, movement) => {
                  const key = movement.item.name;
                  totals[key] ??= { name: key, quantity: 0 };
                  totals[key].quantity += Math.abs(movement.delta);
                  return totals;
                }, {}),
              ),
              prescriptions: prescriptionsByDay.get(toDateKey(visit.visitDate)) ?? [],
              performedBy: visit.performedBy
                ? `${visit.performedBy.firstName} ${visit.performedBy.lastName}`
                : '',
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
            action={
              can('plan.edit') ? (
                <Link
                  href={`/plans/new?patient=${patient.id}`}
                  className="btn btn-primary btn-sm"
                >
                  <ListChecks size={18} aria-hidden />
                  {tPlans('new')}
                </Link>
              ) : null
            }
          />
          <TreatmentPlans
            patientId={patient.id}
            canEdit={can('plan.edit')}
            canDelete={canDelete}
            canBook={canBook}
            services={services}
            staff={staff}
            operatories={operatories}
            charted={teeth}
            numbering={clinicProfile.toothNumbering}
            titles={planTitles}
            // Booking a step is a diary action, so it needs the diary's own
            // collections. Built here as elements keyed by step rather than
            // handed down as a render prop: the step list is a client component
            // now — it has to be, to move a step without a round trip — and a
            // function cannot cross that boundary.
            bookSlots={planBookSlots}
            plans={patient.plans.map((plan) => ({
              id: plan.id,
              title: plan.title,
              notes: plan.notes ?? '',
              status: plan.status,
              steps: plan.steps.map((step) => ({
                id: step.id,
                title: step.title,
                toothNum: step.toothNum,
                notes: step.notes ?? '',
                status: step.status,
                serviceId: step.serviceId,
                linked: step.appointmentId !== null,
                // The same test the practice-wide list applies, from the same
                // function: a slot that has been and gone, or that the patient
                // cancelled, is history rather than the date this step is
                // waiting for.
                booked: isPromisedSlot(step.appointment, today())
                  ? { date: step.appointment.date, startTime: step.appointment.startTime }
                  : null,
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
              can('document.edit') ? (
                <DocumentUploadDialog
                  patientId={patient.id}
                  charted={teeth}
                  numbering={clinicProfile.toothNumbering}
                />
              ) : null
            }
          />
          <DocumentGallery
            patientId={patient.id}
            canUpload={can('document.edit')}
            canDelete={can('document.delete')}
            documents={otherDocuments.map((document) => ({
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
                  templates={templateOptions}
                  recent={recentWork}
                  todayLabel={todayLabel}
                  canManageTemplates={can('prescription.edit')}
                />
              ) : null
            }
          />
          <PrescriptionList
            patientId={patient.id}
            patientName={fullName}
            canIssue={can('prescription.edit')}
            canDelete={canDelete}
            templates={templateOptions}
            recent={recentWork}
            todayLabel={todayLabel}
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
                  services={services}
                  staff={staff}
                  operatories={operatories}
                  defaultPatient={{ id: patient.id, name: fullName, phone: patient.phone }}
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
            <div className="space-y-3 p-3">
              {appointments.map((appointment) => (
                <AppointmentRow
                  key={appointment.id}
                  appointment={appointment}
                  services={services}
                  showDate
                />
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {tab === 'contacts' ? (
        <Card>
          <CardHeader title={t('tabContacts')} subtitle={tcontacts('subtitle')} />
          <ContactHistory
            contacts={patient.contacts.map((contact) => ({
              id: contact.id,
              channel: contact.channel,
              purpose: contact.purpose,
              body: contact.body,
              createdAt: contact.createdAt.toISOString(),
              actorName: contact.actor
                ? `${contact.actor.firstName} ${contact.actor.lastName}`
                : '',
              appointment: contact.appointment
                ? { date: toDateKey(contact.appointment.date), startTime: contact.appointment.startTime }
                : null,
            }))}
          />
        </Card>
      ) : null}
    </ToothDefsProvider>
  );
}

/**
 * One fact about the patient, as a tile.
 *
 * The blank state is the point of the `empty` prop: a fact nobody has recorded
 * is shown greyed rather than dropped, because "no emergency contact" is
 * information and an absent row is not.
 */
function Fact({
  icon,
  label,
  value,
  note,
  href,
  empty,
  mono = false,
  copy,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  /** A second line — the age under a birthday, the phone under a guardian. */
  note?: string;
  /**
   * Makes the value a `tel:` / `mailto:` link.
   *
   * Kept, and no longer trusted on its own. On a tablet it is the fastest thing
   * on this card; on a desktop with no handler registered for the scheme it is
   * a link that does nothing and says nothing, which is why anything using this
   * should also pass `copy`. See `ContactActions` for the long version.
   */
  href?: string;
  /** Shown, faint, when there is no value. */
  empty: string;
  /** Fiscal codes are read character by character, so they are set in figures. */
  mono?: boolean;
  /** The route that always works: put it on the clipboard. */
  copy?: { label: string; copiedLabel: string };
}) {
  const body = (
    <span className={cn('block truncate', mono && 'font-mono tracking-tight')}>
      {value || empty}
    </span>
  );

  return (
    <div className="flex min-w-0 items-start gap-3 bg-surface px-5 py-3.5">
      <span
        aria-hidden
        className={cn(
          'mt-0.5 grid size-9 shrink-0 place-items-center rounded-full',
          value ? 'bg-brand-soft text-brand-deep' : 'bg-paper text-ink-faint',
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.82rem] font-bold tracking-wide text-ink-faint uppercase">{label}</p>
        <div className="flex min-w-0 items-center gap-1">
          <p
            className={cn(
              'min-w-0 flex-1 text-[1.02rem] font-semibold',
              value ? 'text-ink' : 'text-ink-faint',
            )}
          >
            {href && value ? (
              <a href={href} className="no-underline hover:text-brand-deep hover:underline">
                {body}
              </a>
            ) : (
              body
            )}
          </p>
          {copy && value ? (
            <CopyButton
              value={value}
              label={copy.label}
              copiedLabel={copy.copiedLabel}
              showLabel={false}
              className="btn btn-ghost btn-sm shrink-0 px-2"
            />
          ) : null}
        </div>
        {note ? <p className="truncate text-[0.9rem] text-ink-soft">{note}</p> : null}
      </div>
    </div>
  );
}
