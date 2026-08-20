import { confirmationToken, confirmationUrl } from '@/lib/confirmations';
import { composeReminder, type ReminderMessage } from '@/lib/reminder-messages';
import type { QueuedMessage } from './board';

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
