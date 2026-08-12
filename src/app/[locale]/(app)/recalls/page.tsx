import { BellRing, HeartPulse } from 'lucide-react';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { RecallCard } from '@/components/recalls/RecallCard';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { AppointmentFormDialog } from '@/components/appointments/AppointmentFormDialog';
import { requirePermission } from '@/lib/auth/guard';
import { toDateKey, today } from '@/lib/dates';
import { getOperatoryOptions, getProviderOptions, getServiceOptions } from '@/lib/queries';
import { getFollowUps, getRecalls } from '@/lib/recalls';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'recalls' });
  return { title: t('title') };
}

export default async function RecallsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('recall.view');
  const canSend = user.permissions.includes('recall.send');
  const canBook = user.permissions.includes('appointment.edit');

  const t = await getTranslations('recalls');
  const ta = await getTranslations('appointments');
  const tr = await getTranslations('reminders');
  const format = await getFormatter();

  const [recalls, followUps, services, staff, operatories] = await Promise.all([
    getRecalls(),
    getFollowUps(),
    canBook ? getServiceOptions() : Promise.resolve([]),
    canBook ? getProviderOptions() : Promise.resolve([]),
    canBook ? getOperatoryOptions() : Promise.resolve([]),
  ]);

  /** The one action this list exists to produce. */
  const bookFor = (row: { id: string; firstName: string; lastName: string; phone: string }) =>
    canBook ? (
      <AppointmentFormDialog
        services={services}
        staff={staff}
        operatories={operatories}
        defaultPatient={{
          id: row.id,
          name: `${row.lastName} ${row.firstName}`,
          phone: row.phone,
        }}
        defaultDate={toDateKey(today())}
        triggerClassName="btn btn-secondary btn-sm"
        triggerLabel={ta('new')}
      />
    ) : undefined;

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="space-y-6">
        <Card>
          <CardHeader
            title={t('dueTitle')}
            subtitle={t('dueSubtitle', { count: recalls.length })}
            icon={<BellRing size={22} aria-hidden />}
          />

          {recalls.length === 0 ? (
            <EmptyState icon={<BellRing size={40} aria-hidden />} title={t('dueEmpty')} />
          ) : (
            <ul className="divide-y-2 divide-line">
              {recalls.map((row) => {
                const values = {
                  name: row.firstName,
                  months: row.monthsSince,
                  last: row.lastVisit
                    ? format.dateTime(new Date(`${row.lastVisit}T00:00:00.000Z`), {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    : t('neverVisited'),
                };

                return (
                  <RecallCard
                    key={row.id}
                    {...row}
                    // Two weeks late is a nudge; half a year late is a problem.
                    tone={row.overdueDays > 180 ? 'danger' : 'warn'}
                    detail={t('overdueBy', { days: row.overdueDays })}
                    message={tr('recallWhatsapp', values)}
                    emailSubject={tr('recallEmailSubject', values)}
                    emailBody={tr('recallEmailBody', values)}
                    canSend={canSend}
                    book={bookFor(row)}
                  />
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title={t('followUpTitle')}
            subtitle={t('followUpSubtitle', { count: followUps.length })}
            icon={<HeartPulse size={22} aria-hidden />}
          />

          {followUps.length === 0 ? (
            <EmptyState icon={<HeartPulse size={40} aria-hidden />} title={t('followUpEmpty')} />
          ) : (
            <ul className="divide-y-2 divide-line">
              {followUps.map((row) => {
                const values = {
                  name: row.firstName,
                  days: row.daysSince,
                  services: row.services || t('theTreatment'),
                };

                return (
                  <RecallCard
                    key={row.id}
                    {...row}
                    tone="brand"
                    detail={t('daysAgo', { days: row.daysSince })}
                    message={tr('followUpWhatsapp', values)}
                    emailSubject={tr('followUpEmailSubject', values)}
                    emailBody={tr('followUpEmailBody', values)}
                    canSend={canSend}
                    book={bookFor(row)}
                  />
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
