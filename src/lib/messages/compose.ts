import { confirmationToken, confirmationUrl } from '@/lib/confirmations';
import {
  composeFollowUp,
  composePlanNudge,
  composeRecall,
  composeReminder,
  composeWorkReady,
  type ReminderMessage,
} from '@/lib/reminder-messages';

import type { QueuedMessage } from './board';

/**
 * Whole months since a date, or 0 when there is none.
 *
 * Recomputed here rather than carried on the row, for the reason
 * `ScheduledMessage` stores no body: a queue written on Monday and worked on
 * Friday must quote the gap as it is when somebody reads it. Zero for a patient
 * who has never been in, whose message quotes "never" instead of a number.
 */
function monthsSince(lastVisit: string | null): number {
  if (!lastVisit) return 0;
  const from = new Date(`${lastVisit}T00:00:00.000Z`);
  const now = new Date();
  const months =
    (now.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - from.getUTCMonth());
  return Math.max(0, now.getUTCDate() < from.getUTCDate() ? months - 1 : months);
}

/** Whole days since a date, floored at nought. Same reasoning as `monthsSince`. */
function daysSince(lastVisit: string | null): number {
  if (!lastVisit) return 0;
  const from = new Date(`${lastVisit}T00:00:00.000Z`).getTime();
  return Math.max(0, Math.floor((Date.now() - from) / 86_400_000));
}

/**
 * The wording for one queued row, built the same way twice.
 *
 * Twice on purpose: the queue screen composes it to show the buttons, and the
 * send action composes it again to decide what actually goes out. Those two must
 * agree, and the way to guarantee they agree is for there to be one function
 * rather than two call sites that look alike today.
 *
 * The action deliberately does *not* take the wording from the form it was
 * submitted from. A hidden field carrying the message body would be a field the
 * browser can edit, and while a member of staff could type anything into their
 * own mail client anyway, the recipient must never come from a request — that
 * would turn a queue button into a way of sending anything to anyone over the
 * practice's own domain. Both are read from the row instead.
 *
 * **Branching on the kind, never on what happens to be attached.** A reminder
 * whose slot was deleted out from under it must return null rather than quietly
 * becoming a recall, and a WORK_READY row whose case has been deleted must not
 * quietly become an announcement about nothing.
 */
export async function composeForQueued(
  message: QueuedMessage,
  fallbackLocale: string,
): Promise<ReminderMessage | null> {
  const { patient, appointment } = message;

  const recipient = {
    patientId: patient.id,
    patientName: patient.firstName,
    phone: patient.phone,
    email: patient.email,
    patientLocale: patient.locale,
  };

  if (message.kind === 'RECALL_DUE') {
    return composeRecall({
      ...recipient,
      monthsSince: monthsSince(message.lastVisit),
      lastVisit: message.lastVisit,
    });
  }

  if (message.kind === 'POST_OP_CHECK') {
    // Both facts are read at draw time and neither is on the row: a patient
    // seen again on Wednesday must not be asked on Thursday how they are
    // getting on after Monday.
    if (!message.lastVisit) return null;
    return composeFollowUp({
      ...recipient,
      daysSince: daysSince(message.lastVisit),
      services: message.lastVisitServices,
    });
  }

  if (message.kind === 'WORK_READY') {
    if (!message.work) return null;
    return composeWorkReady({ ...recipient, work: message.work.label });
  }

  if (message.kind === 'PLAN_NEXT_STEP') {
    // Null when the plan was finished or cancelled between the queueing and the
    // reading, which is the ordinary way this row stops being true — and the
    // reason the plan is read live rather than snapshotted onto the row.
    if (!message.plan) return null;
    return composePlanNudge({
      ...recipient,
      plan: message.plan.title,
      step: message.plan.nextStep,
    });
  }

  if (!appointment) return null;

  return composeReminder({
    ...recipient,
    date: appointment.date,
    startTime: appointment.startTime,
    // Their language, not the reader's: the page the link opens should be in
    // the same tongue as the message that carried it.
    confirmLink: confirmationUrl(
      patient.locale || fallbackLocale,
      await confirmationToken(appointment.id),
    ),
  });
}
