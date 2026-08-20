import { timeToMinutes } from '@/lib/dates';
import { MAIL_FAILURE_NOTES, MAIL_SENT_NOTE } from './email';

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

/**
 * Whether a queued reminder still has a point.
 *
 * The queue's own filter, and the reason it needs one: a reminder is *about* a
 * moment, and the row outlives the moment. The job queues tomorrow's bookings at
 * six in the evening; whoever works the queue may well be doing it at eleven the
 * next morning, by which time the nine o'clock has already come and gone. A list
 * that still offers to remind that patient is not merely useless — it is how
 * somebody ends up sending "see you tomorrow at 09:00" to a person sitting in
 * the waiting room.
 *
 * By the slot's *start* rather than its end. The question is not whether the
 * appointment is over, it is whether telling them about it could still change
 * anything, and once they are due in the chair it cannot.
 *
 * A row with no appointment — a birthday, a recall — has no moment to be late
 * for, so it is always still worth sending. `sendAfter` is what paces those.
 */
export function stillWorthSending(
  slot: { date: string; startTime: string } | null,
  now: { dateKey: string; minutes: number },
): boolean {
  if (!slot) return true;
  if (slot.date !== now.dateKey) return slot.date > now.dateKey;
  return timeToMinutes(slot.startTime) > now.minutes;
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
export type CancelReason =
  | 'rescheduled'
  | 'status-changed'
  | 'answered'
  | 'deleted'
  /** Nobody got to it in time — see `stillWorthSending`. */
  | 'passed'
  /** Somebody read the row and decided against it. */
  | 'set-aside';

export const CANCEL_NOTES: Record<CancelReason, string> = {
  rescheduled: 'the appointment moved',
  'status-changed': 'the appointment is no longer scheduled',
  answered: 'the patient answered before it was sent',
  deleted: 'the appointment was deleted',
  passed: 'the appointment had already begun',
  'set-aside': 'set aside by hand',
};

/**
 * The one-line `note` recording that somebody sent it, and how.
 *
 * "Opened" rather than "sent", and the wording is load-bearing. Pressing the
 * button hands the message to WhatsApp or to a mail client; what happens after
 * that is out of this app's sight, and `logContact` already says as much about
 * the `Contact` row it writes. The queue must not be the one place that claims
 * more than it knows.
 *
 * `PHONE` is the row somebody ticks off after ringing them, which is the one
 * channel where the practice really does know the message was delivered.
 */
export const SENT_NOTES: Record<'WHATSAPP' | 'EMAIL' | 'PHONE', string> = {
  WHATSAPP: 'opened in WhatsApp',
  EMAIL: 'opened in a mail client',
  PHONE: 'the patient was telephoned',
};

/**
 * The English note on the row, mapped back to something the UI can translate.
 *
 * A wrinkle worth naming rather than working around. `note` is stored English
 * because the job that writes it has no reader and therefore no language — a
 * clock cannot ask whose screen this will land on. But the screen it lands on
 * is an Albanian one four times out of five, and a queue that explains itself in
 * a language the front desk does not read explains nothing.
 *
 * So the note stays as written — it is what a restored database, a support
 * request or an audit trail will contain, and those want one stable wording —
 * and this maps the known ones onto translation keys. Anything unrecognised
 * falls through to the note itself, which is right: a row written by a future
 * version of this file should still say *something*.
 */
export function noteKey(note: string | null | undefined): string | null {
  if (!note) return null;
  return NOTE_KEYS[note] ?? null;
}

const NOTE_KEYS: Record<string, string> = {
  [SKIP_NOTES.answered]: 'skipAnswered',
  [SKIP_NOTES['already-contacted']]: 'skipContacted',
  [SKIP_NOTES['opted-out']]: 'skipOptedOut',
  [SKIP_NOTES['no-contact-details']]: 'skipNoDetails',
  [CANCEL_NOTES.rescheduled]: 'cancelRescheduled',
  [CANCEL_NOTES['status-changed']]: 'cancelStatus',
  [CANCEL_NOTES.answered]: 'cancelAnswered',
  [CANCEL_NOTES.deleted]: 'cancelDeleted',
  [CANCEL_NOTES.passed]: 'cancelPassed',
  [CANCEL_NOTES['set-aside']]: 'cancelSetAside',
  [SENT_NOTES.WHATSAPP]: 'sentWhatsapp',
  [SENT_NOTES.EMAIL]: 'sentEmail',
  [SENT_NOTES.PHONE]: 'sentPhone',
  // The notes the mailer writes. Registered here rather than beside them so
  // there is one table the screen consults, and so `tests/outbox.test.ts` can
  // sweep every note the app is capable of storing in a single pass.
  [MAIL_SENT_NOTE]: 'mailSent',
  [MAIL_FAILURE_NOTES.auth]: 'mailAuth',
  [MAIL_FAILURE_NOTES.rejected]: 'mailRejected',
  [MAIL_FAILURE_NOTES.limit]: 'mailLimit',
  [MAIL_FAILURE_NOTES.unreachable]: 'mailUnreachable',
};
