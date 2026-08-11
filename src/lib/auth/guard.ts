import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { prisma } from '@/lib/prisma';
import type { Permission } from './permissions';
import { getCurrentUser, type SessionUser } from './session';

export type AuditEntry = {
  /** create · update · delete · login · logout · denied · confirmed · declined */
  action: string;
  /** patient · appointment · visit · tooth · stock · service · staff · session · recall · waitlist · plan · document · prescription · backup · settings */
  entity: string;
  entityId?: string | null;
  /** Already composed for reading, e.g. `Deleted patient Arta Krasniqi`. */
  summary: string;
};

/**
 * A line written by someone who is not staff — today, only a patient answering
 * their own confirmation link. Recorded with a name and no role, so the feed
 * never implies the person holds permissions in the practice.
 */
export async function recordPatientAudit(
  patientName: string,
  entry: AuditEntry,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: null,
        actorName: patientName,
        actorRole: null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        summary: entry.summary,
      },
    });
  } catch (error) {
    console.error('[audit] failed to record patient entry', entry, error);
  }
}

/**
 * Write one line to the trail. Never allowed to break the operation it
 * describes — a clinic losing a patient record because the log was busy would
 * be a far worse failure than a gap in the log.
 */
export async function recordAudit(user: SessionUser, entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        summary: entry.summary,
      },
    });
  } catch (error) {
    console.error('[audit] failed to record entry', entry, error);
  }
}

/**
 * The check every server action starts with.
 *
 * Returns the signed-in user when they hold the permission, otherwise `null` —
 * callers turn that into their own error shape. Refusals are logged, because a
 * receptionist repeatedly trying to open the chart is worth seeing.
 */
export async function authorize(permission: Permission): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  if (!user.permissions.includes(permission)) {
    await recordAudit(user, {
      action: 'denied',
      entity: 'session',
      summary: `Blocked: ${permission}`,
    });
    return null;
  }

  return user;
}

/** Page-level guard: send anyone not signed in to the login screen. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: '/login', locale: await getLocale() });
  }
  return user;
}

/**
 * Page-level guard. Someone without the permission is bounced to the dashboard
 * rather than shown an error page — every role can see the dashboard, so it is
 * always a valid landing place.
 */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.permissions.includes(permission)) {
    await recordAudit(user, {
      action: 'denied',
      entity: 'session',
      summary: `Blocked: ${permission}`,
    });
    redirect({ href: '/', locale: await getLocale() });
  }
  return user;
}
