'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { MessageStatus } from '@/generated/prisma/enums';
import { recordPatientAudit } from '@/lib/auth/guard';
import { CANCEL_NOTES } from '@/lib/messages/outbox';
import { verifyOptOutToken } from '@/lib/opt-out';
import { prisma } from '@/lib/prisma';
import { CONFIRM_RATE, confirmBucket, rateLimit } from '@/lib/rate-limit';
import { requiredString } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

/**
 * The second action in the app that runs without a session, and the first one
 * that lets a patient change something about themselves.
 *
 * Its authority is the HMAC in the link and it does exactly one thing: write
 * `false` into `contactConsent` for the patient the token names. It reads no
 * medical record, it says nothing back beyond "that is done", and there is no
 * form field it takes any notice of other than the token.
 *
 * **Both directions, deliberately.** The page offers "actually, keep writing to
 * me" as well, because the commonest way to arrive here is a mis-tap on a
 * phone, and a one-way door would mean the practice loses a patient's consent
 * to a fat thumb and can only restore it by asking them to ring up — which is
 * exactly the indignity this link exists to remove. Opting back in writes
 * `true` rather than `null`: they have now been asked, and they have answered.
 *
 * **It throttles on the confirmation bucket.** Same reasoning, same budget: the
 * signature is the wall, and the limiter is what stops somebody standing in
 * front of it trying handles all afternoon. Sharing one bucket means the two
 * doors cannot be used to spend around each other.
 */
export async function setContactConsent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('unsubscribe');

  const limit = rateLimit(confirmBucket(await headers()), CONFIRM_RATE);
  if (!limit.allowed) return actionError(t('tooMany'));

  const token = requiredString(formData.get('token'));
  const consent = requiredString(formData.get('answer')) === 'in';

  const patientId = await verifyOptOutToken(token);
  if (!patientId) return actionError(t('errorInvalid'));

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!patient) return actionError(t('errorInvalid'));

  try {
    await prisma.patient.update({
      where: { id: patient.id },
      data: { contactConsent: consent },
    });
  } catch {
    return actionError(t('errorGeneric'));
  }

  if (!consent) {
    // Anything still queued for them stops here. The send buttons already
    // refuse a patient who has opted out, so this is not what makes the refusal
    // work — it is what stops the front desk being handed rows it may not act
    // on, and what puts the reason on the row rather than leaving somebody to
    // wonder why the button is missing.
    try {
      await prisma.scheduledMessage.updateMany({
        where: { patientId: patient.id, status: MessageStatus.PENDING },
        data: {
          status: MessageStatus.CANCELLED,
          note: CANCEL_NOTES['opted-out'],
          resolvedAt: new Date(),
        },
      });
    } catch (error) {
      // The consent is recorded, which is the part that matters and the part
      // the law is about. A queue row left standing is refused at the button.
      console.error('[opt-out] could not withdraw queued messages', patient.id, error);
    }
  }

  // Filed against the patient with no actor, exactly as a confirmation is:
  // nobody at the practice did this, and the trail should not suggest one did.
  await recordPatientAudit(`${patient.firstName} ${patient.lastName}`, {
    action: 'update',
    entity: 'patient',
    entityId: patient.id,
    summary: consent ? 'opted back in to messages' : 'opted out of messages',
  });

  revalidatePath('/', 'layout');
  return actionOk();
}
