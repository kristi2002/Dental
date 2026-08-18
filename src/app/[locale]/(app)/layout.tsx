import type { ReactNode } from 'react';
import { IdleLock } from '@/components/auth/IdleLock';
import { AppShell } from '@/components/layout/AppShell';
import { requireUser } from '@/lib/auth/guard';
import { SESSION_IDLE_SECONDS } from '@/lib/auth/token';

/**
 * Everything inside this group requires a signed-in person. The redirect here is
 * the convenience; the enforcement that matters lives in each page's
 * `requirePermission` call and in every server action's `authorize` call.
 *
 * The lock is mounted once here rather than per page, so there is no signed-in
 * screen it is missing from — including the ones that show a chart.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <>
      <AppShell user={user}>{children}</AppShell>
      <IdleLock
        user={{ id: user.id, firstName: user.firstName, lastName: user.lastName }}
        idleSeconds={SESSION_IDLE_SECONDS}
      />
    </>
  );
}
