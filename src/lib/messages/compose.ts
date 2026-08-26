import { confirmationToken, confirmationUrl } from '@/lib/confirmations';
import { composeRecall, composeReminder, type ReminderMessage } from '@/lib/reminder-messages';

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
 */
export async function composeForQueued(
  message: QueuedMessage,
  fallbackLocale: string,
): Promise<ReminderMessage | null> {
  const { patient, appointment } = message;

  // A recall is about an absence rather than a slot, so it has no appointment
  // and its own wording. Branching on the kind rather than on whether an
  // appointment happens to be attached: a reminder whose slot was deleted out
  // from under it must still return null rather than quietly becoming a recall.
  if (message.kind === 'RECALL_DUE') {
    return composeRecall({
      patientName: patient.firstName,
      phone: patient.phone,
      email: patient.email,
      monthsSince: monthsSince(message.lastVisit),
      lastVisit: message.lastVisit,
      patientLocale: patient.locale,
    });
  }

  if (!appointment) return null;

  return composeReminder({
    patientName: patient.firstName,
    phone: patient.phone,
    email: patient.email,
    date: appointment.date,
    startTime: appointment.startTime,
    patientLocale: patient.locale,
    // Their language, not the reader's: the page the link opens should be in
    // the same tongue as the message that carried it.
    confirmLink: confirmationUrl(
      patient.locale || fallbackLocale,
      await confirmationToken(appointment.id),
    ),
  });
}
