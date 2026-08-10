'use server';

import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { verifyPin } from '@/lib/auth/crypto';
import { recordAudit } from '@/lib/auth/guard';
import { createSession, destroySession, getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { requiredString } from '@/lib/utils';
import { actionError, type ActionState } from './types';

/** A 4-digit PIN is guessable in 10 000 tries; five strikes makes that useless. */
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 5;

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('auth');

  const staffId = requiredString(formData.get('staffId'));
  const pin = requiredString(formData.get('pin'));
  if (!staffId || !pin) return actionError(t('errorMissing'));

  const user = await prisma.staffUser.findUnique({ where: { id: staffId } });
  if (!user || !user.active) return actionError(t('errorWrongPin'));

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.max(
      1,
      Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000),
    );
    return actionError(t('errorLocked', { minutes }));
  }

  if (!(await verifyPin(pin, user.pinHash, user.pinSalt))) {
    const failedAttempts = user.failedAttempts + 1;
    const locked = failedAttempts >= MAX_ATTEMPTS;

    await prisma.staffUser.update({
      where: { id: user.id },
      data: {
        failedAttempts: locked ? 0 : failedAttempts,
        lockedUntil: locked ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
      },
    });

    return locked
      ? actionError(t('errorLocked', { minutes: LOCKOUT_MINUTES }))
      : actionError(t('errorWrongPin', { left: MAX_ATTEMPTS - failedAttempts }));
  }

  await prisma.staffUser.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  await createSession(user.id);
  await recordAudit(
    {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`,
      role: user.role,
      permissions: [],
    },
    { action: 'login', entity: 'session', entityId: user.id, summary: 'Signed in' },
  );

  // Throws internally — must stay outside any try/catch.
  redirect({ href: '/', locale: await getLocale() });
}

export async function signOut(): Promise<void> {
  const user = await getCurrentUser();
  if (user) {
    await recordAudit(user, {
      action: 'logout',
      entity: 'session',
      entityId: user.id,
      summary: 'Signed out',
    });
  }

  await destroySession();
  redirect({ href: '/login', locale: await getLocale() });
}
