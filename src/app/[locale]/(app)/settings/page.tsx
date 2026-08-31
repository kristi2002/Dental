import { Armchair, Building2, CalendarClock, CalendarOff, Plus, Power, Send, Trash2 } from 'lucide-react';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { ClinicHoursForm } from '@/components/settings/ClinicHoursForm';
import { CalendarFeedCard } from '@/components/settings/CalendarFeedCard';
import { ClinicProfileForm } from '@/components/settings/ClinicProfileForm';
import { ClosureFormDialog } from '@/components/settings/ClosureFormDialog';
import { MailerCard } from '@/components/settings/MailerCard';
import { OperatoryFormDialog } from '@/components/settings/OperatoryFormDialog';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { deleteClosure, setOperatoryActive } from '@/lib/actions/settings';
import { requirePermission } from '@/lib/auth/guard';
import { CLINIC_TIME_ZONE, toDateKey, today } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { calendarToken, calendarUrl } from '@/lib/calendar-feed';
import { getClinicProfile, getClinicWeek, getProviderOptions } from '@/lib/queries';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'settings' });
  return { title: t('title') };
}

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requirePermission('settings.view');
  const canEdit = user.permissions.includes('settings.edit');

  const t = await getTranslations('settings');
  const tc = await getTranslations('common');
  const format = await getFormatter();

  const now = today();
  const [week, closures, operatories, staff, profile] = await Promise.all([
    getClinicWeek(),
    // Past closures are history nobody acts on; keeping the list to what is
    // still ahead is what makes it scannable in December.
    prisma.closure.findMany({
      where: { to: { gte: now } },
      orderBy: { from: 'asc' },
      include: { staffUser: { select: { firstName: true, lastName: true } } },
    }),
    prisma.operatory.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    getProviderOptions(),
    getClinicProfile(),
  ]);

  // Personal to whoever is reading the page — a feed is one person's diary.
  // The version is what "regenerate" bumps; the link below is only ever the
  // current one, so a revoked URL cannot be recovered by reloading this page.
  const feedOwner = await prisma.staffUser.findUnique({
    where: { id: user.id },
    select: { calendarFeedVersion: true },
  });
  const feedUrl = calendarUrl(
    await calendarToken(user.id, feedOwner?.calendarFeedVersion ?? 1),
  );

  // Rendered here rather than in the form: the locale's own calendar data is
  // the right source for a weekday name, but producing it in the browser made
  // it the one string in the app whose server and client renders could differ.
  // 2024-01-07 was a Sunday, so adding the index lands on the right day.
  const weekdayNames = Object.fromEntries(
    [0, 1, 2, 3, 4, 5, 6].map((weekday) => [
      weekday,
      format.dateTime(new Date(Date.UTC(2024, 0, 7 + weekday)), { weekday: 'long' }),
    ]),
  );

  const dayLabel = (date: Date) =>
    format.dateTime(date, { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      <PageHeader title={t('title')} subtitle={t('subtitle')} trail={[{ label: t('title') }]} />

      <div className="space-y-6">
        <Card>
          <CardHeader
            title={t('practiceTitle')}
            subtitle={t('practiceSubtitle')}
            icon={<Building2 size={22} aria-hidden />}
          />
          <ClinicProfileForm
            name={profile.name}
            toothNumbering={profile.toothNumbering}
            currency={profile.currency}
            phone={profile.phone ?? ''}
            email={profile.email ?? ''}
            address={profile.address ?? ''}
            canEdit={canEdit}
          />
        </Card>

        <Card>
          <CardHeader
            title={t('feedTitle')}
            subtitle={t('feedSubtitle')}
            icon={<CalendarClock size={22} aria-hidden />}
          />
          <CalendarFeedCard url={feedUrl} />
        </Card>

        {/* Beside the feed rather than under the profile: both are "this
            practice talks to something outside itself", and both fail in the
            same quiet way — a link nobody subscribed to, an address nobody
            receives. */}
        <Card>
          <CardHeader
            title={t('mailTitle')}
            subtitle={t('mailSubtitle')}
            icon={<Send size={22} aria-hidden />}
          />
          <MailerCard canEdit={canEdit} />
        </Card>

        <Card>
          <CardHeader
            title={t('hoursTitle')}
            subtitle={t('hoursSubtitle', { zone: CLINIC_TIME_ZONE })}
            icon={<CalendarClock size={22} aria-hidden />}
          />
          <ClinicHoursForm week={week} canEdit={canEdit} weekdayNames={weekdayNames} />
        </Card>

        {/* Chairs, not rooms: what limits parallel work is the seat with the
            drill next to it. Retired rather than deleted, so last year's
            schedule still says where a treatment happened. */}
        <Card>
          <CardHeader
            title={t('operatoriesTitle')}
            subtitle={t('operatoriesSubtitle')}
            icon={<Armchair size={22} aria-hidden />}
            action={
              canEdit ? (
                <Link href="/settings/operatories/new" className="btn btn-primary btn-sm">
                  <Plus size={18} aria-hidden />
                  {t('operatoryNew')}
                </Link>
              ) : undefined
            }
          />

          {operatories.length === 0 ? (
            <EmptyState icon={<Armchair size={40} aria-hidden />} title={t('operatoriesEmpty')} />
          ) : (
            <ul className="divide-y divide-line">
              {operatories.map((room) => (
                <li
                  key={room.id}
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5',
                    !room.active && 'opacity-60',
                  )}
                >
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-lead font-bold text-ink">{room.name}</span>
                    {!room.active ? <Badge tone="neutral">{t('operatoryRetired')}</Badge> : null}
                  </p>

                  {canEdit ? (
                    <div className="flex items-center gap-2">
                      <OperatoryFormDialog operatory={{ id: room.id, name: room.name }} />
                      <ActionForm
                        action={setOperatoryActive}
                        values={{ id: room.id, active: room.active ? '0' : '1' }}
                      >
                        <button
                          type="submit"
                          className={cn('btn btn-sm', room.active ? 'btn-danger' : 'btn-secondary')}
                        >
                          <Power size={17} aria-hidden />
                          {room.active ? t('operatoryRetire') : t('operatoryRestore')}
                        </button>
                      </ActionForm>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title={t('closuresTitle')}
            subtitle={t('closuresSubtitle')}
            icon={<CalendarOff size={22} aria-hidden />}
            action={canEdit ? <ClosureFormDialog staff={staff} /> : undefined}
          />

          {closures.length === 0 ? (
            <EmptyState
              icon={<CalendarOff size={40} aria-hidden />}
              title={t('closuresEmpty')}
            />
          ) : (
            <ul className="divide-y divide-line">
              {closures.map((closure) => {
                const single = toDateKey(closure.from) === toDateKey(closure.to);

                return (
                  <li
                    key={closure.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="text-lead font-bold text-ink">
                          {closure.reason}
                        </span>
                        {closure.staffUser ? (
                          <Badge tone="neutral">
                            {closure.staffUser.firstName} {closure.staffUser.lastName}
                          </Badge>
                        ) : (
                          <Badge tone="warn">{t('closureWholePractice')}</Badge>
                        )}
                        {closure.from <= now && now <= closure.to ? (
                          <Badge tone="warn">{t('closureNow')}</Badge>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-body text-ink-soft tabular-nums">
                        {single
                          ? dayLabel(closure.from)
                          : `${dayLabel(closure.from)} – ${dayLabel(closure.to)}`}
                      </p>
                    </div>

                    {canEdit ? (
                      <div className="flex items-center gap-2">
                        <ClosureFormDialog
                          staff={staff}
                          closure={{
                            id: closure.id,
                            from: toDateKey(closure.from),
                            to: toDateKey(closure.to),
                            reason: closure.reason,
                            staffUserId: closure.staffUserId ?? '',
                          }}
                        />
                        <ActionForm
                          action={deleteClosure}
                          values={{ id: closure.id }}
                          confirmMessage={tc('confirmDelete')}
                        >
                          <button type="submit" className="btn btn-danger btn-sm">
                            <Trash2 size={18} aria-hidden />
                            <span className="sr-only">{tc('delete')}</span>
                          </button>
                        </ActionForm>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
