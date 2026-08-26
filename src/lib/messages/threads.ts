import { EmailDirection } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';

/**
 * Reading the correspondence, as against filing it.
 *
 * The same split `board.ts` makes for the outbox, and for the same reason: what
 * the webhook needs to decide ("does this belong to a thread we hold") and what
 * a screen needs to draw ("what is waiting, oldest unanswered first") are
 * different questions that would only get in each other's way sharing a module.
 */

export type ThreadSummary = {
  id: string;
  subject: string;
  correspondent: string;
  lastMessageAt: Date;
  archived: boolean;
  patient: { id: string; firstName: string; lastName: string } | null;
  /** How many inbound messages nobody has opened. Zero is the ordinary state. */
  unread: number;
  /** Enough of the newest message to recognise the conversation. */
  preview: { text: string; inbound: boolean; at: Date } | null;
  attachments: number;
};

/** As much of a message as a list row can show without becoming the message. */
const PREVIEW_LENGTH = 160;

function preview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > PREVIEW_LENGTH ? `${flat.slice(0, PREVIEW_LENGTH - 1)}…` : flat;
}

/** How many threads one screenful of the inbox holds. */
export const THREAD_PAGE_SIZE = 40;

/**
 * The inbox list, and how many there are in total.
 *
 * Sorted by `lastMessageAt` and not by unread-first, deliberately. A list that
 * reorders itself as you read down it is one you lose your place in, and the
 * unread count is already the loudest thing on each row — sorting by it would
 * be saying the same thing twice at the cost of the list holding still.
 *
 * Paged, and the total is returned alongside, because this is the one list in
 * the app whose length nobody controls: a patient answers when a patient
 * answers. It used to take a flat hundred with no pager, no search and nothing
 * said about the cut — so the hundred-and-first conversation was simply
 * unreachable, and the count above the list read "100" for ever while the
 * screen looked complete.
 *
 * `q` matches the subject, the address written to, and the patient's name —
 * the three things somebody has in mind when they come here looking for one
 * conversation rather than working the list down.
 */
export async function getThreads(options: {
  archived: boolean;
  patientId?: string;
  take?: number;
  skip?: number;
  query?: string;
}): Promise<{ threads: ThreadSummary[]; total: number }> {
  const query = options.query?.trim() ?? '';

  const where = {
    archivedAt: options.archived ? { not: null } : null,
    ...(options.patientId ? { patientId: options.patientId } : {}),
    ...(query
      ? {
          OR: [
            { subject: { contains: query, mode: 'insensitive' as const } },
            { correspondent: { contains: query, mode: 'insensitive' as const } },
            { patient: { firstName: { contains: query, mode: 'insensitive' as const } } },
            { patient: { lastName: { contains: query, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.emailThread.count({ where }),
    prisma.emailThread.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      take: options.take ?? THREAD_PAGE_SIZE,
      skip: options.skip ?? 0,
      select: {
        id: true,
        subject: true,
        correspondent: true,
        lastMessageAt: true,
        archivedAt: true,
        patient: { select: { id: true, firstName: true, lastName: true } },
        // One message per thread — the newest — for the preview line. Taken here
        // rather than in a second pass so the list is one query.
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            text: true,
            direction: true,
            createdAt: true,
            _count: { select: { attachments: true } },
          },
        },
        _count: {
          select: {
            messages: { where: { direction: EmailDirection.INBOUND, readAt: null } },
          },
        },
      },
    }),
  ]);

  const threads = rows.map((row) => {
    const newest = row.messages[0];
    return {
      id: row.id,
      subject: row.subject,
      correspondent: row.correspondent,
      lastMessageAt: row.lastMessageAt,
      archived: row.archivedAt !== null,
      patient: row.patient,
      unread: row._count.messages,
      preview: newest
        ? {
            text: preview(newest.text),
            inbound: newest.direction === EmailDirection.INBOUND,
            at: newest.createdAt,
          }
        : null,
      attachments: newest?._count.attachments ?? 0,
    };
  });

  return { threads, total };
}

export type ThreadMessageView = {
  id: string;
  inbound: boolean;
  fromAddress: string;
  fromName: string;
  subject: string;
  text: string;
  /** Whether an HTML part exists — never the markup itself. See below. */
  hasHtml: boolean;
  at: Date;
  read: boolean;
  actorName: string;
  spamScore: number | null;
  attachments: { id: string; fileName: string; mimeType: string; sizeBytes: number }[];
};

export type ThreadView = {
  id: string;
  subject: string;
  correspondent: string;
  archived: boolean;
  patient: { id: string; firstName: string; lastName: string; contactConsent: boolean | null } | null;
  messages: ThreadMessageView[];
};

/**
 * One conversation, in full.
 *
 * **The HTML never leaves the database.** `hasHtml` is a boolean and the markup
 * is not selected at all — not trimmed on the way to the screen, not escaped,
 * not selected. A received message is attacker-chosen markup from an
 * unauthenticated stranger, and the safest way to be sure a page never renders
 * it is for the page never to be handed it. Somebody who needs the original
 * downloads it, through a route that serves it as a file.
 */
export async function getThread(id: string): Promise<ThreadView | null> {
  const thread = await prisma.emailThread.findUnique({
    where: { id },
    select: {
      id: true,
      subject: true,
      correspondent: true,
      archivedAt: true,
      patient: {
        select: { id: true, firstName: true, lastName: true, contactConsent: true },
      },
      messages: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          direction: true,
          fromAddress: true,
          fromName: true,
          subject: true,
          text: true,
          createdAt: true,
          readAt: true,
          spamScore: true,
          // The existence of the markup, never the markup.
          html: false,
          actor: { select: { firstName: true, lastName: true } },
          attachments: {
            orderBy: { fileName: 'asc' },
            select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
          },
        },
      },
    },
  });

  if (!thread) return null;

  // Asked separately, because selecting `html` to test it would be selecting it.
  const withHtml = new Set(
    (
      await prisma.emailMessage.findMany({
        where: { threadId: id, html: { not: null } },
        select: { id: true },
      })
    ).map((row) => row.id),
  );

  return {
    id: thread.id,
    subject: thread.subject,
    correspondent: thread.correspondent,
    archived: thread.archivedAt !== null,
    patient: thread.patient,
    messages: thread.messages.map((message) => ({
      id: message.id,
      inbound: message.direction === EmailDirection.INBOUND,
      fromAddress: message.fromAddress,
      fromName: message.fromName,
      subject: message.subject,
      text: message.text,
      hasHtml: withHtml.has(message.id),
      at: message.createdAt,
      read: message.readAt !== null,
      actorName: message.actor
        ? `${message.actor.firstName} ${message.actor.lastName}`.trim()
        : '',
      spamScore: message.spamScore,
      attachments: message.attachments,
    })),
  };
}

/**
 * How many replies nobody has looked at.
 *
 * Read on every page, because it is a badge in the rail. Deliberately a count
 * over an index (`direction`, `readAt`) rather than a column somebody has to
 * remember to keep in step — which is the rule the rest of this app follows and
 * the one `EmailThread.lastMessageAt` breaks for a reason it had to argue for.
 */
export async function getUnreadCount(): Promise<number> {
  return prisma.emailMessage.count({
    where: {
      direction: EmailDirection.INBOUND,
      readAt: null,
      // Filed away does not count. Somebody deciding a thread is spam should
      // silence the badge, or the badge is a thing you learn to ignore.
      thread: { archivedAt: null },
    },
  });
}
