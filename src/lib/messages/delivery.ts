import { MessageStatus } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';
import { bounceKindFor, closesConsent, type DeliveryEvent } from './events';
import { CANCEL_NOTES } from './outbox';

/**
 * Writing down what the provider told us about a message it had already
 * accepted.
 *
 * The database half of `events.ts`, kept apart from it for the reason every
 * pair in this folder is kept apart: the decisions are worth testing against
 * hostile input, and a webhook payload is the most hostile input this app
 * receives. Everything here is a write; nothing here decides anything.
 *
 * **By address, not by message.** A bounce names a mailbox, and the practice's
 * question is "can we write to this person at all", not "did that particular
 * reminder arrive". Matching on the address also means the answer covers the
 * two patients who share one — a parent's mailbox on two children's records is
 * the ordinary case in a family practice, and a bounce is true for both.
 *
 * **It never throws at the caller.** The route answers 200 once the secret is
 * right, exactly as the inbound webhook does, because a provider that gets a
 * 500 retries for ever.
 */

export type DeliveryOutcomeReport = {
  /** How many patient records the address was found on. */
  patients: number;
  /** Whether this event closed consent as well as retiring the address. */
  consentClosed: boolean;
  /** Queued messages withdrawn because the patient has just said no. */
  withdrawn: number;
};

export async function recordDeliveryEvent(
  event: DeliveryEvent,
): Promise<DeliveryOutcomeReport> {
  const empty: DeliveryOutcomeReport = { patients: 0, consentClosed: false, withdrawn: 0 };

  // A delivery is the ordinary case and there is nothing to write down about
  // it. Recording every one would turn the busiest event a provider sends into
  // the busiest write this app makes, for a fact no screen asks about.
  const kind = bounceKindFor(event.outcome);
  const consent = closesConsent(event.outcome);
  if (!kind && !consent) return empty;

  const patients = await prisma.patient.findMany({
    where: { email: { equals: event.address, mode: 'insensitive' } },
    select: { id: true },
  });
  if (patients.length === 0) return empty;

  const ids = patients.map((patient) => patient.id);
  const now = new Date();

  await prisma.patient.updateMany({
    where: { id: { in: ids } },
    data: {
      ...(kind ? { emailBouncedAt: now, emailBounceKind: kind } : {}),
      // Only ever written to `false`, and only by the two events that mean it.
      // A bounce must never be able to *grant* consent — `null` stays `null`,
      // which is the honest "nobody asked" this app has protected everywhere
      // else.
      ...(consent ? { contactConsent: false } : {}),
    },
  });

  let withdrawn = 0;
  if (consent) {
    // A patient who has just pressed "this is junk" must not still be sitting
    // in a queue somebody works down by pressing buttons. The screen would
    // refuse the send — `QueueSendLinks` checks consent on every row — but a
    // row that cannot be actioned is a row that teaches people to skim past
    // rows, and the reason it went away is worth recording on it.
    const { count } = await prisma.scheduledMessage.updateMany({
      where: { patientId: { in: ids }, status: MessageStatus.PENDING },
      data: {
        status: MessageStatus.CANCELLED,
        note: CANCEL_NOTES['opted-out'],
        resolvedAt: now,
      },
    });
    withdrawn = count;
  }

  return { patients: ids.length, consentClosed: consent, withdrawn };
}
