import { addDays, timeToMinutes } from '@/lib/dates';
import { MAIL_FAILURE_NOTES, MAIL_SENT_NOTE, type MailFailure } from './email';

/**
 * What the outbox queues, and what it refuses to.
 *
 * Pure, and free of the generated Prisma client, so `tests/outbox.test.ts` can
 * exercise the rules without a database — the same arrangement `follow-ups.ts`
 * and `recalls.ts` use. The queries that feed these live in the job; the
 * decisions live here.
 */

/** Mirrors `MessageKind` in the schema, written out so this module stays pure. */
export type MessageKind =
  | 'APPOINTMENT_REMINDER'
  | 'RECALL_DUE'
  | 'POST_OP_CHECK'
  | 'WORK_READY'
  | 'PLAN_NEXT_STEP';

/**
 * The kinds that are a courtesy rather than an obligation.
 *
 * The distinction earns its keep in exactly one place — the contact ceiling —
 * and it is worth stating rather than inferring from "has no appointment". An
 * appointment reminder is about a slot the patient agreed to and must go out
 * however much else they have heard from us this week. Everything else on this
 * list is the practice deciding to get in touch, and four such decisions inside
 * one week are not four courtesies.
 */
export const COURTESY_KINDS: ReadonlyArray<MessageKind> = [
  'RECALL_DUE',
  'POST_OP_CHECK',
  'WORK_READY',
  'PLAN_NEXT_STEP',
];

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
  const prefix: Record<MessageKind, string> = {
    APPOINTMENT_REMINDER: 'reminder',
    RECALL_DUE: 'recall',
    // Keyed by the day of the visit rather than by a month: somebody treated
    // twice in a fortnight is owed two of these, and the window this list is
    // read over is only a few days wide.
    POST_OP_CHECK: 'postop',
    // One arrival, one message, ever — and the subject is the case rather than
    // the patient, because somebody with two crowns back has waited for both.
    WORK_READY: 'work',
    // By patient and month, not by plan: two stalled plans for one person are
    // one telephone call.
    PLAN_NEXT_STEP: 'plan',
  };
  return [prefix[kind], ...parts].join(':');
}

/**
 * Which cycle a monthly kind belongs to — the `2026-08` in
 * `recall:<patientId>:2026-08`, and in `plan:<patientId>:2026-08` beside it.
 *
 * The period goes in the key rather than in a column, which is the shape this
 * function's own doc reserved for exactly this case. A month is the right grain:
 * it is longer than the thirty-day cooldown a recall already answers to, so a
 * patient cannot be queued twice for one overdue check-up, and short enough that
 * somebody still overdue in November is asked about again rather than dropping
 * out of the queue for ever after one unanswered August.
 */
export function monthCycle(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * How far *ahead* the reminder job looks. Tomorrow, and no further.
 *
 * The window it actually reads is `today() … today() + this`, because the
 * morning run has to be able to catch a slot booked late yesterday evening for
 * this morning — see `queueAppointmentReminders`. So this is the far edge only;
 * the near edge is always today.
 */
export const REMINDER_DAYS_AHEAD = 1;

/**
 * The days the reminder job reads, given the moment it runs at.
 *
 * A decision rather than a query, so it lives here with the other rules and can
 * be tested without a database — and so the property that matters is stated
 * once: **the window always starts at today**, whatever hour the clock fires at.
 *
 * That is the whole of the fix for the gap the two triggers were meant to close
 * between them. `today()` rolls over overnight, so a window of `today() + 1`
 * alone means the 18:00 Monday run and the 07:00 Tuesday run cover different
 * days — Tuesday and Wednesday — and a slot booked late on Monday for Tuesday
 * morning is read by neither. Anchoring the near edge to today makes the morning
 * run a genuine second look at the day in front of it.
 */
export function reminderWindow(today: Date): { from: Date; to: Date } {
  return { from: today, to: addDays(today, REMINDER_DAYS_AHEAD) };
}

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
  | {
      queue: false;
      reason:
        | 'answered'
        | 'already-contacted'
        | 'opted-out'
        | 'no-contact-details'
        | 'recently-contacted';
    };

/**
 * How long a courtesy remembers the others.
 *
 * A week, and two of them inside it. The recall list has had a thirty-day
 * cooldown since it was written, and it works — but it can only see the
 * contacts *it* counts as chasing, so it has never known about the reminder
 * that went out on Tuesday, the "your crown is back" on Wednesday, or the
 * message somebody typed by hand on Thursday. Four systems each politely
 * declining to be the third message this week, and between them sending five.
 *
 * Two rather than one because a practice genuinely does have two things to say
 * in a week — a crown arriving two days after a filling is not a nuisance — and
 * because a ceiling of one would make the *order the jobs happen to run in*
 * decide which message a patient gets.
 */
export const COURTESY_WINDOW_DAYS = 7;
export const MAX_COURTESY_CONTACTS = 2;

/**
 * An address the practice may actually use.
 *
 * A bounced address is not an address, and this is the one place that is
 * decided. Everything downstream — whether there is any way to reach this
 * patient at all, whether the queue offers an email button — reads the answer
 * rather than the column, so a hard bounce recorded by the delivery webhook
 * changes every one of those at once instead of in four places that must each
 * remember. The patient keeps their telephone, so they keep being queued.
 *
 * `SOFT` is deliberately still usable: a full mailbox is empty again next week,
 * and refusing to write to somebody for ever because their inbox was full one
 * Tuesday is a worse error than one message that bounces twice.
 */
export function usableEmail(
  email: string | null | undefined,
  bounce: { bouncedAt: Date | null; kind: string | null } | null,
): string {
  const address = (email ?? '').trim();
  if (!address) return '';
  if (bounce?.bouncedAt && bounce.kind !== 'SOFT') return '';
  return address;
}

/**
 * Whether a patient one of the courtesy lists has surfaced is worth queueing.
 *
 * Thinner than `shouldQueueReminder` because the list has already done the
 * deciding — `selectRecalls` has excluded anybody booked, snoozed, recently
 * chased or opted out of recalls entirely, and `selectFollowUps`, the stalled
 * plans and the cases back from the laboratory each have rules of their own.
 * What is left for this to check is what none of those lists does: consent,
 * whether there is any way to reach them at all, and how much they have already
 * heard from us this week.
 *
 * One function for four kinds, deliberately. The alternative is four nearly
 * identical rules that drift, and the first thing to drift would be the opt-out
 * — which is the one this file exists to get right.
 *
 * Consent is not part of the recall list's own rules on purpose — that list is
 * worked by a person who can see the refusal on the row and ring them about
 * something else. A queue is worked down without reading, so it must not contain
 * anybody who said no.
 */
export function shouldQueueCourtesy(candidate: {
  contactConsent: boolean | null;
  phone: string;
  /** Already reduced by `usableEmail` — a bounced address arrives here as ''. */
  email: string;
  /**
   * How many times the practice has put something in front of this patient
   * inside `COURTESY_WINDOW_DAYS`. Counted by the caller, which is the only
   * side with a database.
   */
  recentContacts?: number;
}): QueueDecision {
  // Explicit `false` only. `null` is "nobody has asked", the honest state of
  // every record predating the question, and it is not a refusal.
  if (candidate.contactConsent === false) return { queue: false, reason: 'opted-out' };

  if (!candidate.phone.trim() && !candidate.email.trim()) {
    return { queue: false, reason: 'no-contact-details' };
  }

  // Last, and after the refusals, because it is the only reason here that is
  // about *timing* rather than about the patient — a row skipped for this today
  // is one the same job will queue quite happily next week, and the note says so.
  if ((candidate.recentContacts ?? 0) >= MAX_COURTESY_CONTACTS) {
    return { queue: false, reason: 'recently-contacted' };
  }

  return { queue: true };
}

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
  'recently-contacted': 'they have heard from us twice this week already',
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
  | 'set-aside'
  /**
   * A recall whose reason has gone away — they booked, or somebody rang them.
   *
   * Its own reason rather than one of the five above, because none of them is
   * about an appointment: a recall is about an *absence*, and the absence ends
   * quietly. See `withdrawSettledRecalls`.
   */
  | 'no-longer-due'
  /**
   * The patient said no while the row was waiting.
   *
   * Written by the delivery webhook, which is the only thing in the app that
   * learns of a refusal without anybody typing it: an unsubscribe link followed,
   * or a spam complaint filed. Its own reason rather than `set-aside`, because
   * no member of staff set it aside and the trail should not imply one did.
   */
  | 'opted-out'
  /**
   * The few days in which it would have been worth sending have gone by.
   *
   * `passed` is the same idea for an appointment and cannot be reused: that one
   * reads "the appointment had already begun", and a post-operative check has no
   * appointment to have begun. What has expired is a window — asking somebody
   * how they are getting on a fortnight after a filling is not a courtesy, it is
   * a form letter.
   */
  | 'window-closed'
  /**
   * They have an appointment now, so somebody will tell them in person.
   *
   * Only ever a WORK_READY row. "Your crown is back" is worth sending to
   * somebody with nothing booked and is noise to somebody who is coming in on
   * Thursday to have it fitted — and this is the reason a person reading the
   * handled list wants, rather than the recall's "no longer overdue", which is
   * about an absence and says nothing true about a case at the laboratory.
   */
  | 'booked-in';

export const CANCEL_NOTES: Record<CancelReason, string> = {
  rescheduled: 'the appointment moved',
  'status-changed': 'the appointment is no longer scheduled',
  answered: 'the patient answered before it was sent',
  deleted: 'the appointment was deleted',
  passed: 'the appointment had already begun',
  'set-aside': 'set aside by hand',
  'no-longer-due': 'the patient is no longer overdue',
  'opted-out': 'the patient opted out of being messaged',
  'window-closed': 'too late for it to be worth sending',
  'booked-in': 'the patient has an appointment booked',
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
  [SKIP_NOTES['recently-contacted']]: 'skipRecentlyContacted',
  [SKIP_NOTES['already-contacted']]: 'skipContacted',
  [SKIP_NOTES['opted-out']]: 'skipOptedOut',
  [SKIP_NOTES['no-contact-details']]: 'skipNoDetails',
  [CANCEL_NOTES.rescheduled]: 'cancelRescheduled',
  [CANCEL_NOTES['status-changed']]: 'cancelStatus',
  [CANCEL_NOTES.answered]: 'cancelAnswered',
  [CANCEL_NOTES.deleted]: 'cancelDeleted',
  [CANCEL_NOTES.passed]: 'cancelPassed',
  [CANCEL_NOTES['set-aside']]: 'cancelSetAside',
  [CANCEL_NOTES['no-longer-due']]: 'cancelNoLongerDue',
  [CANCEL_NOTES['opted-out']]: 'cancelOptedOut',
  [CANCEL_NOTES['window-closed']]: 'cancelWindowClosed',
  [CANCEL_NOTES['booked-in']]: 'cancelBookedIn',
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

/**
 * How long a refused send waits before the queue offers it again.
 *
 * The column that makes this possible has been on the table since the outbox
 * was built, holding the same value as `createdAt` on every row, waiting for
 * "the day anything sends by itself". That day has not come and this is not it:
 * a person still presses the button. What changed is that the button can now
 * *fail*, and a queue that re-offers a failing row to the next person who opens
 * it — and the next — turns one broken configuration into a morning of
 * identical disappointments.
 *
 * Four intervals because the four failures are four different waits, in the
 * same way `MailFailure` splits them by who fixes them:
 *
 *  - `unreachable` is nobody's fault and usually over in seconds; five minutes
 *    is long enough that the second press is a different attempt rather than
 *    the same one.
 *  - `limit` is a daily allowance, so the honest answer is "tomorrow" — four
 *    hours is the compromise that still lets an evening run go out.
 *  - `auth` and `rejected` need somebody to change a setting. Half an hour is
 *    not a retry, it is the row getting out of the way of the work that can be
 *    done, and it comes back by itself in case the setting was fixed.
 *
 * Pure, and returning a `Date` rather than mutating anything, so
 * `tests/outbox.test.ts` can state the whole table in four lines.
 */
export const RETRY_MINUTES: Record<MailFailure, number> = {
  unreachable: 5,
  limit: 240,
  auth: 30,
  rejected: 30,
};

export function retryAfter(failure: MailFailure, now: Date): Date {
  return new Date(now.getTime() + RETRY_MINUTES[failure] * 60_000);
}

/**
 * Whether a row is being held back from a failed attempt rather than waiting to
 * be worked.
 *
 * The distinction the queue screen draws its fourth section on. Both are
 * PENDING and both are honest; only one of them is anybody's job this minute.
 */
export function isHeld(row: { sendAfter: Date; attempts: number }, now: Date): boolean {
  return row.attempts > 0 && row.sendAfter > now;
}
