import { ShieldAlert } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import type { BackupStatus } from '@/lib/backup-status';

/**
 * The bar that appears when the backups stop.
 *
 * This is the entire reason the sidecar writes a status file. A backup that
 * fails quietly is worse than none, because it buys the clinic months of
 * confidence it has not earned — and the only cure is for the failure to end up
 * in front of a person who can act on it, on a screen they open anyway, rather
 * than in a container log nobody reads.
 *
 * **Shown only to whoever can do something about it.** A receptionist cannot
 * fix a bucket credential, and a red bar they must look past every morning is
 * how a practice learns to look past red bars. `backup.export` is the owner's
 * permission and nobody else's, which makes it the right question to ask.
 */
export async function BackupBanner({ status }: { status: BackupStatus }) {
  const t = await getTranslations('backupStatus');

  // Development has no sidecar and no volume to read, so "unknown" is the
  // ordinary state there rather than a problem. In production it is not
  // ordinary at all — it means nothing has ever written a status file, which is
  // either a stack deployed before the backup service existed or one where it
  // is failing to start. Both want saying.
  const unconfiguredInProduction =
    status.severity === 'unknown' && process.env.NODE_ENV === 'production';

  if (status.severity === 'ok' || (status.severity === 'unknown' && !unconfiguredInProduction)) {
    return null;
  }

  const critical = status.severity === 'critical' || unconfiguredInProduction;

  const message = unconfiguredInProduction
    ? t('banner.unconfigured')
    : status.ageHours === null
      ? t('banner.never')
      : t('banner.stale', { hours: Math.floor(status.ageHours) });

  return (
    <div
      className={
        critical
          ? 'border-b-2 border-danger bg-danger-soft'
          : 'border-b-2 border-warn bg-warn-soft'
      }
      data-print-hide
    >
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 sm:px-8">
        <ShieldAlert
          size={20}
          className={critical ? 'text-danger' : 'text-warn'}
          aria-hidden
        />
        <p className={`text-[1.02rem] font-bold ${critical ? 'text-danger' : 'text-warn'}`}>
          {message}
        </p>
        <Link
          href="/staff"
          className={`text-[0.95rem] font-bold underline underline-offset-2 ${
            critical ? 'text-danger' : 'text-warn'
          }`}
        >
          {t('banner.action')}
        </Link>
      </div>
    </div>
  );
}
