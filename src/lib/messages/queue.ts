import {
  AppointmentStatus,
  ContactChannel,
  ContactPurpose,
  MessageKind,
  MessageStatus,
} from '@/generated/prisma/enums';
import { addDays, clinicMinutesNow, toDateKey, today } from '@/lib/dates';
import { ACTIVE_PATIENTS } from '@/lib/patient-search';
import { summarisePlan } from '@/lib/plan-progress';
import { prisma } from '@/lib/prisma';
import { getFollowUps, getRecalls } from '@/lib/recalls';
import {
  CANCEL_NOTES,
  COURTESY_WINDOW_DAYS,
  dedupeKey,
  monthCycle,
  reminderWindow,
  shouldQueueCourtesy,
  shouldQueueReminder,
  SKIP_NOTES,
  stillWorthSending,
  usableEmail,
  type CancelReason,
  type MessageKind as OutboxKind,
} from './outbox';

/**
 * Filling the outbox, and emptying it again when the reason goes away.
 *
 * The queueing half runs on a clock. The cancelling half runs on every write
 * that could invalidate a queued row, and is the half worth being careful
 * about: a queue nobody prunes is a queue that eventually reminds somebody
 * about an appointment they cancelled a week ago, which is worse than never
 * having reminded them at all.
 */

/**
 * Queue reminders for tomorrow's bookings — and for what is left of today's.
 *
 * Idempotent by construction, not by checking: every row carries a `dedupeKey`
 * unique on the table, so a second run inside the same day collides and is
 * skipped rather than duplicating. That is why `createMany` with
 * `skipDuplicates` is right here and a find-then-insert would not be — the
 * latter has a race, and this job may well be triggered twice by a deploy
 * restarting the container at the wrong minute.
 *
 * Rows the rules refuse are recorded as SKIPPED rather than left out. A queue
 * that silently omits somebody cannot answer "why did Mr Hoxha not get one?",
 * and that is the question the front desk actually asks.
 *
 * ## Why today is in the window at all
 *
 * The clock fires this twice — at six in the evening and again at seven the
 * next morning — and the morning run exists for one case: *"the evening run
 * cannot see an evening booking"*. A slot taken at half past six for nine the
 * next morning is not in the diary when the evening run reads it.
 *
 * For as long as this looked only at `today() + 1`, the morning run did not
 * catch that case and could not have. `today()` is the clinic's current day, so
 * by seven the next morning it has already rolled over: the 18:00 Monday run
 * queues Tuesday, and the 07:00 Tuesday run queues *Wednesday*. Both runs that
 * covered Tuesday happened on Monday, and the booking made at half past six on
 * Monday evening was queued by neither. The dashboard's live "to remind" panel
 * showed that patient the whole time, so the two surfaces disagreed and the
 * incomplete one was the queue somebody is told to work down.
 *
 * Including today closes it, and costs nothing, because the two properties that
 * make it safe were already here:
 *
 *  - `dedupeKey` is `reminder:<appointmentId>` — one booking, one reminder,
 *    ever. Today's slots were almost all queued yesterday, so they collide and
 *    are skipped. Only the ones nothing has seen yet are new.
 *  - `stillWorthSending` drops a slot once it has begun. Reminding somebody at
 *    seven about nine o'clock is the point; reminding them at six in the evening
 *    about nine that morning is how "see you tomorrow at 09:00" reaches a person
 *    sitting in the waiting room.
 */
/**
 * Withdraw rows whose moment has been and gone.
 *
 * The one piece of tidying the queue cannot do for itself. Every other way a
 * PENDING row stops being worth sending is an *event* — the slot moves, the
 * patient answers, somebody cancels — and each of those has a write it can hang
 * off. Time passing is not an event: nothing happens at nine o'clock, so nothing
 * runs, and the row sits there.
 *
 * The queue screen shows these rather than filtering them away, because a
 * reminder nobody got to is worth knowing about. But shown is not the same as
 * kept: without this they would accumulate for the life of the practice, and a
 * bucket that only ever grows is one people stop reading.
 */
export async function withdrawPassedReminders(): Promise<number> {
  const now = { dateKey: toDateKey(today()), minutes: clinicMinutesNow() };

  const stale = await prisma.scheduledMessage.findMany({
    where: {
      status: MessageStatus.PENDING,
      // Everything before today is past by definition; today's rows need the
      // clock. Anything later cannot be stale, and this is what keeps the scan
      // off the whole table.
      appointment: { date: { lte: today() } },
    },
    select: { id: true, appointment: { select: { date: true, startTime: true } } },
  });

  const passed = stale
    .filter(
      (row) =>
        row.appointment &&
        !stillWorthSending(
          { date: toDateKey(row.appointment.date), startTime: row.appointment.startTime },
          now,
        ),
    )
    .map((row) => row.id);

  if (passed.length === 0) return 0;

  const { count } = await prisma.scheduledMessage.updateMany({
    where: { id: { in: passed }, status: MessageStatus.PENDING },
    data: {
      status: MessageStatus.CANCELLED,
      note: CANCEL_NOTES.passed,
      resolvedAt: new Date(),
    },
  });

  return count;
}

export async function queueAppointmentReminders(): Promise<string> {
  const withdrawn = await withdrawPassedReminders();

  const now = new Date();
  const { from, to } = reminderWindow(today(now));

  const appointments = await prisma.appointment.findMany({
    where: {
      date: { gte: from, lte: to },
      status: AppointmentStatus.SCHEDULED,
      patient: ACTIVE_PATIENTS,
    },
    select: {
      id: true,
      // Both only so `stillWorthSending` can be asked about today's rows. A
      // booking tomorrow is always still ahead; one this morning may not be.
      date: true,
      startTime: true,
      patientId: true,
      confirmedAt: true,
      declinedAt: true,
      patient: {
        select: {
          phone: true,
          email: true,
          emailBouncedAt: true,
          emailBounceKind: true,
          contactConsent: true,
        },
      },
      contacts: {
        where: { purpose: ContactPurpose.REMINDER },
        select: { id: true },
        take: 1,
      },
    },
  });

  // The same clock `withdrawPassedReminders` judges by, so a row this run
  // declines to queue is exactly a row that run would have withdrawn.
  const clock = { dateKey: toDateKey(from), minutes: clinicMinutesNow(now) };
  const upcoming = appointments.filter((appointment) =>
    stillWorthSending(
      { date: toDateKey(appointment.date), startTime: appointment.startTime },
      clock,
    ),
  );

  const rows = upcoming.map((appointment) => {
    const decision = shouldQueueReminder({
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      contactConsent: appointment.patient.contactConsent,
      phone: appointment.patient.phone,
      // Through `usableEmail`, so an address the provider has told us is dead
      // counts as no address — which for a patient with a telephone changes
      // nothing, and for a patient without one turns a message nobody would
      // ever receive into a skip somebody can act on.
      email: usableEmail(appointment.patient.email, {
        bouncedAt: appointment.patient.emailBouncedAt,
        kind: appointment.patient.emailBounceKind,
      }),
      answered: appointment.confirmedAt !== null || appointment.declinedAt !== null,
      alreadyContacted: appointment.contacts.length > 0,
    });

    return {
      kind: 'APPOINTMENT_REMINDER' as const,
      dedupeKey: dedupeKey('APPOINTMENT_REMINDER', appointment.id),
      patientId: appointment.patientId,
      appointmentId: appointment.id,
      sendAfter: now,
      ...(decision.queue
        ? { status: MessageStatus.PENDING }
        : {
            status: MessageStatus.SKIPPED,
            note: SKIP_NOTES[decision.reason],
            resolvedAt: now,
          }),
    };
  });

  // Reported either way, so a run that only tidied still says what it did — a
  // `JobRun` reading "no appointments" while it withdrew nine stale rows would
  // be an accurate sentence about the wrong half of the job.
  const tidied = withdrawn > 0 ? `withdrew ${withdrawn} that had passed; ` : '';

  // Stated rather than left as the gap between two numbers. Today is in the
  // window now, so most runs pass over a few slots that have already begun, and
  // a reader comparing "12 booked" with "9 queued" has no other way to tell
  // that apart from nine rows having collided on their dedupe key.
  const begun = appointments.length - upcoming.length;
  const underWay = begun > 0 ? `, ${begun} already under way` : '';

  if (rows.length === 0) return `${tidied}nothing left to remind today or tomorrow${underWay}`;

  const { count } = await prisma.scheduledMessage.createMany({
    data: rows,
    skipDuplicates: true,
  });

  const pending = rows.filter((row) => row.status === MessageStatus.PENDING).length;
  const skipped = rows.length - pending;

  return `${tidied}${upcoming.length} still ahead today or tomorrow${underWay}; queued ${count} new (${pending} to send, ${skipped} skipped)`;
}

/**
 * Fill the outbox with the patients the recall list is already naming.
 *
 * The second tenant of machinery built for several, and the more consequential
 * one. Until now the *appointment reminder* — a courtesy about a slot the
 * patient has already agreed to — had the clock, the queue, the dedupe and a
 * recorded reason on every row the rules declined, while the recall had a list
 * somebody had to remember to open. A patient nobody has seen for eight months
 * is the one this practice loses.
 *
 * **It decides nothing of its own.** `getRecalls` is the single authority on who
 * is due, exactly as the recall screen reads it — so the queue and the list
 * cannot disagree, and the fix that taught that list to read the contact log
 * (`lastChasedAt`) protects this too. What this adds is the two questions the
 * recall list deliberately leaves to a person: consent, and whether the practice
 * has any way to reach them.
 *
 * Idempotent by the same construction the reminder job uses — one row per
 * patient per month, enforced by `dedupeKey` on the table rather than by a
 * find-then-insert that would race.
 */
export async function queueRecalls(): Promise<string> {
  const withdrawn = await withdrawSettledRecalls();

  const due = await getRecalls();
  const now = new Date();
  const cycle = monthCycle(now);
  const heard = await recentContacts(due.map((patient) => patient.id));

  const rows = due.map((patient) => {
    const decision = shouldQueueCourtesy({
      contactConsent: patient.contactConsent,
      phone: patient.phone,
      email: patient.email,
      recentContacts: heard.get(patient.id) ?? 0,
    });

    return {
      kind: MessageKind.RECALL_DUE,
      dedupeKey: dedupeKey('RECALL_DUE', patient.id, cycle),
      patientId: patient.id,
      sendAfter: now,
      ...(decision.queue
        ? { status: MessageStatus.PENDING }
        : {
            status: MessageStatus.SKIPPED,
            note: SKIP_NOTES[decision.reason],
            resolvedAt: now,
          }),
    };
  });

  const tidied = withdrawn > 0 ? `withdrew ${withdrawn} no longer due; ` : '';
  if (rows.length === 0) return `${tidied}nobody is overdue`;

  const { count } = await prisma.scheduledMessage.createMany({
    data: rows,
    skipDuplicates: true,
  });

  const pending = rows.filter((row) => row.status === MessageStatus.PENDING).length;
  return `${tidied}${due.length} overdue; queued ${count} new (${pending} to send, ${rows.length - pending} skipped)`;
}

/**
 * Withdraw queued recalls for patients who are no longer due.
 *
 * The counterpart to `cancelScheduledFor`, and it cannot work the same way. A
 * reminder is about one appointment, so every event that invalidates it — the
 * slot moves, is cancelled, is answered — has a write to hang the withdrawal
 * off. A recall is about an *absence*, and absences end quietly: the patient
 * rings up and books, somebody chases them by hand, somebody snoozes them. Only
 * the first of those three even touches a table this could hook into.
 *
 * So it is settled by comparison rather than by event. Whoever `getRecalls` no
 * longer names is no longer due, whatever the reason — which keeps one authority
 * for the whole question instead of a growing list of writes that must each
 * remember to prune a queue.
 */
export async function withdrawSettledRecalls(): Promise<number> {
  const stillDue = new Set((await getRecalls()).map((patient) => patient.id));
  return withdrawSettled(MessageKind.RECALL_DUE, stillDue, 'no-longer-due');
}

/**
 * Withdraw anything still waiting to be sent about one appointment.
 *
 * Called from every path that changes what a booking *is* — rescheduling,
 * status changes, deletion, and the patient answering their own confirmation
 * link. Only PENDING rows are touched: a message already sent is a fact, and a
 * row already skipped has its own reason on it that this must not overwrite.
 *
 * Never throws. A reminder that fails to withdraw is a message somebody may
 * send by hand and then wonder about; an appointment that fails to cancel
 * because the outbox was unreachable is a slot the practice believes it still
 * has. The second is much worse, so this is deliberately unable to cause it.
 */
export async function cancelScheduledFor(
  appointmentId: string,
  reason: CancelReason,
): Promise<number> {
  if (!appointmentId) return 0;

  try {
    const { count } = await prisma.scheduledMessage.updateMany({
      where: { appointmentId, status: MessageStatus.PENDING },
      data: {
        status: MessageStatus.CANCELLED,
        note: CANCEL_NOTES[reason],
        resolvedAt: new Date(),
      },
    });
    return count;
  } catch (error) {
    console.error('[messages] could not withdraw queued reminders for', appointmentId, error);
    return 0;
  }
}

/**
 * How much this patient has already heard from the practice this week.
 *
 * The one thing four separate lists could never see: each of them politely
 * declines to be the second message *of its own kind*, and between them they
 * send four. The recall list has had a thirty-day cooldown since it was written
 * and it works — on recalls. It has never known about the reminder that went out
 * on Tuesday, the "your crown is back" on Wednesday, or the note somebody typed
 * by hand on Thursday.
 *
 * Counted from the `Contact` log rather than from this table, deliberately.
 * `Contact` is where *everything* the practice has put in front of a patient is
 * recorded — the queue's sends, the reminder links, the composer, the telephone
 * calls — and a ceiling that only counted queued messages would be blind to
 * exactly the channel the front desk uses most.
 *
 * `IN_PERSON` is excluded. A conversation at the desk is not something that
 * arrives on somebody's telephone at nine in the evening, and counting it would
 * mean a patient who came in on Monday is unreachable for the rest of the week.
 */
async function recentContacts(patientIds: string[]): Promise<Map<string, number>> {
  if (patientIds.length === 0) return new Map();

  const rows = await prisma.contact.groupBy({
    by: ['patientId'],
    where: {
      patientId: { in: patientIds },
      createdAt: { gte: addDays(today(), -COURTESY_WINDOW_DAYS) },
      channel: { not: ContactChannel.IN_PERSON },
    },
    _count: { _all: true },
  });

  return new Map(rows.map((row) => [row.patientId, row._count._all]));
}

/**
 * The four kinds `fileCourtesy` will file, named as a type.
 *
 * Narrower than `MessageKind` on purpose: an appointment reminder must never
 * come through here, because it is exempt from the contact ceiling and its
 * rules ask two questions these do not (has the patient answered, has somebody
 * already reminded them).
 */
type CourtesyKind = Extract<
  OutboxKind,
  'RECALL_DUE' | 'POST_OP_CHECK' | 'WORK_READY' | 'PLAN_NEXT_STEP'
>;

/** One candidate for a courtesy message, with everything the rules ask about. */
type Courtesy = {
  patientId: string;
  /** What makes it unique. Built by the caller, because only it knows the period. */
  key: string;
  contactConsent: boolean | null;
  phone: string;
  email: string;
  /** The case this is about, for WORK_READY. */
  workId?: string;
};

/**
 * File a batch of courtesy candidates, deciding each one and recording why.
 *
 * The shared spine of the four kinds that are not appointment reminders. Each of
 * them answers "who" differently — an overdue check-up, a visit four days ago, a
 * case back from the laboratory, a plan gone quiet — and every one of them
 * answers "whether" identically: consent, contact details, and how much this
 * patient has already heard from us. One function, so that the opt-out cannot
 * be honoured by three kinds and forgotten by the fourth.
 *
 * Idempotent by construction, exactly as the reminder job is: `dedupeKey` is
 * unique on the table, so a second run inside the same period collides and is
 * skipped rather than duplicating. That is why `createMany` with
 * `skipDuplicates` is right and a find-then-insert would not be.
 */
async function fileCourtesy(
  kind: CourtesyKind,
  candidates: Courtesy[],
): Promise<{ queued: number; pending: number; skipped: number }> {
  if (candidates.length === 0) return { queued: 0, pending: 0, skipped: 0 };

  const now = new Date();
  const heard = await recentContacts(candidates.map((candidate) => candidate.patientId));

  const rows = candidates.map((candidate) => {
    const decision = shouldQueueCourtesy({
      contactConsent: candidate.contactConsent,
      phone: candidate.phone,
      email: candidate.email,
      recentContacts: heard.get(candidate.patientId) ?? 0,
    });

    return {
      kind: MessageKind[kind],
      dedupeKey: candidate.key,
      patientId: candidate.patientId,
      workId: candidate.workId ?? null,
      sendAfter: now,
      // Rows the rules refuse are recorded as SKIPPED rather than left out. A
      // queue that silently omits somebody cannot answer "why did Mr Hoxha not
      // get one?", which is the question the front desk actually asks.
      ...(decision.queue
        ? { status: MessageStatus.PENDING }
        : { status: MessageStatus.SKIPPED, note: SKIP_NOTES[decision.reason], resolvedAt: now }),
    };
  });

  const { count } = await prisma.scheduledMessage.createMany({ data: rows, skipDuplicates: true });
  const pending = rows.filter((row) => row.status === MessageStatus.PENDING).length;

  return { queued: count, pending, skipped: rows.length - pending };
}

/**
 * Withdraw pending rows of one kind for patients a list no longer names.
 *
 * The shape `withdrawSettledRecalls` established, generalised when three more
 * kinds needed exactly it. Settled by *comparison* rather than by event, and
 * that is the whole reason it can be shared: none of these four is about a
 * booking, so none of them has a write to hang a withdrawal off. A patient stops
 * being overdue, stops being freshly treated, or finishes their plan quietly,
 * and the only honest way to notice is to ask the authority again.
 */
async function withdrawSettled(
  kind: MessageKind,
  stillDue: ReadonlySet<string>,
  reason: CancelReason,
): Promise<number> {
  const pending = await prisma.scheduledMessage.findMany({
    where: { kind, status: MessageStatus.PENDING },
    select: { id: true, patientId: true },
  });
  if (pending.length === 0) return 0;

  const settled = pending.filter((row) => !stillDue.has(row.patientId)).map((row) => row.id);
  if (settled.length === 0) return 0;

  const { count } = await prisma.scheduledMessage.updateMany({
    where: { id: { in: settled }, status: MessageStatus.PENDING },
    data: { status: MessageStatus.CANCELLED, note: CANCEL_NOTES[reason], resolvedAt: new Date() },
  });

  return count;
}

/**
 * Withdraw every pending row a clause matches, with one reason.
 *
 * The counterpart to `withdrawSettled` for the questions the database can
 * answer by itself. A recall is settled by *comparison* — whoever `getRecalls`
 * no longer names — because "overdue" is not a column. "Has an appointment
 * booked" and "came back a fortnight ago" are both plain clauses, and asking
 * them as clauses keeps the reason on the row exact instead of merging two
 * different things that happened into one sentence.
 */
async function withdrawWhere(
  where: Parameters<typeof prisma.scheduledMessage.updateMany>[0]['where'],
  reason: CancelReason,
): Promise<number> {
  const { count } = await prisma.scheduledMessage.updateMany({
    where,
    data: { status: MessageStatus.CANCELLED, note: CANCEL_NOTES[reason], resolvedAt: new Date() },
  });
  return count;
}

/**
 * Queue the "how are you getting on?" message for people treated a few days ago.
 *
 * `getFollowUps` is the single authority on who, exactly as `getRecalls` is for
 * the recall — so the queue and the screen cannot disagree, and the window
 * (`FOLLOW_UP_FROM_DAYS` to `FOLLOW_UP_TO_DAYS`) stays one decision in one
 * place. What this adds is the two questions that list leaves to a person:
 * consent, and whether there is any way to reach them.
 *
 * Daily, because the window is only a few days wide. That is also why it was
 * the worst-served list in the app: a courtesy you have four days to perform is
 * one that happens on the mornings the practice is quiet enough to remember it.
 *
 * Keyed by the visit day, so a patient treated twice in a fortnight is asked
 * twice and a job that runs every morning through the window asks once.
 */
export async function queuePostOpChecks(): Promise<string> {
  const due = await getFollowUps();
  const withdrawn = await withdrawSettled(
    MessageKind.POST_OP_CHECK,
    new Set(due.map((patient) => patient.id)),
    'window-closed',
  );

  const tidied = withdrawn > 0 ? `withdrew ${withdrawn} past their window; ` : '';
  if (due.length === 0) return `${tidied}nobody was treated in the window`;

  const { queued, pending, skipped } = await fileCourtesy(
    'POST_OP_CHECK',
    due.map((patient) => ({
      patientId: patient.id,
      key: dedupeKey('POST_OP_CHECK', patient.id, patient.lastVisit),
      contactConsent: patient.contactConsent,
      phone: patient.phone,
      email: patient.email,
    })),
  );

  return `${tidied}${due.length} treated recently; queued ${queued} new (${pending} to send, ${skipped} skipped)`;
}

/**
 * How far back to look for cases that have come home.
 *
 * A fortnight, and the number is doing one specific job: without it, the first
 * run of this job after the release would queue a message for every case the
 * register has *ever* received, and a practice would spend a morning telling
 * two hundred people that a crown fitted last spring is ready. It keeps earning
 * its keep afterwards as the honest limit on the claim — telling somebody in
 * October that something arrived in August is not news, it is an apology.
 */
const WORK_READY_DAYS = 14;

/**
 * Tell the patient their case is back from the laboratory.
 *
 * The one message on the whole queue that the patient is actively waiting for,
 * and the one the practice was worst at: `receivedAt` has been stamped on the
 * register since the register existed, the works screen shows it, and the person
 * whose crown it is found out when somebody remembered to ring.
 *
 * **Only when they have nothing booked.** A patient with an appointment ahead of
 * them is already going to be told — by the reminder, and by whoever greets
 * them — and a message saying "your crown is back" two days before a slot booked
 * to fit it is noise dressed up as service. That check is also what makes the
 * withdrawal rule obvious: book them, and the row goes away.
 */
export async function queueWorkReady(): Promise<string> {
  const day = today();

  const works = await prisma.work.findMany({
    where: {
      receivedAt: { not: null, gte: addDays(day, -WORK_READY_DAYS) },
      patientId: { not: null },
      patient: ACTIVE_PATIENTS,
    },
    select: {
      id: true,
      patientId: true,
      patient: {
        select: {
          id: true,
          phone: true,
          email: true,
          emailBouncedAt: true,
          emailBounceKind: true,
          contactConsent: true,
          appointments: {
            where: { date: { gte: day }, status: AppointmentStatus.SCHEDULED },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });

  // Anybody who has since booked. Read from the same rows rather than by a
  // second query, so the queueing and the withdrawing use one answer.
  const booked = new Set(
    works
      .filter((work) => work.patient && work.patient.appointments.length > 0)
      .map((work) => work.patient!.id),
  );

  const waiting = works.filter((work) => work.patient && !booked.has(work.patient.id));

  // Two withdrawals rather than one comparison, because these are two different
  // sentences on the handled list and a person reads that list to find out what
  // happened. "They have an appointment booked" is somebody being told in
  // person; "too late" is a case that came back a fortnight ago and was never
  // announced, which is worth looking at rather than dressing up.
  const withdrawn =
    (await withdrawWhere(
      {
        kind: MessageKind.WORK_READY,
        status: MessageStatus.PENDING,
        patient: {
          appointments: {
            some: { date: { gte: day }, status: AppointmentStatus.SCHEDULED },
          },
        },
      },
      'booked-in',
    )) +
    (await withdrawWhere(
      {
        kind: MessageKind.WORK_READY,
        status: MessageStatus.PENDING,
        work: { receivedAt: { lt: addDays(day, -WORK_READY_DAYS) } },
      },
      'window-closed',
    ));

  const tidied = withdrawn > 0 ? `withdrew ${withdrawn}; ` : '';
  if (waiting.length === 0) return `${tidied}nothing back and unannounced`;

  const { queued, pending, skipped } = await fileCourtesy(
    'WORK_READY',
    waiting.map((work) => ({
      patientId: work.patient!.id,
      // The case, not the patient: somebody with two crowns back has waited
      // for both, and each arrival is its own piece of news.
      key: dedupeKey('WORK_READY', work.id),
      workId: work.id,
      contactConsent: work.patient!.contactConsent,
      phone: work.patient!.phone,
      email: usableEmail(work.patient!.email, {
        bouncedAt: work.patient!.emailBouncedAt,
        kind: work.patient!.emailBounceKind,
      }),
    })),
  );

  return `${tidied}${waiting.length} back and unbooked; queued ${queued} new (${pending} to send, ${skipped} skipped)`;
}

/**
 * Put the patients whose treatment stopped halfway in front of somebody.
 *
 * `summarisePlan` already calls a plan stalled — sixty quiet days with nothing
 * booked — and the plans screen has had a tab for them since it was written.
 * This is that tab handed over instead of waited for, and it is the same move
 * the recall made: a list that has to be opened is a list that is opened on the
 * quiet mornings.
 *
 * Keyed by patient and month rather than by plan, because two stalled plans for
 * one person are one telephone call. Weekly, for the reason the recall is
 * weekly: a stalled plan is not urgent on any particular morning, and a queue
 * that refilled itself every night would be read as noise by the third day.
 */
export async function queueStalledPlans(): Promise<string> {
  const now = today();

  const plans = await prisma.treatmentPlan.findMany({
    where: { status: 'ACTIVE', patient: ACTIVE_PATIENTS },
    select: {
      id: true,
      status: true,
      createdAt: true,
      followUpOn: true,
      lastContactedAt: true,
      patient: {
        select: {
          id: true,
          phone: true,
          email: true,
          emailBouncedAt: true,
          emailBounceKind: true,
          contactConsent: true,
        },
      },
      steps: {
        select: {
          status: true,
          completedAt: true,
          appointment: { select: { date: true, startTime: true, status: true } },
        },
      },
    },
  });

  // Narrowed by the same function the screen narrows with, rather than by a
  // second reading of the same rule — the arrangement `plans/export` states.
  const stalled = plans.filter((plan) => summarisePlan(plan, now).stalled);

  // One row per patient. `first wins` is arbitrary only in appearance: the
  // message names the plan, and the wording is composed from the patient's
  // oldest active plan at draw time, which is this one.
  const byPatient = new Map<string, (typeof stalled)[number]>();
  for (const plan of stalled) {
    if (!byPatient.has(plan.patient.id)) byPatient.set(plan.patient.id, plan);
  }

  const withdrawn = await withdrawSettled(
    MessageKind.PLAN_NEXT_STEP,
    new Set(byPatient.keys()),
    'no-longer-due',
  );

  const tidied = withdrawn > 0 ? `withdrew ${withdrawn} no longer stalled; ` : '';
  if (byPatient.size === 0) return `${tidied}no plan has gone quiet`;

  const cycle = monthCycle(new Date());
  const { queued, pending, skipped } = await fileCourtesy(
    'PLAN_NEXT_STEP',
    [...byPatient.values()].map((plan) => ({
      patientId: plan.patient.id,
      key: dedupeKey('PLAN_NEXT_STEP', plan.patient.id, cycle),
      contactConsent: plan.patient.contactConsent,
      phone: plan.patient.phone,
      email: usableEmail(plan.patient.email, {
        bouncedAt: plan.patient.emailBouncedAt,
        kind: plan.patient.emailBounceKind,
      }),
    })),
  );

  return `${tidied}${byPatient.size} stalled; queued ${queued} new (${pending} to send, ${skipped} skipped)`;
}
