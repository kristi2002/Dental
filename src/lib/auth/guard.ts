import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { prisma } from '@/lib/prisma';
import type { Permission } from './permissions';
import { getCurrentUser, type SessionUser } from './session';

export type AuditEntry = {
  /** create · update · delete · export · login · logout · denied · failed · locked · confirmed · declined */
  action: string;
  /** patient · appointment · visit · tooth · stock · service · staff · session · recall · waitlist · plan · work · document · prescription · message · backup · settings */
  entity: string;
  entityId?: string | null;
  /** Already composed for reading, e.g. `Deleted patient Arta Krasniqi`. */
  summary: string;
};

/**
 * A line written by somebody the app cannot name — nobody is signed in, and the
 * request carries no session to attribute it to.
 *
 * Recorded with a label and no role, so the feed never implies the person holds
 * permissions in the practice. Two callers today: a patient answering their own
 * confirmation link, and a sign-in attempt against a staff id that does not
 * exist.
 */
export async function recordAnonymousAudit(
  actorName: string,
  entry: AuditEntry,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: null,
        actorName,
        actorRole: null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        summary: entry.summary,
      },
    });
  } catch (error) {
    console.error('[audit] failed to record anonymous entry', entry, error);
  }
}

/** A patient answering their own confirmation link. See `recordAnonymousAudit`. */
export async function recordPatientAudit(
  patientName: string,
  entry: AuditEntry,
): Promise<void> {
  await recordAnonymousAudit(patientName, entry);
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
 * How long one look at a record counts as the same look.
 *
 * Reading is not like changing: a chart is opened, tabbed through and come back
 * to twenty times in an afternoon, and a line per open would bury the writes
 * that the trail exists to show. Collapsing to one line per person per record
 * per half hour keeps "who saw this" answerable and the page readable.
 */
const VIEW_WINDOW_MINUTES = 30;

/**
 * Record that somebody *read* a record — as against changing one.
 *
 * The trail was complete on writes and silent on reads, which is the wrong way
 * round for the question a practice actually gets asked. Nobody disputes who
 * edited a chart; what has to be answerable is who looked at one, and until now
 * opening a patient, an X-ray or a prescription left no trace at all.
 *
 * Never allowed to break the page it describes, for the same reason as
 * `recordAudit` — including the de-duplication query, which is why a failed
 * lookup falls through to writing the line rather than skipping it.
 */
export async function recordView(
  user: SessionUser,
  entry: { entity: string; entityId: string; summary: string },
): Promise<void> {
  try {
    const recent = await prisma.auditLog.findFirst({
      where: {
        actorId: user.id,
        action: 'view',
        entity: entry.entity,
        entityId: entry.entityId,
        createdAt: { gte: new Date(Date.now() - VIEW_WINDOW_MINUTES * 60_000) },
      },
      select: { id: true },
    });
    if (recent) return;
  } catch (error) {
    console.error('[audit] failed to check recent views', entry, error);
  }

  await recordAudit(user, { action: 'view', ...entry });
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
    redirect({ href: '/dashboard', locale: await getLocale() });
  }
  return user;
}
