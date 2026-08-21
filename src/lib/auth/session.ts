import { cookies } from 'next/headers';
import { cache } from 'react';
import type { Role } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';
import { type Permission, ROLE_PERMISSIONS, roleHas } from './permissions';
import {
  isIdle,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  signSession,
  verifySession,
} from './token';

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

  // Quiet for longer than the idle window. Checked here, in the request, rather
  // than left to the cookie's `maxAge`: a browser honours `maxAge`, and a copied
  // cookie value replayed by anything that is not a browser does not.
  if (isIdle(payload)) return null;

  const user = await prisma.staffUser.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      active: true,
      sessionEpoch: true,
    },
  });

  // Deactivated mid-shift: the cookie is still valid, the person is not.
  if (!user || !user.active) return null;

  // Revoked. Sign-out, a PIN change and deactivation all bump this column, and
  // every token issued before the bump carries the older number — which is what
  // makes those three actually end the sessions they appear to end, rather than
  // deleting one cookie and leaving the token it held good for twelve hours.
  //
  // A token predating this field has no `epoch` and is read as 0, matching the
  // default every existing row was given: sessions live across the deploy and
  // become revocable from their next sign-in.
  if ((payload.epoch ?? 0) !== user.sessionEpoch) return null;

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
  // Stamped with the epoch as it stands now, so this token is good until
  // something bumps the column — and stops the moment anything does. A read,
  // not a write: `signIn` already records `lastLoginAt`, and `unlockSession`
  // also lands here, where touching it would be wrong.
  const staff = await prisma.staffUser.findUnique({
    where: { id: userId },
    select: { sessionEpoch: true },
  });
  store.set(
    SESSION_COOKIE,
    await signSession(userId, staff?.sessionEpoch ?? 0),
    SESSION_COOKIE_OPTIONS,
  );
}

/**
 * End every session this person currently holds, everywhere.
 *
 * The cookie deletion below only reaches the browser doing the asking. This is
 * the half that reaches the copy somebody else kept: bumping the column leaves
 * every already-issued token carrying a number that no longer matches, so the
 * next request made with any of them resolves to a signed-out user.
 *
 * Called on sign-out, on a PIN change and on deactivation — the three moments
 * the app has always claimed ended a session and, until this existed, did not.
 */
export async function revokeSessions(userId: string): Promise<void> {
  await prisma.staffUser.update({
    where: { id: userId },
    data: { sessionEpoch: { increment: 1 } },
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
