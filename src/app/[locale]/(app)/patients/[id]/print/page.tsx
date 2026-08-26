import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { SheetHead } from '@/components/brand/SheetHead';
import { ChartSheet } from '@/components/dental/ChartSheet';
import type { ToothRecordMap } from '@/components/dental/DentalChart';
import { ToothDefsProvider } from '@/components/dental/ToothDefsProvider';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import { PrintButton } from '@/components/prescriptions/PrintButton';
import { TreatmentPlanStatus } from '@/generated/prisma/enums';
import { recordView, requirePermission } from '@/lib/auth/guard';
import { age } from '@/lib/dates';
import { planProgress } from '@/lib/plan-progress';
import { prisma } from '@/lib/prisma';
import { getClinicProfile } from '@/lib/queries';
import { dentitionOf } from '@/lib/teeth';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'patients' });
  return { title: t('recordTitle') };
}

/**
 * The whole record on paper.
 *
 * A patient record lived in six tabs, which is the right shape for reading one
 * on a screen and the wrong shape entirely for the handful of times a year the
 * practice has to hand the record *over*: a referral to a surgeon, a request
 * from the patient for their own file, a specialist asking what has been done.
 * Printing the screen produced one tab. So the record left the building as six
 * separate printouts, or as a summary typed out by hand.
 *
 * This is the record as one document, in the order somebody who has never met
 * the patient reads it: who they are, what they react to, what is in their
 * mouth, what is planned, and what has been done.
 *
 * ## The medical half is gated, and the file says so
 *
 * `patient.medical.view` is what separates the front desk from the clinical
 * record, and this sheet honours it: without the permission the allergy and
 * history sections are replaced by a line saying they were withheld, rather
 * than silently omitted. A referral letter that is quietly missing its medical
 * history is more dangerous than one that says it is incomplete.
 */
export default async function PatientRecordPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('patient.view');
  const canSeeMedical = user.permissions.includes('patient.medical.view');

  const t = await getTranslations('patients');
  const tt = await getTranslations('teeth');
  const tpl = await getTranslations('plans');
  const ta = await getTranslations('alerts');
  const format = await getFormatter();

  const [patient, profile] = await Promise.all([
    prisma.patient.findUnique({
      where: { id },
      include: {
        teethRecords: true,
        plans: {
          orderBy: { createdAt: 'desc' },
          include: { steps: { orderBy: { position: 'asc' } } },
        },
        visitRecords: {
          orderBy: { visitDate: 'desc' },
          include: {
            services: { include: { service: { select: { name: true } } } },
            performedBy: { select: { firstName: true, lastName: true } },
          },
        },
        alerts: { orderBy: { createdAt: 'desc' } },
      },
    }),
    getClinicProfile(),
  ]);

  if (!patient) notFound();

  await recordView(user, {
    entity: 'patient',
    entityId: patient.id,
    summary: `Printed the full record for ${patient.lastName} ${patient.firstName}`,
  });

  // The same mapping the patient's own chart tab builds, including the charted
  // date — a finding from two years ago and one from this morning are the same
  // colour on the drawing and two very different conversations.
  const teeth: ToothRecordMap = Object.fromEntries(
    patient.teethRecords.map((record) => [
      record.toothNum,
      {
        status: record.status,
        notes: record.notes ?? '',
        surfaces: record.surfaces ?? '',
        mobility: record.mobility,
        pockets: record.pockets,
        bleeding: record.bleeding,
        chartedOn: format.dateTime(record.updatedAt, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
      },
    ]),
  );

  /**
   * Whether the milk teeth are drawn.
   *
   * The screen chart asks the patient's age, which is the right question while
   * charting: an eight-year-old's primary teeth are what you are about to write
   * on. A record leaving the building is read the other way round — what is on
   * the chart, whoever it belongs to. So an extracted `65` still prints on a
   * thirty-year-old's sheet rather than being filed out of existence by a
   * birthday.
   */
  const showsPrimary =
    (patient.dateOfBirth !== null && age(patient.dateOfBirth) < 13) ||
    patient.teethRecords.some((record) => dentitionOf(record.toothNum) === 'PRIMARY');

  const day = (value: Date) =>
    format.dateTime(value, { day: 'numeric', month: 'long', year: 'numeric' });

  const fullName = `${patient.lastName} ${patient.firstName}`;

  return (
    <ToothDefsProvider>
      <div className="mx-auto max-w-[52rem]">
        <div
          className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden"
          data-print-hide
        >
          <Breadcrumbs
            items={[
              { href: '/patients', label: t('title') },
              { href: `/patients/${patient.id}`, label: fullName },
              { label: t('recordTitle') },
            ]}
          />
          <PrintButton label={t('recordPrint')} />
        </div>

        <article className="card p-8 print:border-0 print:p-0 print:shadow-none">
          <SheetHead profile={profile} title={t('recordTitle')} meta={day(new Date())} />

          <h1 className="text-2xl font-bold text-ink">{fullName}</h1>

          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[1.02rem] sm:grid-cols-[auto_1fr_auto_1fr]">
            {patient.dateOfBirth ? (
              <Row
                label={t('dateOfBirth')}
                value={`${day(patient.dateOfBirth)} · ${t('age', { age: age(patient.dateOfBirth) })}`}
              />
            ) : null}
            <Row label={t('phone')} value={patient.phone} />
            <Row label={t('email')} value={patient.email} />
            <Row label={t('address')} value={patient.address} />
            <Row label={t('fiscalCode')} value={patient.fiscalCode} />
            <Row label={t('guardianName')} value={patient.guardianName} />
            <Row label={t('guardianPhone')} value={patient.guardianPhone} />
            <Row label={t('emergencyContact')} value={patient.emergencyContact} />
            <Row label={t('registeredLabel')} value={day(patient.createdAt)} />
          </dl>

          {/* Ahead of everything clinical, because it is the one thing on this
              sheet that changes what a reader is allowed to do next. The
              patient's own page puts alerts at the top for the same reason. */}
          <Section title={t('alertsTitle')}>
            {canSeeMedical ? (
              patient.alerts.length > 0 ? (
                <ul className="space-y-1.5">
                  {patient.alerts.map((alert) => (
                    <li key={alert.id} className="text-[1.02rem] font-semibold text-ink">
                      {/* Composed exactly as `PatientAlerts` composes it on the
                          screen — "Allergy: penicillin" — so the printed sheet
                          and the record it came from say the same words. */}
                      {ta(`kind_${alert.kind}`)}
                      {alert.substance ? `: ${alert.substance}` : ''}
                      <span className="font-normal text-ink-soft">
                        {' '}
                        · {ta(`severity_${alert.severity}`)}
                      </span>
                      {alert.notes ? (
                        <span className="block font-normal text-ink-soft">{alert.notes}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>{t('recordNoAlerts')}</Empty>
              )
            ) : (
              <Withheld>{t('medicalHidden')}</Withheld>
            )}
          </Section>

          {canSeeMedical && patient.medicalNotes ? (
            <Section title={t('medicalNotes')}>
              <p className="text-[1.02rem] whitespace-pre-wrap text-ink">{patient.medicalNotes}</p>
            </Section>
          ) : null}

          <Section title={tt('title')}>
            {/* Not the chart component in a read-only mode. `readOnly` takes the
                editing away and leaves the *shape* of a screen — a findings
                panel that scrolls, two examinations behind a toggle, notes
                clamped at three lines — and every one of those loses its
                contents to a printer. `ChartSheet` is the same record stated
                flat; see the note on it. */}
            <ChartSheet
              records={teeth}
              numbering={profile.toothNumbering}
              showPrimary={showsPrimary}
            />
          </Section>

          <Section title={tpl('allTitle')}>
            {patient.plans.length === 0 ? (
              <Empty>{t('recordNoPlans')}</Empty>
            ) : (
              <ul className="space-y-3">
                {patient.plans.map((plan) => {
                  const progress = planProgress(plan.steps);
                  return (
                    <li key={plan.id} className="border-b border-line pb-3 last:border-0">
                      <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="text-[1.05rem] font-bold text-ink">{plan.title}</span>
                        <span className="text-[0.95rem] font-semibold text-ink-soft tabular-nums">
                          {tpl('progress', { done: progress.done, total: progress.relevant })}
                          {plan.status === TreatmentPlanStatus.ACTIVE
                            ? ''
                            : ` · ${tpl(`status_${plan.status}`)}`}
                        </span>
                      </p>
                      {plan.notes ? (
                        <p className="mt-0.5 text-[0.95rem] text-ink-soft">{plan.notes}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section title={t('visitHistory')}>
            {!canSeeMedical ? (
              <Withheld>{t('medicalHidden')}</Withheld>
            ) : patient.visitRecords.length === 0 ? (
              <Empty>{t('noVisits')}</Empty>
            ) : (
              <ul className="space-y-3">
                {patient.visitRecords.map((visit) => (
                  <li key={visit.id} className="border-b border-line pb-3 last:border-0">
                    <p className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-[1.02rem] font-bold text-ink tabular-nums">
                        {day(visit.visitDate)}
                      </span>
                      {visit.performedBy ? (
                        <span className="text-[0.92rem] text-ink-faint">
                          {visit.performedBy.firstName} {visit.performedBy.lastName}
                        </span>
                      ) : null}
                    </p>
                    {/* The linked catalogue rows when there are any, and the
                        snapshot the visit was written with when there are not —
                        an older visit predates the link table and would
                        otherwise print as a date with nothing under it. */}
                    {named(visit.services) ? (
                      <p className="mt-0.5 text-[1rem] text-ink">{named(visit.services)}</p>
                    ) : visit.servicesText ? (
                      <p className="mt-0.5 text-[1rem] text-ink">{visit.servicesText}</p>
                    ) : null}
                    {visit.notes ? (
                      <p className="mt-0.5 text-[0.95rem] whitespace-pre-wrap text-ink-soft">
                        {visit.notes}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </article>
      </div>
    </ToothDefsProvider>
  );
}

/**
 * The catalogue names a visit is linked to, joined for one line.
 *
 * `service` is nullable — the link survives a treatment being deleted from the
 * catalogue (`onDelete: SetNull`), which leaves a row pointing at nothing. Those
 * are dropped rather than printed as a gap, and a visit whose every link has
 * been orphaned falls back to the text it was written with.
 */
function named(services: ReadonlyArray<{ service: { name: string } | null }>): string {
  return services
    .map((entry) => entry.service?.name)
    .filter((name): name is string => Boolean(name))
    .join(' · ');
}

/** One labelled fact. Omitted entirely when there is nothing to say. */
function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <>
      <dt className="font-bold whitespace-nowrap text-ink-faint">{label}</dt>
      <dd className="min-w-0 text-ink">{value}</dd>
    </>
  );
}

/**
 * A heading and a rule.
 *
 * `break-inside-avoid` keeps a short section from being split across the fold —
 * an allergy list with its heading on page one and its contents on page two is
 * the failure this sheet exists to prevent.
 */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7 break-inside-avoid">
      <h2 className="mb-2.5 border-b border-line pb-1 text-[0.88rem] font-bold tracking-wide text-ink-faint uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[0.98rem] text-ink-faint">{children}</p>;
}

/**
 * Said out loud rather than left blank. A section missing because the reader
 * lacked a permission looks exactly like a section that is empty, and on a
 * referral those two mean opposite things.
 */
function Withheld({ children }: { children: ReactNode }) {
  return <p className="text-[0.98rem] text-ink-faint italic">{children}</p>;
}
