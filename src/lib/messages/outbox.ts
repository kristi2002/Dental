/**
 * What the outbox queues, and what it refuses to.
 *
 * Pure, and free of the generated Prisma client, so `tests/outbox.test.ts` can
 * exercise the rules without a database — the same arrangement `follow-ups.ts`
 * and `recalls.ts` use. The queries that feed these live in the job; the
 * decisions live here.
 */

/** Mirrors `MessageKind` in the schema, written out so this module stays pure. */
export type MessageKind = 'APPOINTMENT_REMINDER';

/**
 * The unique column that makes a clock safe to run twice.
 *
 * Built here rather than in the job so that the shape of a key is one decision
 * in one place. The namespace prefix matters as much as the id: a kind that
 * recurs for the same subject — a birthday, a six-monthly recall — has to be
 * able to say *which* occurrence it is, and it does that by putting the period
 * in the key rather than by this table growing a column it would only sometimes
 * use.
 *
 *     reminder:<appointmentId>        one booking, one reminder, ever
 *     birthday:<patientId>:2026       once a year
 *     recall:<patientId>:2026-08      once a cycle
 *
 * Only the first exists today. The other two are written down because the shape
 * has to accommodate them or it is the wrong shape.
 */
export function dedupeKey(kind: MessageKind, ...parts: string[]): string {
  const prefix: Record<MessageKind, string> = { APPOINTMENT_REMINDER: 'reminder' };
  return [prefix[kind], ...parts].join(':');
}

/** How far ahead the reminder job looks. Tomorrow, and only tomorrow. */
export const REMINDER_DAYS_AHEAD = 1;

/**
 * Everything the decision needs about one booking, and nothing else.
 *
 * Deliberately not the Prisma row: the rule is about a handful of facts, and
 * naming them is what lets the test state a case in four lines instead of
 * constructing an appointment.
 */
export type ReminderCandidate = {
  appointmentId: string;
  patientId: string;
  /** Tri-state, as `Patient.contactConsent`. `null` is "nobody asked". */
  contactConsent: boolean | null;
  phone: string;
  email: string;
  /** The patient has already said yes or no to this slot. */
  answered: boolean;
  /** Somebody has already put a reminder for this slot in front of them. */
  alreadyContacted: boolean;
};

export type QueueDecision =
  | { queue: true }
  | { queue: false; reason: 'answered' | 'already-contacted' | 'opted-out' | 'no-contact-details' };

/**
 * Whether a booking is worth queueing a reminder for.
 *
 * The order is not arbitrary. "They already answered" and "we already told
 * them" come first because those are not refusals — nothing is wrong, the
 * message is simply unnecessary, and a queue that listed them would train
 * whoever works it to skim. Consent is next because asking somebody who said
 * not to is worse than not asking at all, and it is the one reason here that is
 * about the patient's wishes rather than about the practice's records. Missing
 * details come last, because that is the only one somebody can fix.
 */
export function shouldQueueReminder(candidate: ReminderCandidate): QueueDecision {
  if (candidate.answered) return { queue: false, reason: 'answered' };
  if (candidate.alreadyContacted) return { queue: false, reason: 'already-contacted' };

  // Explicit `false` only. `null` is "nobody has asked", which is the honest
  // state of every record predating the question and is not a refusal — the
  // same reading `ReminderLinks` and `getUnremindedTomorrow` already take.
  if (candidate.contactConsent === false) return { queue: false, reason: 'opted-out' };

  if (!candidate.phone.trim() && !candidate.email.trim()) {
    return { queue: false, reason: 'no-contact-details' };
  }

  return { queue: true };
}

/** The one-line `note` explaining a row that was queued and then set aside. */
export const SKIP_NOTES: Record<Exclude<QueueDecision, { queue: true }>['reason'], string> = {
  answered: 'the patient had already answered',
  'already-contacted': 'somebody had already reminded them',
  'opted-out': 'the patient asked not to be contacted',
  'no-contact-details': 'no phone number and no email address',
};

/**
 * Why a queued reminder stops being worth sending.
 *
 * A slot that moves, is cancelled, is completed, or that the patient answers,
 * leaves a PENDING row describing something that is no longer true. Nothing
 * about a queue makes that self-correcting — this is the propagation the
 * blueprint calls T1, and forgetting it is how an outbox starts sending people
 * reminders for appointments they cancelled last week.
 */
export type CancelReason = 'rescheduled' | 'status-changed' | 'answered' | 'deleted';

export const CANCEL_NOTES: Record<CancelReason, string> = {
  rescheduled: 'the appointment moved',
  'status-changed': 'the appointment is no longer scheduled',
  answered: 'the patient answered before it was sent',
  deleted: 'the appointment was deleted',
};
