import { MessageStatus } from '@/generated/prisma/enums';
import { clinicMinutesNow, toDateKey, today } from '@/lib/dates';
import { prisma } from '@/lib/prisma';
import { isHeld, stillWorthSending, usableEmail } from './outbox';

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
 * per row by `composeForQueued`, in the patient's language, at the moment the
 * row is drawn — which is the whole reason `ScheduledMessage` stores an
 * intention and not a body. A queue holding pre-written sentences would start
 * lying the first time an appointment moved half an hour.
 *
 * What it *does* return, and did not until recently, is the live state of the
 * three other things a message can be about: the visit a post-operative check
 * follows, the case back from the laboratory, and the plan that stalled. All
 * three are read here rather than snapshotted onto the row, for exactly the
 * reason the body is.
 */

export type QueuedMessage = {
  id: string;
  kind: string;
  status: MessageStatus;
  note: string | null;
  sendAfter: Date;
  /** How many times a send was tried and refused. Nought means nobody tried. */
  attempts: number;
  lastAttemptAt: Date | null;
  resolvedAt: Date | null;
  /** Who resolved it, when a person did. The clock leaves this empty. */
  resolvedBy: string;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    /**
     * The address the practice may actually use — empty when there is none, and
     * empty when the provider has told us it does not work. See `usableEmail`.
     */
    email: string;
    /** Whether that emptiness is a bounce rather than a blank field. */
    emailBounced: boolean;
    locale: string | null;
    contactConsent: boolean | null;
    /** How this patient asked to be contacted, when they were asked. */
    preferredChannel: string | null;
  };
  /** The slot it is about, when it is about one. `date` is `YYYY-MM-DD`. */
  appointment: {
    id: string;
    date: string;
    startTime: string;
    serviceName: string;
  } | null;
  /**
   * When the patient was last in, as `YYYY-MM-DD`, or null for somebody who
   * never has been.
   *
   * A recall's wording quotes it — "it has been eight months since we last saw
   * you" — and a post-operative check counts the days from it. Read here rather
   * than snapshotted onto the row for the reason this table stores no body at
   * all: a patient who comes in between the queueing and the sending must not be
   * written to about an absence that ended.
   */
  lastVisit: string | null;
  /** What was done at that visit, which the post-operative message quotes back. */
  lastVisitServices: string;
  /** The case back from the laboratory, for a WORK_READY row. */
  work: { id: string; label: string } | null;
  /** The course of treatment a PLAN_NEXT_STEP row is about. */
  plan: { title: string; nextStep: string } | null;
};

const SELECT = {
  id: true,
  kind: true,
  status: true,
  note: true,
  sendAfter: true,
  attempts: true,
  lastAttemptAt: true,
  resolvedAt: true,
  resolvedBy: { select: { firstName: true, lastName: true } },
  patient: {
    select: {
      // What a recall and a post-operative check quote. One row, and only ever
      // read for those two kinds.
      visitRecords: {
        orderBy: { visitDate: 'desc' as const },
        take: 1,
        select: { visitDate: true, servicesText: true },
      },
      /*
       * The plan a nudge is about, resolved at read time.
       *
       * Joined on every row rather than fetched separately for the few that
       * need it, and the trade is worth naming: this is one extra join over a
       * list bounded by what is *pending*, which is tens of rows on a busy
       * morning and not thousands. The alternative — a second query keyed by
       * the rows that turned out to be plan nudges — is two round trips and a
       * shape that only one kind understands.
       *
       * The oldest active plan with something still to do, which is the same
       * plan `queueStalledPlans` was looking at and the one a patient would
       * name if you asked them what they had not finished.
       */
      plans: {
        where: { status: 'ACTIVE' as const },
        orderBy: { createdAt: 'asc' as const },
        take: 1,
        select: {
          title: true,
          steps: {
            where: { status: 'PENDING' as const },
            orderBy: { position: 'asc' as const },
            take: 1,
            select: { title: true },
          },
        },
      },
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      email: true,
      emailBouncedAt: true,
      emailBounceKind: true,
      locale: true,
      contactConsent: true,
      preferredChannel: true,
    },
  },
  appointment: {
    select: { id: true, date: true, startTime: true, serviceName: true },
  },
  work: {
    select: {
      id: true,
      // Enough to say what came back in the patient's own terms. Three lines is
      // more than any case this practice sends out has ever had.
      lines: { orderBy: { position: 'asc' as const }, take: 3, select: { procedure: true, teeth: true } },
    },
  },
} as const;

type Row = {
  id: string;
  kind: string;
  status: MessageStatus;
  note: string | null;
  sendAfter: Date;
  attempts: number;
  lastAttemptAt: Date | null;
  resolvedAt: Date | null;
  resolvedBy: { firstName: string; lastName: string } | null;
  patient: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
    emailBouncedAt: Date | null;
    emailBounceKind: string | null;
    locale: string | null;
    contactConsent: boolean | null;
    preferredChannel: string | null;
    /** The newest visit, or none. See `QueuedMessage.lastVisit`. */
    visitRecords: Array<{ visitDate: Date; servicesText: string | null }>;
    plans: Array<{ title: string; steps: Array<{ title: string }> }>;
  };
  appointment: { id: string; date: Date; startTime: string; serviceName: string | null } | null;
  work: { id: string; lines: Array<{ procedure: string; teeth: string | null }> } | null;
};

/** "Crown 26, Bridge 14–16" — what the patient would call the thing they are waiting for. */
function workLabel(work: NonNullable<Row['work']>): string {
  const parts = work.lines
    .map((line) => [line.procedure.trim(), line.teeth?.trim()].filter(Boolean).join(' '))
    .filter((part) => part.length > 0);
  return parts.join(', ');
}

function toView(row: Row): QueuedMessage {
  const bounce = {
    bouncedAt: row.patient.emailBouncedAt,
    kind: row.patient.emailBounceKind,
  };
  const email = usableEmail(row.patient.email, bounce);
  const plan = row.patient.plans[0] ?? null;

  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    note: row.note,
    sendAfter: row.sendAfter,
    attempts: row.attempts,
    lastAttemptAt: row.lastAttemptAt,
    resolvedAt: row.resolvedAt,
    resolvedBy: row.resolvedBy
      ? `${row.resolvedBy.firstName} ${row.resolvedBy.lastName}`.trim()
      : '',
    patient: {
      id: row.patient.id,
      firstName: row.patient.firstName,
      lastName: row.patient.lastName,
      phone: row.patient.phone,
      email,
      // True only when there *was* an address and it was retired: a patient who
      // never gave one has nothing to explain.
      emailBounced: Boolean(row.patient.email?.trim()) && email === '',
      locale: row.patient.locale,
      contactConsent: row.patient.contactConsent,
      preferredChannel: row.patient.preferredChannel,
    },
    appointment: row.appointment
      ? {
          id: row.appointment.id,
          date: toDateKey(row.appointment.date),
          startTime: row.appointment.startTime,
          serviceName: row.appointment.serviceName ?? '',
        }
      : null,
    lastVisit: row.patient.visitRecords[0]
      ? toDateKey(row.patient.visitRecords[0].visitDate)
      : null,
    lastVisitServices: row.patient.visitRecords[0]?.servicesText ?? '',
    work: row.work ? { id: row.work.id, label: workLabel(row.work) } : null,
    plan: plan ? { title: plan.title, nextStep: plan.steps[0]?.title ?? '' } : null,
  };
}

/**
 * One row, in the same shape the queue screen sees.
 *
 * The send action's entry point. It reads the row rather than trusting the form
 * because that is where the recipient comes from — see `composeForQueued`.
 */
export async function getQueuedMessage(id: string): Promise<QueuedMessage | null> {
  if (!id) return null;
  const row = await prisma.scheduledMessage.findUnique({ where: { id }, select: SELECT });
  return row ? toView(row as Row) : null;
}

export type SendQueue = {
  /** Still ahead, still worth sending, and due now. The list the screen exists for. */
  waiting: QueuedMessage[];
  /**
   * Tried, refused by the mail provider, and waiting to come back.
   *
   * Its own list because it is its own situation. Before this existed a refused
   * send left the row PENDING with a sentence in `note` — honest, and
   * indistinguishable from a row nobody had got to, so a provider outage at nine
   * produced a queue of rows that each looked like work and each failed the same
   * way. Now the row steps aside for a few minutes, says how many times it has
   * been tried, and says when it comes back.
   */
  held: QueuedMessage[];
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
  const at = new Date();
  const now = { dateKey: toDateKey(day), minutes: clinicMinutesNow(at) };

  const [pending, resolved] = await Promise.all([
    prisma.scheduledMessage.findMany({
      where: { status: MessageStatus.PENDING },
      select: SELECT,
      // Soonest first: the queue is worked from the top, and the top should be
      // whoever is due back first. A recall has no appointment at all, so those
      // sort together at one end on `sendAfter` — which is right, because they
      // are not about a moment and cannot be late for one.
      orderBy: [{ appointment: { date: 'asc' } }, { sendAfter: 'asc' }],
    }),
    prisma.scheduledMessage.findMany({
      where: { status: { not: MessageStatus.PENDING }, resolvedAt: { gte: day } },
      select: SELECT,
      orderBy: { resolvedAt: 'desc' },
    }),
  ]);

  const waiting: QueuedMessage[] = [];
  const held: QueuedMessage[] = [];
  const passed: QueuedMessage[] = [];

  for (const row of pending as Row[]) {
    const view = toView(row);
    const slot = view.appointment
      ? { date: view.appointment.date, startTime: view.appointment.startTime }
      : null;

    // The order matters. A row whose slot has already begun is past helping
    // whether or not a send was refused ten minutes ago, so "too late" wins
    // over "come back in five minutes".
    if (!stillWorthSending(slot, now)) passed.push(view);
    else if (isHeld(view, at)) held.push(view);
    else waiting.push(view);
  }

  return { waiting, held, passed, handled: (resolved as Row[]).map(toView) };
}

/**
 * How many rows are actually waiting to be worked, for the bell.
 *
 * The same three questions `getSendQueue` asks — is it pending, is it still
 * worth sending, is it being held back from a refusal — asked of a count rather
 * than of a page, and that is the entire reason this function exists rather than
 * the bell counting something of its own.
 *
 * It counted something of its own until now: *tomorrow's appointments with no
 * reminder contact*, which is a different question with a different answer.
 * The two disagreed in both directions — the bell said nought while a dozen
 * recalls sat on the screen it linked to, and said three when the queue held
 * nine — and a badge that disagrees with the page behind it is worse than no
 * badge, because it teaches people that the number is decorative.
 *
 * Done in one query and one pass. The time-of-day comparison cannot be pushed
 * into SQL honestly — `startTime` is `HH:MM` in the clinic's own zone while the
 * date is a UTC midnight — so the small set of rows that could possibly be stale
 * is read and judged here, exactly as `withdrawPassedReminders` does it.
 */
export async function countWaitingMessages(): Promise<number> {
  const at = new Date();
  const now = { dateKey: toDateKey(today()), minutes: clinicMinutesNow(at) };

  const rows = await prisma.scheduledMessage.findMany({
    where: { status: MessageStatus.PENDING },
    select: {
      sendAfter: true,
      attempts: true,
      appointment: { select: { date: true, startTime: true } },
    },
  });

  return rows.filter((row) => {
    const slot = row.appointment
      ? { date: toDateKey(row.appointment.date), startTime: row.appointment.startTime }
      : null;
    return stillWorthSending(slot, now) && !isHeld(row, at);
  }).length;
}
