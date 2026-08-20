'use server';

import { randomUUID } from 'node:crypto';
import { headers } from 'next/headers';
import { getLocale, getTranslations } from 'next-intl/server';
import type { Role } from '@/generated/prisma/enums';
import { redirect } from '@/i18n/navigation';
import { hashPin, isValidPinFormat, verifyPin } from '@/lib/auth/crypto';
import { recordAnonymousAudit, recordAudit, recordPatientAudit } from '@/lib/auth/guard';
import { attemptsLeft, lockoutMinutes, shouldLock } from '@/lib/auth/lockout';
import { createSession, destroySession, getCurrentUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { requiredString } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

/**
 * Attempts per minute, per device, across every account.
 *
 * The escalating lockout in `auth/lockout.ts` is per *account*: it bounds
 * guessing at one name, and does nothing about somebody walking the staff list
 * trying 1234 against each of them in turn. This is the other axis.
 * Deliberately loose enough that a real person mistyping their PIN on the number
 * pad never meets it.
 */
const SIGN_IN_RATE = { limit: 10, windowMs: 60_000 } as const;

/**
 * "Try again in 20 minutes" reads fine; "try again in 1440 minutes" does not.
 * Anything from an hour up is quoted in hours instead.
 */
function lockedMessage(
  t: Awaited<ReturnType<typeof getTranslations<'auth'>>>,
  minutes: number,
): string {
  return minutes >= 60
    ? t('errorLockedHours', { hours: Math.ceil(minutes / 60) })
    : t('errorLocked', { minutes });
}

/**
 * The device-level throttle, shared by signing in and unlocking.
 *
 * Returns an error state when the caller has had enough for now, otherwise null.
 */
async function throttleSignIn(): Promise<ActionState | null> {
  const t = await getTranslations('auth');
  const limit = rateLimit(`signin:${clientKey(await headers())}`, SIGN_IN_RATE);
  if (limit.allowed) return null;

  // Not audited. Every attempt that got through the throttle already wrote its
  // own line, so the burst is on the record; writing one more per rejected
  // request would let anyone hammering the endpoint flood the activity page,
  // which is the opposite of what the trail is for.
  return actionError(t('errorThrottled', { seconds: limit.retryAfter }));
}

type CheckedUser = { id: string; firstName: string; lastName: string; role: Role };

/**
 * Name plus PIN, with the lockout applied — the whole of "is this really them".
 *
 * Shared by signing in and by unlocking an idle screen, deliberately: those are
 * the same question asked twice, and the day they answer it differently is the
 * day one of them is weaker than the other.
 */
async function checkPin(
  staffId: string,
  pin: string,
): Promise<{ ok: true; user: CheckedUser } | { ok: false; error: ActionState }> {
  const t = await getTranslations('auth');

  const user = await prisma.staffUser.findUnique({ where: { id: staffId } });
  // Same message for "no such person" as for a wrong PIN: which staff ids exist
  // is not something a wrong guess should be able to enumerate. The trail is
  // told the difference, because it is the one reader who should know.
  if (!user || !user.active) {
    await recordAnonymousAudit('—', {
      action: 'failed',
      entity: 'session',
      entityId: staffId,
      summary: user
        ? 'Sign-in attempt on a deactivated account'
        : 'Sign-in attempt on an account that does not exist',
    });
    return { ok: false, error: actionError(t('errorWrongPin')) };
  }

  // The account this line is about, for the trail. Not a session — nobody has
  // proved who they are yet, and `permissions` is empty so nothing can mistake
  // this for one.
  const actor = {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: `${user.firstName} ${user.lastName}`,
    role: user.role,
    permissions: [],
  };

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000));
    return { ok: false, error: actionError(lockedMessage(t, minutes)) };
  }

  if (!(await verifyPin(pin, user.pinHash, user.pinSalt))) {
    // Counts across lockouts — only a correct PIN clears it.
    const failedAttempts = user.failedAttempts + 1;
    const locked = shouldLock(failedAttempts);
    const minutes = locked ? lockoutMinutes(failedAttempts) : 0;

    await prisma.staffUser.update({
      where: { id: user.id },
      data: {
        failedAttempts,
        lockedUntil: locked ? new Date(Date.now() + minutes * 60_000) : null,
      },
    });

    // A receptionist repeatedly trying to open the chart was always worth
    // seeing. Somebody working through PINs at the reception tablet overnight is
    // worth seeing rather more, and was the one thing the trail could not show.
    await recordAudit(actor, {
      action: locked ? 'locked' : 'failed',
      entity: 'session',
      entityId: user.id,
      summary: locked
        ? `Locked for ${minutes} minutes after ${failedAttempts} wrong PINs`
        : `Wrong PIN (attempt ${failedAttempts})`,
    });

    return {
      ok: false,
      error: locked
        ? actionError(lockedMessage(t, minutes))
        : actionError(
            t('errorWrongPin', { left: attemptsLeft(failedAttempts) }),
          ),
    };
  }

  await prisma.staffUser.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });

  return {
    ok: true,
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
  };
}

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const t = await getTranslations('auth');

  const staffId = requiredString(formData.get('staffId'));
  const pin = requiredString(formData.get('pin'));
  if (!staffId || !pin) return actionError(t('errorMissing'));

  // Before the PIN is looked at, so a device working through the staff list runs
  // out of requests rather than out of accounts.
  const throttled = await throttleSignIn();
  if (throttled) return throttled;

  const checked = await checkPin(staffId, pin);
  if (!checked.ok) return checked.error;
  const { user } = checked;

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

/**
 * Create the practice's very first account, from the browser.
 *
 * A freshly deployed database has no staff, and the app has no signup — so
 * until now the only way in was `docker/create-owner.mjs`, which needs a shell
 * on the container. That is a reasonable thing to ask of a server admin and an
 * unreasonable thing to ask of a dentist, which left a deployed instance that
 * nobody could sign into.
 *
 * **This is a first-run door, not a signup.** It exists only while the staff
 * table is empty and closes for good the moment it is not:
 *
 *  - the insert is conditional on the table being empty, in one statement, so
 *    two people submitting at the same moment cannot both become owners;
 *  - the page that renders it refuses to render once anybody exists;
 *  - it is rate limited, like the other unauthenticated surface.
 *
 * Everyone after the first is created from the Staff page by the owner, which
 * is the design decision this deliberately does not touch: an open signup on a
 * database of medical records would be a very different application.
 */
export async function createFirstOwner(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('setup');

  const limit = rateLimit(`setup:${clientKey(await headers())}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!limit.allowed) return actionError(t('tooMany'));

  const firstName = requiredString(formData.get('firstName'));
  const lastName = requiredString(formData.get('lastName'));
  const pin = requiredString(formData.get('pin'));
  const confirm = requiredString(formData.get('confirmPin'));

  if (!firstName || !lastName) return actionError(t('errorNames'));
  if (!isValidPinFormat(pin)) return actionError(t('errorPinFormat'));
  if (pin !== confirm) return actionError(t('errorPinMismatch'));

  // Cheap pre-check so the common "somebody already set this up" case gets a
  // clear message rather than a silent no-op from the insert below.
  if ((await prisma.staffUser.count()) > 0) return actionError(t('errorAlreadySetUp'));

  const { hash, salt } = await hashPin(pin);
  const id = randomUUID();

  // The whole guarantee, in one statement: the row is written only if the table
  // is still empty when Postgres evaluates it. A count-then-create would leave a
  // window in which two requests both see zero and both create an owner.
  let created: number;
  try {
    created = await prisma.$executeRaw`
      INSERT INTO "StaffUser" ("id", "firstName", "lastName", "role", "pinHash", "pinSalt", "active", "createdAt", "updatedAt")
      SELECT ${id}, ${firstName}, ${lastName}, ${'OWNER'}::"Role", ${hash}, ${salt}, true, NOW(), NOW()
      WHERE NOT EXISTS (SELECT 1 FROM "StaffUser")
    `;
  } catch {
    return actionError(t('errorGeneric'));
  }

  if (created !== 1) return actionError(t('errorAlreadySetUp'));

  await recordPatientAudit(`${firstName} ${lastName}`, {
    action: 'create',
    entity: 'staff',
    entityId: id,
    // Loud on purpose: this is the one account nobody authorised, and the trail
    // should say so plainly if it is ever read after the fact.
    summary: 'First owner created through first-run setup',
  });

  // Straight in — asking somebody to type the PIN they just chose, on the next
  // screen, would be ceremony rather than security.
  await createSession(id);
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

/**
 * Re-open a screen that locked itself, without losing the page behind it.
 *
 * Unlocking is a fresh sign-in in every respect that matters — same PIN, same
 * lockout, same audit line — and issues a new session rather than reviving the
 * old one, because by the time this is called the previous cookie has usually
 * expired on its own.
 *
 * It is bound to one person: the id comes from whoever was signed in when the
 * screen locked, so a stranger cannot use the lock screen to pick a different
 * account off a list. Getting somebody else in means signing out.
 */
export async function unlockSession(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('auth');

  const staffId = requiredString(formData.get('staffId'));
  const pin = requiredString(formData.get('pin'));
  if (!staffId || !pin) return actionError(t('errorMissing'));

  // The same throttle as signing in, and the same bucket. Unlocking is a
  // sign-in, and a second door with a weaker lock is not a second door.
  const throttled = await throttleSignIn();
  if (throttled) return throttled;

  const checked = await checkPin(staffId, pin);
  if (!checked.ok) return checked.error;
  const { user } = checked;

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
    {
      action: 'login',
      entity: 'session',
      entityId: user.id,
      // Distinct wording from an ordinary sign-in: a screen that keeps locking
      // is worth noticing in the trail, and it reads as a different event.
      summary: 'Unlocked an idle screen',
    },
  );

  return actionOk();
}
