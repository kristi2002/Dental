import { MessageStatus } from '@/generated/prisma/enums';
import { clinicMinutesNow, toDateKey, today } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { stillWorthSending } from './outbox';

/**
 * Reading the outbox, as against filling it.
 *
 * `queue.ts` is the job's side — what to put in and what to take out. This is
 * the screen's side, and it is a different question: not "who needs telling"
 * but "what is in front of the person at the desk this minute". The two are
 * separated because the first runs at eighteen hundred with nobody watching and
 * the second runs whenever somebody opens a page.
 *
 * Note what this does *not* return: any message text. The wording is composed
 * per row by `composeReminder`, in the patient's language, at the moment the
 * row is drawn — which is the whole reason `ScheduledMessage` stores an
 * intention and not a body. A queue holding pre-written sentences would start
 * lying the first time an appointment moved half an hour.
 */

export type QueuedMessage = {
  id: string;
  kind: string;
  status: MessageStatus;
  note: string | null;
  sendAfter: Date;
  resolvedAt: Date | null;
  /** Who resolved it, when a person did. The clock leaves this empty. */
  resolvedBy: string;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    locale: string | null;
    contactConsent: boolean | null;
  };
  /** The slot it is about, when it is about one. `date` is `YYYY-MM-DD`. */
  appointment: {
    id: string;
    date: string;
    startTime: string;
    serviceName: string;
  } | null;
};

const SELECT = {
  id: true,
  kind: true,
  status: true,
  note: true,
  sendAfter: true,
  resolvedAt: true,
  resolvedBy: { select: { firstName: true, lastName: true } },
  patient: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      locale: true,
      contactConsent: true,
    },
  },
  appointment: {
    select: { id: true, date: true, startTime: true, serviceName: true },
  },
} as const;

type Row = {
  id: string;
  kind: string;
  status: MessageStatus;
  note: string | null;
  sendAfter: Date;
  resolvedAt: Date | null;
  resolvedBy: { firstName: string; lastName: string } | null;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
    locale: string | null;
    contactConsent: boolean | null;
  };
  appointment: { id: string; date: Date; startTime: string; serviceName: string | null } | null;
};

function toView(row: Row): QueuedMessage {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    note: row.note,
    sendAfter: row.sendAfter,
    resolvedAt: row.resolvedAt,
    resolvedBy: row.resolvedBy
      ? `${row.resolvedBy.firstName} ${row.resolvedBy.lastName}`.trim()
      : '',
    patient: {
      id: row.patient.id,
      firstName: row.patient.firstName,
      lastName: row.patient.lastName,
      phone: row.patient.phone,
      email: row.patient.email ?? '',
      locale: row.patient.locale,
      contactConsent: row.patient.contactConsent,
    },
    appointment: row.appointment
      ? {
          id: row.appointment.id,
          date: toDateKey(row.appointment.date),
          startTime: row.appointment.startTime,
          serviceName: row.appointment.serviceName ?? '',
        }
      : null,
  };
}

export type SendQueue = {
  /** Still ahead, still worth sending. The list the screen exists for. */
  waiting: QueuedMessage[];
  /**
   * Queued, never sent, and the moment has passed. Shown rather than filtered
   * out: "nobody got to these" is the one thing a send queue owes the person
   * who opens it on a Tuesday morning, and it is invisible everywhere else.
   */
  passed: QueuedMessage[];
  /** Sent, skipped or withdrawn today — the audit the front desk actually reads. */
  handled: QueuedMessage[];
};

/**
 * Everything the queue screen shows, in two round trips.
 *
 * "Handled" is deliberately today only. The whole value of that list is
 * answering "did somebody already ring Mr Hoxha this morning?", which stops
 * being a live question at midnight; a rolling window would turn it into a
 * message archive, which is what the `Contact` log already is and this is not.
 */
export async function getSendQueue(): Promise<SendQueue> {
  const day = today();
  const now = { dateKey: toDateKey(day), minutes: clinicMinutesNow() };

  const [pending, resolved] = await Promise.all([
    prisma.scheduledMessage.findMany({
      where: { status: MessageStatus.PENDING },
      select: SELECT,
      // Soonest first: the queue is worked from the top, and the top should be
      // whoever is due back first.
      orderBy: [{ appointment: { date: 'asc' } }, { sendAfter: 'asc' }],
    }),
    prisma.scheduledMessage.findMany({
      where: { status: { not: MessageStatus.PENDING }, resolvedAt: { gte: day } },
      select: SELECT,
      orderBy: { resolvedAt: 'desc' },
    }),
  ]);

  const waiting: QueuedMessage[] = [];
  const passed: QueuedMessage[] = [];

  for (const row of pending as Row[]) {
    const view = toView(row);
    const slot = view.appointment
      ? { date: view.appointment.date, startTime: view.appointment.startTime }
      : null;
    (stillWorthSending(slot, now) ? waiting : passed).push(view);
  }

  return { waiting, passed, handled: (resolved as Row[]).map(toView) };
}
