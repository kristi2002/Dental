import { Eye } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { SessionUser } from '@/lib/auth/session';
import { roleIsReadOnly } from '@/lib/auth/permissions';

/**
 * The line that tells somebody they are here to look, before they try to type.
 *
 * The help page promises a locum on Read-only that "every screen tells them so
 * rather than refusing at the last moment", and for a long time three screens
 * did: the scan page, a queue row and a recall card. Everywhere else the first
 * news was a form that submitted and came back refused — which is the failure
 * mode the promise was written against, and the one that makes a person doubt
 * the record rather than their permissions.
 *
 * Mounted in the shell rather than added to fifty pages, for the same reason
 * `IdleLock` is: a per-page banner is a banner somebody forgets on the page
 * added next month.
 *
 * **Quiet on purpose.** `BackupBanner` argues that a red bar you must look past
 * every morning is how a practice learns to look past red bars, and this one is
 * on *every* screen for the whole of a locum's three weeks — so it is drawn as
 * a statement of fact in the surface colours, not as a warning. Nothing is
 * wrong; this is simply what this account is.
 *
 * Asks the role, not the screen. `roleIsReadOnly` is true only when the role may
 * change nothing at all, so an assistant who merely cannot reach the figures
 * never sees this — for them a missing screen is the honest signal, and a bar
 * saying they cannot change anything would be a lie.
 */
export async function ViewOnlyBanner({ user }: { user: SessionUser }) {
  if (!roleIsReadOnly(user.role)) return null;

  const t = await getTranslations('common');

  return (
    <div className="border-b border-ink-faint bg-surface-sunken" data-print-hide>
      <div className="mx-auto flex w-full max-w-6xl items-center gap-x-3 px-4 py-2 sm:px-8">
        <Eye size={18} className="shrink-0 text-ink-soft" aria-hidden />
        <p className="text-meta text-ink-soft">{t('viewOnlyBanner')}</p>
      </div>
    </div>
  );
}
