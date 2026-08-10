import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { requireUser } from '@/lib/auth/guard';

/**
 * Everything inside this group requires a signed-in person. The redirect here is
 * the convenience; the enforcement that matters lives in each page's
 * `requirePermission` call and in every server action's `authorize` call.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return <AppShell user={user}>{children}</AppShell>;
}
