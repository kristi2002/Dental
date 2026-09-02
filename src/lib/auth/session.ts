import { cookies } from 'next/headers';
import { cache } from 'react';
import type { Role } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';
import { type Permission, ROLE_PERMISSIONS, roleHas } from './permissions';
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  signSession,
  verifySession,
  wasRevoked,
} from './token';

export type SessionUser = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: Role;
  permissions: readonly Permission[];
  /**
   * Which parts of the menu this person has switched off, as keys — see
   * `lib/nav-visibility.ts`.
   *
   * Carried on the session rather than fetched where it is used, because it is
   * read on every single page (the rail is drawn on all of them) and this query
   * is already happening and already `cache`d. A second round trip per request
   * for one short string would be the only cost of keeping it separate.
   */
  hiddenNav: readonly string[];
  /** Whether this person still needs telling where the help is. */
  needsHelpPointer: boolean;
};

/**
 * The signed-in person, or `null`.
 *
 * The cookie carries only an id — the role is re-read from the database on every
 * request, so demoting someone takes effect on their next click rather than
 * whenever their token happens to expire. `cache` keeps that to one query per
 * request no matter how many components ask.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const payload = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!payload) return null;

  const user = await prisma.staffUser.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      active: true,
      hiddenNav: true,
      helpSeenAt: true,
      sessionsRevokedAt: true,
    },
  });

  // Deactivated mid-shift: the cookie is still valid, the person is not.
  if (!user || !user.active) return null;

  // Signed out since this token was issued. See `StaffUser.sessionsRevokedAt`:
  // deleting the cookie is not enough on its own, because a prefetch already in
  // flight can hand it straight back.
  //
  if (wasRevoked(payload, user.sessionsRevokedAt)) return null;

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`,
    role: user.role,
    permissions: ROLE_PERMISSIONS[user.role],
    hiddenNav: user.hiddenNav.split('.').filter(Boolean),
    needsHelpPointer: user.helpSeenAt === null,
  };
});

/** Permission check that tolerates a signed-out user — for conditional rendering. */
export async function can(permission: Permission): Promise<boolean> {
  const user = await getCurrentUser();
  return user ? roleHas(user.role, permission) : false;
}

export async function createSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(userId), SESSION_COOKIE_OPTIONS);
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
