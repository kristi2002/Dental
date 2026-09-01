/**
 * The rest of what is waiting on the practice, as counts the bell can print.
 *
 * The reminder board is headed *"everything waiting on the practice, in one
 * place"*, and for a long time it carried two things: the practice's own
 * errands and the storage room's alarms. Meanwhile the app knew about five more
 * piles — a crown still at the laboratory, a visit nobody wrote up, tomorrow's
 * patient who has heard nothing, an unanswered message, a stranger who left
 * their number on the public page — and filed each one behind a screen somebody
 * has to decide to open. That decision is exactly what does not happen on a
 * busy morning, which is the whole argument the board was built on.
 *
 * **They arrive as counts and a way in, not as rows.** Follow-ups and low stock
 * are *worked* in the bell because their verbs are one press — tick it, snooze
 * it, order it, quieten it. Chasing a laboratory is a telephone call with the
 * docket open; closing off yesterday's appointments is a screen of its own.
 * Putting those lists inside the modal would make it a second copy of four
 * pages, and a board you scroll is a board you stop reading. One line each,
 * with the number and the door, is the most the bell can honestly offer.
 *
 * **What earns a place.** The test `AppShell` already applies to the numbers in
 * the navigation rail: *is somebody else waiting?* A patient whose crown has not
 * come back is; a stranger who left their telephone number and heard nothing is.
 * A failed backup is not — it is an alarm for one person, and it would be the
 * row that teaches everybody to stop reading the bell.
 *
 * Every count is gated on the permission that opens the screen behind it, for
 * the reason the rail's badges are: somebody who may not open a list must not be
 * told how much is in it by a number in the corner.
 */

import {
  AppointmentRequestStatus,
  AppointmentStatus,
  CancelledBy,
  EmailDirection,
} from '@/generated/prisma/enums';
import type { Permission } from '@/lib/auth/permissions';
import { addDays, today } from '@/lib/dates';
import { countWaitingMessages } from '@/lib/messages/board';
import { getUnreadCount } from '@/lib/messages/threads';
import { prisma } from '@/lib/prisma';
import { DUE_SOON_DAYS } from '@/lib/works';

/** Which pile this is. Drives the icon and the sentence the row prints. */
export type ElsewhereKey =
  | 'works'
  | 'unwritten'
  | 'unreminded'
  | 'mail'
  | 'requests'
  | 'opened';

export type Elsewhere = {
  key: ElsewhereKey;
  count: number;
  /** The screen that actually deals with it. */
  href: string;
};

/**
 * The pile, its door, and who is allowed to be told about it.
 *
 * A table rather than five branches: the board prints these in this order, and
 * the order is the argument — a case that has not come back is somebody's
 * mouth, and a booking request is somebody who has not been answered yet, while
 * a visit nobody wrote up is paperwork. Reordering it is a product decision
 * somebody can make by moving a line.
 */
/**
 * How long a freed slot stays news.
 *
 * Three days: long enough that a Friday-evening cancellation is still on the
 * board on Monday morning, short enough that a gap nobody filled stops being
 * reported as an opportunity. Counted from when the patient answered rather
 * than from the slot's own date, because the news is the *cancellation*.
 */
const OPENED_SLOT_DAYS = 3;

const PILES: ReadonlyArray<{
  key: ElsewhereKey;
  href: string;
  permission: Permission;
  count: () => Promise<number>;
}> = [
  {
    key: 'works',
    href: '/works',
    permission: 'work.view',
    // The same window `getWorksToChase` reads — due back within a few days, or
    // already past, and not yet received. Counted rather than fetched: the row
    // says how many and the register says which.
    count: () =>
      prisma.work.count({
        where: { receivedAt: null, dueAt: { not: null, lte: addDays(today(), DUE_SOON_DAYS) } },
      }),
  },
  {
    key: 'requests',
    href: '/requests',
    permission: 'request.view',
    count: () =>
      prisma.appointmentRequest.count({ where: { status: AppointmentRequestStatus.NEW } }),
  },
  {
    key: 'mail',
    href: '/inbox',
    permission: 'message.view',
    count: () => getUnreadCount(),
  },
  {
    key: 'unreminded',
    href: '/reminders',
    permission: 'recall.view',
    /*
     * What is actually waiting on the send queue.
     *
     * This counted something of its own until now — *tomorrow's appointments
     * with no reminder contact* — which is a different question from the one
     * the screen behind the number answers, and the two disagreed in both
     * directions. The queue holds recalls, which have no appointment at all, so
     * the bell said nought on a morning with a dozen patients waiting to be
     * rung; and it holds what is left of today, so it said three where the
     * screen showed nine.
     *
     * A badge that disagrees with the page it opens is worse than no badge:
     * it teaches people that the number is decorative, and the number was the
     * whole reason the pile is on the board. `countWaitingMessages` asks the
     * queue's own three questions — pending, still worth sending, not held back
     * from a refused attempt — so the two cannot drift apart again.
     */
    count: countWaitingMessages,
  },
  {
    key: 'opened',
    href: '/appointments',
    permission: 'appointment.view',
    /*
     * Slots the patient gave back, in the last few days.
     *
     * The confirmation link closes the loop properly — "no" cancels the
     * appointment, frees the chair and records that the patient themselves did
     * it — and then tells nobody. A slot handed back at twenty to eleven at
     * night is a gap in tomorrow that the practice discovers by looking at
     * tomorrow, which on a full day is at about the time it would have
     * started. The waiting list is right there, on the other side of one
     * screen, and it needs several days' notice to be any use.
     *
     * Bounded at both ends, which is what stops it becoming a pile that only
     * grows: the slot must still be ahead of us (a gap that has already passed
     * is not an opportunity), and the cancellation must be recent enough that
     * nobody has had a chance to fill it. Rows leave by themselves.
     */
    count: () =>
      prisma.appointment.count({
        where: {
          date: { gte: today() },
          status: AppointmentStatus.CANCELLED,
          cancelledBy: CancelledBy.PATIENT,
          declinedAt: { gte: addDays(today(), -OPENED_SLOT_DAYS) },
        },
      }),
  },
  {
    key: 'unwritten',
    href: '/appointments',
    permission: 'appointment.view',
    count: () =>
      prisma.appointment.count({
        where: {
          date: { lt: today() },
          status: { in: [AppointmentStatus.SCHEDULED, AppointmentStatus.ARRIVED] },
        },
      }),
  },
];

/**
 * Every pile this reader may know about, and how big it is.
 *
 * Empty ones are dropped here rather than in the component: a row reading
 * "0 cases at the laboratory" is the board congratulating itself, and the board
 * exists to say what is wrong.
 *
 * The counts run together, and only the permitted ones run at all — the bell is
 * drawn on every screen in the app, so this is on the critical path of every
 * page render, and a query nobody is allowed to see the answer to is a query
 * worth not making.
 */
/**
 * Every pile, unfiltered, keyed by name.
 *
 * For the clock, which has nobody to gate on: a job runs with no session, and
 * the digest it writes is a fact about the practice rather than something shown
 * to a reader. The permission check belongs at the point somebody is *told* a
 * number, which is `getWaitingElsewhere` below — not here, where the alternative
 * would be a job pretending to hold permissions it cannot have.
 */
/**
 * How much of the "elsewhere" half arrived since somebody last shut the board.
 *
 * Only the two piles that can answer it honestly. A booking request and an
 * unread message both have the moment they landed; a case at the laboratory is
 * *going* late rather than arriving, tomorrow's unreminded list empties and
 * refills every day by construction, and an appointment that was never closed
 * off has no moment of becoming a problem beyond the clinic ending. Counting
 * those by guesswork would make the one number on the board that is supposed to
 * mean something mean nothing.
 *
 * Permission-gated like everything else here: a number nobody may be told is a
 * query worth not making.
 */
export async function countNewElsewhere(
  permissions: ReadonlyArray<Permission>,
  seenAt: Date | null,
): Promise<number> {
  if (!seenAt) return 0;

  const [requests, mail] = await Promise.all([
    permissions.includes('request.view')
      ? prisma.appointmentRequest.count({
          where: { status: AppointmentRequestStatus.NEW, createdAt: { gt: seenAt } },
        })
      : 0,
    permissions.includes('message.view')
      ? prisma.emailMessage.count({
          where: {
            direction: EmailDirection.INBOUND,
            readAt: null,
            // Archived threads are excluded here for the same reason
            // `getUnreadCount` excludes them: somebody filing a thread as spam
            // should silence it, or the number is one people learn to ignore.
            thread: { archivedAt: null },
            createdAt: { gt: seenAt },
          },
        })
      : 0,
  ]);

  return requests + mail;
}

export async function countEveryPile(): Promise<Record<ElsewhereKey, number>> {
  const counts = await Promise.all(PILES.map((pile) => pile.count()));

  return Object.fromEntries(PILES.map((pile, index) => [pile.key, counts[index] ?? 0])) as Record<
    ElsewhereKey,
    number
  >;
}

export async function getWaitingElsewhere(
  permissions: ReadonlyArray<Permission>,
): Promise<Elsewhere[]> {
  const allowed = PILES.filter((pile) => permissions.includes(pile.permission));

  const counts = await Promise.all(allowed.map((pile) => pile.count()));

  return allowed
    .map((pile, index) => ({ key: pile.key, href: pile.href, count: counts[index] ?? 0 }))
    .filter((row) => row.count > 0);
}
