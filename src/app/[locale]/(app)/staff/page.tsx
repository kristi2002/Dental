import { LockOpen, Power, ShieldCheck, UserPlus, Users } from 'lucide-react';
import type { Metadata } from 'next';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { RoleBadge } from '@/components/auth/RoleBadge';
import { BackupCard } from '@/components/staff/BackupCard';
import { BackupCheckCard } from '@/components/staff/BackupCheckCard';
import { BackupStatusCard } from '@/components/staff/BackupStatusCard';
import { JobsCard } from '@/components/staff/JobsCard';
import { StaffFormDialog } from '@/components/staff/StaffFormDialog';
import { ActionForm } from '@/components/ui/ActionForm';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Link } from '@/i18n/navigation';
import { Role } from '@/generated/prisma/enums';
import { setStaffActive, unlockStaff } from '@/lib/actions/staff';
import { requirePermission } from '@/lib/auth/guard';
import { ROLE_ORDER, ROLE_PERMISSIONS } from '@/lib/auth/permissions';
import { getBackupStatus } from '@/lib/backup-status';
import { getJobBoard } from '@/lib/jobs/board';
import { prisma } from '@/lib/prisma';
import { cn, initials } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'staff' });
  return { title: t('title') };
}

export default async function StaffPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const currentUser = await requirePermission('staff.manage');

  const t = await getTranslations('staff');
  const tp = await getTranslations('permissions');
  const format = await getFormatter();

  const staff = await prisma.staffUser.findMany({
    orderBy: [{ active: 'desc' }, { role: 'asc' }, { firstName: 'asc' }],
  });

  const now = new Date();
  const activeOwners = staff.filter((s) => s.role === Role.OWNER && s.active).length;

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Link href="/staff/new" className="btn btn-primary">
            <UserPlus size={20} aria-hidden />
            {t('new')}
          </Link>
        }
        trail={[{ label: t('title') }]}
      />

      <div className="space-y-6">
        <Card>
          <CardHeader title={t('people')} icon={<Users size={22} aria-hidden />} />

          <ul className="divide-y-2 divide-line">
            {staff.map((person) => {
              const locked = Boolean(person.lockedUntil && person.lockedUntil > now);
              // Never offer the click that would leave nobody able to manage staff.
              const isLastOwner = person.role === Role.OWNER && person.active && activeOwners === 1;

              return (
                <li
                  key={person.id}
                  className={cn(
                    'flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4',
                    !person.active && 'opacity-60',
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      aria-hidden
                      className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-soft text-body font-bold text-brand-deep"
                    >
                      {initials(person.firstName, person.lastName)}
                    </span>

                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-lead font-bold text-ink">
                          {person.firstName} {person.lastName}
                        </span>
                        <RoleBadge role={person.role} />
                        {person.id === currentUser.id ? (
                          <Badge tone="neutral">{t('you')}</Badge>
                        ) : null}
                        {!person.active ? <Badge tone="danger">{t('disabled')}</Badge> : null}
                        {locked ? <Badge tone="warn">{t('locked')}</Badge> : null}
                      </p>
                      <p className="mt-0.5 text-meta text-ink-soft">
                        {person.lastLoginAt
                          ? t('lastSeen', {
                              when: format.dateTime(person.lastLoginAt, {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              }),
                            })
                          : t('neverSignedIn')}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <StaffFormDialog
                      staff={{
                        id: person.id,
                        firstName: person.firstName,
                        lastName: person.lastName,
                        role: person.role,
                      }}
                    />

                    {locked ? (
                      <ActionForm action={unlockStaff} values={{ id: person.id }}>
                        <button type="submit" className="btn btn-secondary btn-sm">
                          <LockOpen size={17} aria-hidden />
                          {t('unlock')}
                        </button>
                      </ActionForm>
                    ) : null}

                    {isLastOwner ? (
                      <span className="text-meta text-ink-faint">{t('lastOwnerHint')}</span>
                    ) : (
                      <ActionForm
                        action={setStaffActive}
                        values={{ id: person.id, active: person.active ? '0' : '1' }}
                        confirmMessage={person.active ? t('confirmDisable') : undefined}
                      >
                        <button
                          type="submit"
                          className={cn(
                            'btn btn-sm',
                            person.active ? 'btn-danger' : 'btn-secondary',
                          )}
                        >
                          <Power size={17} aria-hidden />
                          {person.active ? t('disable') : t('enable')}
                        </button>
                      </ActionForm>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* The permission matrix, visible rather than buried in code — the owner
            can answer "can the receptionist see medical notes?" without asking. */}
        <Card>
          <CardHeader title={t('matrixTitle')} icon={<ShieldCheck size={22} aria-hidden />} />

          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-line">
                  <th className="px-5 py-3 text-meta font-bold tracking-wide text-ink-faint uppercase">
                    {t('capability')}
                  </th>
                  {ROLE_ORDER.map((role) => (
                    <th key={role} className="px-3 py-3 text-center">
                      <RoleBadge role={role} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROLE_PERMISSIONS[Role.OWNER].map((permission) => (
                  <tr key={permission} className="border-b border-line last:border-b-0">
                    <td className="px-5 py-2.5 text-body text-ink">{tp(permission)}</td>
                    {ROLE_ORDER.map((role) => {
                      const allowed = ROLE_PERMISSIONS[role].includes(permission);
                      return (
                        <td key={role} className="px-3 py-2.5 text-center">
                          <span
                            className={cn(
                              'text-lead font-bold',
                              allowed ? 'text-ok' : 'text-line-strong',
                            )}
                          >
                            {allowed ? '✓' : '—'}
                          </span>
                          <span className="sr-only">
                            {allowed ? t('allowed') : t('notAllowed')}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* The automatic copy first, then the manual one. The order is the
            argument: the export below is what somebody takes deliberately, the
            card above is what happens whether anyone remembers or not, and only
            one of those is a backup strategy. */}
        {/* The clock, above the copies. Both are things that happen with nobody
            present and both were invisible until somebody built them a screen —
            but this one is the older gap: the backup grew a status file, while
            the jobs had a whole table whose own comment claimed it was being
            read by pages that did not exist.

            Gated on `staff.manage` rather than on `backup.export`, because it
            is not about backups: it is the deployment reporting on itself, and
            **Run now** writes rows. This page already requires that permission,
            so the check is the page's rather than a second one here. */}
        <JobsCard jobs={await getJobBoard()} />

        {currentUser.permissions.includes('backup.export') ? (
          <>
            <BackupStatusCard status={await getBackupStatus()} />
            <BackupCard />
            {/* Directly under the card that makes them, because it answers the
                question that card leaves hanging: the file downloaded, and then
                what? An untested backup is a hope — the Sunday drill proves the
                automatic copies, and until now nothing proved the one an owner
                keeps on a memory stick. */}
            <BackupCheckCard />
          </>
        ) : null}
      </div>
    </>
  );
}
