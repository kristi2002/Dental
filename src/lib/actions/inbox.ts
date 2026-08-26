'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { ContactChannel, ContactPurpose, EmailDirection } from '@/generated/prisma/enums';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { recordOutbound } from '@/lib/messages/correspondence';
import { mailerConfig, sendMail } from '@/lib/messages/mailer';
import { MAX_MESSAGE_LENGTH } from '@/lib/messages/templates';
import { prisma } from '@/lib/prisma';
import { requiredString } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

/**
 * The verbs of the inbox.
 *
 * Every one of them reads the address it is going to act on out of the database
 * rather than out of the request. That is the same rule the send queue states at
 * length and it matters more here, not less: the inbox is reachable by anybody
 * with `message.view`, and a reply form that carried its own recipient would let
 * one of them send mail from the practice's verified domain to anywhere at all.
 * A thread id is the only thing that crosses the wire.
 */

function revalidateAll() {
  // The unread count sits in the sidebar, so a thread going read changes a
  // number on every page. Cheaper to rebuild the layout than to enumerate them.
  revalidatePath('/', 'layout');
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Mark everything inbound in one thread as read.
 *
 * Called when the thread is opened, from a client component, because a server
 * component may not write during a render — and this genuinely is a side effect
 * of looking. Fire-and-forget: failing to record that somebody read a message
 * must not stop them reading it.
 */
export async function markThreadRead(threadId: string): Promise<void> {
  const user = await authorize('message.view');
  if (!user || !threadId) return;

  try {
    const { count } = await prisma.emailMessage.updateMany({
      where: { threadId, direction: EmailDirection.INBOUND, readAt: null },
      data: { readAt: new Date() },
    });
    // Nothing was unread, so nothing changed and nothing needs rebuilding —
    // which is the common case, since re-reading a thread is ordinary.
    if (count === 0) return;
  } catch (error) {
    console.error('[inbox] could not mark read', threadId, error);
    return;
  }

  revalidateAll();
}

/**
 * Answer a thread.
 *
 * The recipient is `EmailThread.correspondent` and cannot be anything else.
 * The subject gets one `Re:` and not a stack of them — a thread here is a
 * conversation with a person rather than an RFC chain, so the prefix is
 * cosmetic and stacking it would only make the patient's inbox uglier.
 */
export async function replyToThread(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('inbox');

  const user = await authorize('message.send');
  if (!user) return actionError(t('notAllowed'));

  const threadId = requiredString(formData.get('threadId'));
  const body = requiredString(formData.get('body')).trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!threadId || !body) return actionError(t('emptyReply'));

  const thread = await prisma.emailThread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      subject: true,
      correspondent: true,
      patientId: true,
      patient: { select: { contactConsent: true } },
    },
  });
  if (!thread) return actionError(t('threadGone'));

  // A thread belonging to a patient who has since asked not to be contacted.
  // The same refusal the reminder links and the queue make — the setting is
  // worth nothing if the one screen built for writing to people ignores it.
  if (thread.patient?.contactConsent === false) return actionError(t('optedOutError'));

  const config = mailerConfig();
  if (!config) return actionError(t('mailNotConfigured'));

  const subject = thread.subject.toLowerCase().startsWith('re:')
    ? thread.subject
    : `Re: ${thread.subject}`;

  const result = await sendMail({
    to: thread.correspondent,
    toName: '',
    subject,
    text: body,
  });

  if (!result.ok) return actionError(t(`send.mail${capitalise(result.failure)}`));

  await recordOutbound({
    patientId: thread.patientId,
    toAddress: thread.correspondent,
    fromAddress: config.fromAddress,
    subject,
    text: body,
    messageId: result.messageId,
    actorId: user.id,
  });

  // Only when there is a patient to file it against. A reply to a supplier or a
  // stranger is correspondence and not a clinical contact, and writing a
  // patient-less `Contact` row is not possible anyway.
  if (thread.patientId) {
    try {
      await prisma.contact.create({
        data: {
          patientId: thread.patientId,
          channel: ContactChannel.EMAIL,
          purpose: ContactPurpose.OTHER,
          body: body.slice(0, 2000),
          actorId: user.id,
        },
      });
    } catch (error) {
      console.error('[inbox] replied but could not log the contact', threadId, error);
    }
  }

  await recordAudit(user, {
    action: 'create',
    entity: 'message',
    entityId: thread.patientId ?? thread.id,
    summary: `replied · ${thread.correspondent}`,
  });

  revalidateAll();
  return actionOk();
}

/**
 * File a thread away, or pull it back out.
 *
 * Never a delete. What arrives is the only copy — see the note on `EmailThread`
 * — and "I do not want to look at this" is a different statement from "this
 * should stop existing". The bin is deliberately not built.
 */
export async function setThreadArchived(formData: FormData): Promise<void> {
  const user = await authorize('message.view');
  if (!user) return;

  const threadId = requiredString(formData.get('threadId'));
  const archived = requiredString(formData.get('archived')) === '1';
  if (!threadId) return;

  const thread = await prisma.emailThread.update({
    where: { id: threadId },
    data: { archivedAt: archived ? new Date() : null },
    select: { correspondent: true },
  }).catch((error) => {
    console.error('[inbox] could not file', threadId, error);
    return null;
  });
  if (!thread) return;

  await recordAudit(user, {
    action: 'update',
    entity: 'message',
    entityId: threadId,
    summary: `${archived ? 'filed' : 'unfiled'} · ${thread.correspondent}`,
  });
  revalidateAll();
}

/**
 * Say which patient a thread is about.
 *
 * For the stranger who writes from an address nobody had on file, which is most
 * first contacts. Attaching it here is what puts the conversation on that
 * patient's record — and it does *not* write the address onto the patient, which
 * would be this screen quietly editing a record it is not the editor for.
 */
export async function linkThreadToPatient(formData: FormData): Promise<void> {
  const user = await authorize('message.send');
  if (!user) return;

  const threadId = requiredString(formData.get('threadId'));
  const patientId = requiredString(formData.get('patientId'));
  if (!threadId) return;

  const thread = await prisma.emailThread.update({
    where: { id: threadId },
    // An empty patient id is how the screen detaches one that was attached
    // wrongly, which is a mistake somebody will make on the first day.
    data: { patientId: patientId || null },
    select: { correspondent: true },
  }).catch((error) => {
    console.error('[inbox] could not link', threadId, error);
    return null;
  });
  if (!thread) return;

  await recordAudit(user, {
    action: 'update',
    entity: 'message',
    entityId: patientId || threadId,
    summary: patientId ? `linked · ${thread.correspondent}` : `unlinked · ${thread.correspondent}`,
  });
  revalidateAll();
}
