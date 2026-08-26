import { EmailDirection } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';
import { isUniqueViolation } from '@/lib/actions/types';
import { threadSubject, type InboundEmail } from './inbound';
import { matchesMessageId } from './email';

/**
 * Where an email goes once it has been sent or received.
 *
 * One place, called by all three senders — the outbox's queue button, the
 * composer on a patient record, and a reply typed in the inbox — for the reason
 * `lib/actions/messages.ts` gives for resolving a queue row and writing its
 * `Contact` in one transaction: three call sites that each remember to do the
 * same four things are three call sites where one of them eventually does not.
 *
 * **This never throws at a caller who has already sent something.** A message
 * that went out and failed to be filed is a gap in the record; an exception
 * bubbling up from here would turn that into "the send failed", and somebody
 * would send it twice. Every function below reports failure by returning, and
 * shouts into the server log on the way.
 */

/**
 * The thread for one address, created if this is the first time.
 *
 * An upsert on `correspondent`, which is unique — so two messages arriving at
 * once, or a webhook delivered twice, converge on one row instead of racing to
 * create two. That uniqueness is the whole concurrency story here.
 */
async function openThread(input: {
  address: string;
  patientId: string | null;
  subject: string;
  at: Date;
  /** Inbound mail pulls a filed-away thread back out. Outbound does not. */
  unarchive: boolean;
}): Promise<string | null> {
  const correspondent = input.address.trim().toLowerCase();
  if (!correspondent) return null;

  const subject = threadSubject(input.subject) || '(no subject)';

  try {
    const thread = await prisma.emailThread.upsert({
      where: { correspondent },
      create: {
        correspondent,
        subject,
        patientId: input.patientId,
        lastMessageAt: input.at,
      },
      update: {
        subject,
        lastMessageAt: input.at,
        ...(input.unarchive ? { archivedAt: null } : {}),
      },
      select: { id: true, patientId: true },
    });

    // Filled in, never overwritten — and done as its own guarded write rather
    // than in the upsert above, because an `update` naming `patientId` sets it
    // unconditionally. A thread already attached to somebody must not be
    // re-pointed by the next message that happens to arrive: a family sharing
    // one mailbox would otherwise walk the thread from parent to child and back.
    if (input.patientId && !thread.patientId) {
      await prisma.emailThread.updateMany({
        where: { id: thread.id, patientId: null },
        data: { patientId: input.patientId },
      });
    }

    return thread.id;
  } catch (error) {
    console.error('[correspondence] could not open a thread for', correspondent, error);
    return null;
  }
}

/**
 * File a message the practice has just sent.
 *
 * Called *after* the provider accepted it, never before: this table is a record
 * of what happened, and a row written in hope is a row that lies the moment the
 * send fails.
 */
export async function recordOutbound(input: {
  patientId: string | null;
  toAddress: string;
  fromAddress: string;
  subject: string;
  text: string;
  /** What the provider called it. Null loses the thread on reply, not the record. */
  messageId: string | null;
  actorId: string | null;
}): Promise<void> {
  const at = new Date();

  const threadId = await openThread({
    address: input.toAddress,
    patientId: input.patientId,
    subject: input.subject,
    at,
    unarchive: false,
  });
  if (!threadId) return;

  try {
    await prisma.emailMessage.create({
      data: {
        threadId,
        direction: EmailDirection.OUTBOUND,
        fromAddress: input.fromAddress.toLowerCase(),
        toAddress: input.toAddress.trim().toLowerCase(),
        subject: input.subject,
        text: input.text,
        providerMessageId: input.messageId,
        actorId: input.actorId,
        // Nothing to read: the practice wrote it.
        readAt: at,
      },
    });
  } catch (error) {
    // A duplicate provider id means this exact send is already filed, which is
    // the retry case and not a problem worth a line in the log.
    if (isUniqueViolation(error)) return;
    console.error('[correspondence] sent but could not file', input.toAddress, error);
  }
}

/**
 * Which thread a reply belongs to, by the headers its client sent.
 *
 * Two steps because `providerMessageId` cannot be matched in SQL: Resend stores
 * a bare id that appears *inside* the header the reply quotes, so an `IN (…)`
 * would miss it. The candidates are fetched by the one thing that is exact —
 * a whole-string match — and then the loose comparison happens in `matchesMessageId`
 * over a handful of rows.
 *
 * Bounded deliberately. A `References` chain can be long, and this is reached
 * by an unauthenticated webhook.
 */
export async function threadByReference(referencedIds: string[]): Promise<string | null> {
  const ids = referencedIds.slice(0, 20);
  if (ids.length === 0) return null;

  const exact = await prisma.emailMessage.findFirst({
    where: { providerMessageId: { in: ids } },
    select: { threadId: true },
  });
  if (exact) return exact.threadId;

  // The fallback: the newest few outbound messages, compared loosely. Recent
  // rather than all, because a reply to something sent eighteen months ago is
  // not worth a table scan on every inbound message.
  const recent = await prisma.emailMessage.findMany({
    where: { direction: EmailDirection.OUTBOUND, providerMessageId: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: { threadId: true, providerMessageId: true },
  });

  for (const candidate of recent) {
    if (!candidate.providerMessageId) continue;
    if (ids.some((id) => matchesMessageId(candidate.providerMessageId!, id))) {
      return candidate.threadId;
    }
  }
  return null;
}

/** The patient this address belongs to, if it belongs to one. */
export async function patientByEmail(address: string): Promise<string | null> {
  const value = address.trim();
  if (!value) return null;

  const patient = await prisma.patient.findFirst({
    // Addresses are case-insensitive; the column is not. `mode: 'insensitive'`
    // rather than storing a lower-cased copy, because the column is also what
    // the app writes to and a second one would need keeping in step.
    where: { email: { equals: value, mode: 'insensitive' } },
    select: { id: true },
  });
  return patient?.id ?? null;
}

export type StoredAttachment = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
};

/**
 * File a message that has arrived.
 *
 * Returns whether it was new. The webhook uses that to keep its own log honest
 * about how much of a redelivery it actually did.
 */
export async function recordInbound(
  email: InboundEmail,
  placement: { threadId: string | null; patientId: string | null; spam: boolean },
  attachments: StoredAttachment[],
): Promise<{ stored: boolean; threadId: string | null }> {
  const at = new Date();

  let threadId = placement.threadId;
  if (!threadId) {
    threadId = await openThread({
      address: email.fromAddress,
      patientId: placement.patientId,
      subject: email.subject,
      at,
      // An answer from somebody whose last thread was filed away is a reason to
      // put it back in front of a person — except when the classifier says it is
      // spam, in which case putting it back is exactly what the sender wants.
      unarchive: !placement.spam,
    });
  } else {
    await prisma.emailThread
      .update({
        where: { id: threadId },
        data: {
          lastMessageAt: at,
          subject: threadSubject(email.subject) || undefined,
          ...(placement.spam ? {} : { archivedAt: null }),
        },
      })
      .catch((error) => {
        console.error('[correspondence] could not touch thread', threadId, error);
      });
  }
  if (!threadId) return { stored: false, threadId: null };

  if (placement.spam) {
    await prisma.emailThread
      .update({ where: { id: threadId }, data: { archivedAt: at } })
      .catch(() => {});
  }

  try {
    await prisma.emailMessage.create({
      data: {
        threadId,
        direction: EmailDirection.INBOUND,
        fromAddress: email.fromAddress,
        fromName: email.fromName,
        toAddress: email.toAddress,
        subject: email.subject,
        text: email.text,
        html: email.html,
        providerMessageId: email.messageId,
        inReplyTo: email.references[0] ?? null,
        spamScore: email.spamScore,
        // An out-of-office is not something anybody needs to be told about, so
        // it arrives already read. It is still stored: "they were away" is the
        // answer to "why did they never reply".
        readAt: email.automated ? at : null,
        attachments: attachments.length > 0 ? { create: attachments } : undefined,
      },
    });
    return { stored: true, threadId };
  } catch (error) {
    if (isUniqueViolation(error)) return { stored: false, threadId };
    console.error('[correspondence] could not file an inbound message', error);
    return { stored: false, threadId };
  }
}
