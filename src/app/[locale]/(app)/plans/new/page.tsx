import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { NewPlanForm } from '@/components/plans/NewPlanForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { requirePermission } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import { getClinicProfile, getServiceOptions } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'plans' });
  return { title: t('new') };
}

/**
 * Writing a course of treatment.
 *
 * Needs `plan.edit` rather than `plan.view`: there is nothing to read here, so
 * somebody without the permission would only be able to build the plan and be
 * refused at the save.
 *
 * `?patient=` is how the patient's own plans tab hands over who this is for. It
 * is a hint, not a requirement — arriving without one is the practice-wide plans
 * list asking, which is the case the picker exists for.
 */
export default async function NewPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ patient?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission('plan.edit');

  const t = await getTranslations('plans');
  const tc = await getTranslations('common');

  const { patient: patientId } = await searchParams;

  const [services, clinicProfile, titleRows, patient] = await Promise.all([
    getServiceOptions(),
    getClinicProfile(),
    // Plan names the practice has already used, suggested on the next one so
    // "Upper right quadrant" does not become four differently worded plans.
    prisma.treatmentPlan.findMany({
      distinct: ['title'],
      orderBy: { title: 'asc' },
      take: 40,
      select: { title: true },
    }),
    // The chart comes with the patient, because the findings on it are what this
    // form offers as steps. A `?patient=` that names nobody falls back to asking.
    patientId
      ? prisma.patient.findUnique({
          where: { id: patientId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            teethRecords: { select: { toothNum: true, status: true, surfaces: true } },
          },
        })
      : Promise.resolve(null),
  ]);

  const charted = Object.fromEntries(
    (patient?.teethRecords ?? []).map((record) => [
      record.toothNum,
      { status: record.status, surfaces: record.surfaces ?? '' },
    ]),
  );

  const backHref = patient ? `/patients/${patient.id}?tab=plans` : '/plans';
  const patientName = patient ? `${patient.lastName} ${patient.firstName}`.trim() : '';

  return (
    <>
      <PageHeader
        title={t('new')}
        // Whose plan this is, said once at the top. Arriving from a patient's own
        // record means the question is never asked again on this screen, so the
        // answer has to be visible somewhere — otherwise a plan can be built and
        // saved without ever seeing the name it will be filed under.
        subtitle={patient ? t('newSubtitleFor', { name: patientName }) : t('newSubtitle')}
        trail={[{ href: '/plans', label: t('allTitle') }, { label: t('new') }]}
        actions={
          <Link href={backHref} className="btn btn-secondary">
            <ArrowLeft size={18} aria-hidden />
            {tc('back')}
          </Link>
        }
      />

      <NewPlanForm
        defaultPatient={
          patient ? { id: patient.id, name: patientName, phone: patient.phone } : undefined
        }
        services={services}
        charted={charted}
        numbering={clinicProfile.toothNumbering}
        titles={titleRows.map((row) => row.title)}
      />
    </>
  );
}
