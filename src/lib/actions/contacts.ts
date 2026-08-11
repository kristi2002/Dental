'use server';

import { revalidatePath } from 'next/cache';
import { ContactChannel, ContactPurpose } from '@/generated/prisma/enums';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';

function toChannel(value: string): ContactChannel {
  return value in ContactChannel ? (value as ContactChannel) : ContactChannel.PHONE;
}

function toPurpose(value: string): ContactPurpose {
  return value in ContactPurpose ? (value as ContactPurpose) : ContactPurpose.OTHER;
}

/**
 * Record that somebody was contacted.
 *
 * Called the moment the WhatsApp or mail link is opened, which is as close to
 * "a message was sent" as an app that deliberately does not send anything can
 * get. It is therefore a record of *what the clinic put in front of the
 * patient*, not proof of delivery — and the wording says so.
 *
 * Never allowed to block the message: a failure here must not stop a reminder
 * going out, so the caller does not wait on the result.
 */
export async function logContact(input: {
  patientId: string;
  appointmentId?: string | null;
  channel: string;
  purpose: string;
  body: string;
}): Promise<void> {
  const user = await authorize('appointment.view');
  if (!user) return;

  try {
    await prisma.contact.create({
      data: {
        patientId: input.patientId,
        appointmentId: input.appointmentId || null,
        channel: toChannel(input.channel),
        purpose: toPurpose(input.purpose),
        // Long enough to know what was said, short enough not to turn the table
        // into a message archive.
        body: input.body.slice(0, 2000),
        actorId: user.id,
      },
    });
  } catch (error) {
    console.error('[contacts] failed to record', error);
    return;
  }

  await recordAudit(user, {
    action: 'create',
    entity: 'contact',
    entityId: input.patientId,
    summary: `${input.channel} · ${input.purpose}`,
  });

  revalidatePath('/', 'layout');
}
