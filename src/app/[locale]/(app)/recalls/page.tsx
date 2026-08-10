import { BellRing, HeartPulse } from 'lucide-react';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { RecallCard } from '@/components/recalls/RecallCard';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { requirePermission } from '@/lib/auth/guard';
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

  const t = await getTranslations('recalls');
  const tr = await getTranslations('reminders');
  const format = await getFormatter();

  const [recalls, followUps] = await Promise.all([getRecalls(), getFollowUps()]);

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
