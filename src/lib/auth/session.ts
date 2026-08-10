import { cookies } from 'next/headers';
import { cache } from 'react';
import type { Role } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';
import { type Permission, ROLE_PERMISSIONS, roleHas } from './permissions';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, signSession, verifySession } from './token';

export type SessionUser = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: Role;
  permissions: readonly Permission[];
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
    select: { id: true, firstName: true, lastName: true, role: true, active: true },
  });

  // Deactivated mid-shift: the cookie is still valid, the person is not.
  if (!user || !user.active) return null;

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`,
    role: user.role,
    permissions: ROLE_PERMISSIONS[user.role],
  };
});

/** Permission check that tolerates a signed-out user — for conditional rendering. */
export async function can(permission: Permission): Promise<boolean> {
  const user = await getCurrentUser();
  return user ? roleHas(user.role, permission) : false;
}

export async function createSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
