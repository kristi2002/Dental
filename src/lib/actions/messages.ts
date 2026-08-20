'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { ContactChannel, ContactPurpose, MessageStatus } from '@/generated/prisma/enums';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { getQueuedMessage } from '@/lib/messages/board';
import { composeForQueued } from '@/lib/messages/compose';
import { MAIL_FAILURE_NOTES, MAIL_SENT_NOTE } from '@/lib/messages/email';
import { mailerConfig, sendMail } from '@/lib/messages/mailer';
import { CANCEL_NOTES, SENT_NOTES } from '@/lib/messages/outbox';
import { prisma } from '@/lib/prisma';
import { requiredString } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

/**
 * Working the send queue down.
 *
 * Every verb here does the same two things in one write: it resolves the
 * `ScheduledMessage` and it writes the `Contact` row that says what the practice
 * put in front of the patient. Doing them together is the point. The app already
 * had a way to log a contact — `logContact`, fired when a reminder link is
 * opened — and if the queue used that and then marked its own row separately,
 * there would be two records of one act that could disagree, and they would, on
 * the first request that half failed.
 *
 * "Sent" is still the honest overstatement it is everywhere else in this app:
 * pressing the button hands a draft to WhatsApp or to a mail client and nothing
 * here can see what happens next. `SENT_NOTES` says "opened", not "delivered",
 * and that wording is the record.
 */

function revalidateAll() {
  // The outbox count belongs beside the follow-ups bell eventually, and the
  // queue is reachable from more than its own screen. Cheaper to rebuild the
  // layout than to remember every place a row is visible from.
  revalidatePath('/', 'layout');
}

function toChannel(value: string): 'WHATSAPP' | 'EMAIL' | 'PHONE' | null {
  return value === 'WHATSAPP' || value === 'EMAIL' || value === 'PHONE' ? value : null;
}

/**
 * Mark one queued message as put in front of the patient.
 *
 * Called from the link itself rather than from a form, and deliberately not
 * awaited by the caller — the same arrangement `logContact` uses, and for the
 * same reason: whatever this does must never sit between somebody pressing
 * "WhatsApp" and WhatsApp opening. A message that goes out and fails to be
 * recorded is a small mess; a message that does not go out because the database
 * was slow is the front desk's morning.
 *
 * Refuses anything that is not still PENDING, so two people working the queue at
 * once cannot both claim the same row — and so a stale tab, reopened tomorrow,
 * cannot resolve a message that has since been withdrawn.
 */
export async function sendQueuedMessage(input: {
  id: string;
  channel: string;
  /** The wording as it was composed for this patient, kept for the contact log. */
  body: string;
}): Promise<void> {
  await resolveAsSent(input.id, input.channel, input.body);
}

/**
 * The same thing, for the row somebody telephoned instead.
 *
 * A separate export only because it is pressed from a form rather than from a
 * link, and a server action reached by `<form action={…}>` is handed a
 * `FormData` whether it wants one or not.
 */
export async function markQueuedMessageCalled(formData: FormData): Promise<void> {
  await resolveAsSent(
    requiredString(formData.get('id')),
    'PHONE',
    requiredString(formData.get('body')),
  );
}

async function resolveAsSent(id: string, rawChannel: string, body: string): Promise<void> {
  const user = await authorize('recall.send');
  if (!user) return;

  const channel = toChannel(rawChannel);
  if (!id || !channel) return;

  let patientId = '';

  try {
    const message = await prisma.scheduledMessage.findUnique({
      where: { id },
      select: { id: true, status: true, patientId: true, appointmentId: true },
    });
    if (!message || message.status !== MessageStatus.PENDING) return;
    patientId = message.patientId;

    await prisma.$transaction([
      prisma.contact.create({
        data: {
          patientId: message.patientId,
          appointmentId: message.appointmentId,
          channel: ContactChannel[channel],
          purpose: ContactPurpose.REMINDER,
          // Same ceiling as `logContact`: enough to know what was said, not
          // enough to turn the table into a message archive.
          body: body.slice(0, 2000),
          actorId: user.id,
        },
      }),
      // Guarded on PENDING a second time, in the write itself. The read above
      // is a courtesy that lets this return quietly; this is what actually
      // makes two simultaneous presses resolve to one.
      prisma.scheduledMessage.updateMany({
        where: { id: message.id, status: MessageStatus.PENDING },
        data: {
          status: MessageStatus.SENT,
          note: SENT_NOTES[channel],
          resolvedAt: new Date(),
          resolvedById: user.id,
        },
      }),
    ]);
  } catch (error) {
    console.error('[messages] could not record a send for', id, error);
    return;
  }

  // Filed against the *patient*, as `logContact` files its own line, and for the
  // same reason: nobody reading the trail wants a queue row's uuid — they want
  // the person it was about, which is where `auditDestination` then links.
  await recordAudit(user, {
    action: 'update',
    entity: 'message',
    entityId: patientId,
    summary: `sent · ${channel}`,
  });

  revalidateAll();
}

/**
 * Send one queued reminder by email, for real, over the provider's API.
 *
 * The first thing in this app that transmits to a patient itself, and it is
 * still a button somebody presses on a row they have read — the approval gate
 * moved from the mail client to the send queue, it did not disappear. Nothing
 * calls this on a clock and nothing may.
 *
 * Both the recipient and the wording are read from the row, never from the
 * request. That is the difference between a send button and an open relay
 * wearing the practice's domain: a form field naming the address would let
 * anybody with `recall.send` post arbitrary mail from a reputation the clinic
 * spent months building. Only the id crosses the wire.
 *
 * **A failure leaves the row PENDING.** It is not marked FAILED and it does not
 * disappear: the note records what went wrong, the row stays on the queue, and
 * whoever pressed the button is told at once so they can reach for WhatsApp
 * instead. A send queue that swallows a failure is worse than one that has none,
 * because the practice believes the patient was told.
 */
export async function emailQueuedMessage(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('outbox');

  const user = await authorize('recall.send');
  if (!user) return actionError(t('notAllowed'));

  const id = requiredString(formData.get('id'));
  const message = await getQueuedMessage(id);
  if (!message) return actionError(t('gone'));
  if (message.status !== MessageStatus.PENDING) return actionError(t('alreadyHandled'));
  if (message.patient.contactConsent === false) return actionError(t('optedOutError'));
  if (!message.patient.email) return actionError(t('noEmailError'));

  const reminder = await composeForQueued(message, await getLocale());
  if (!reminder) return actionError(t('gone'));

  // Reply-To is configuration, applied by the mailer itself — see MAIL_REPLY_TO.
  // A patient who answers "can we move it to Thursday?" must reach a person, and
  // a bounce into nowhere is how a reminder system quietly becomes a way of not
  // hearing from patients.
  const result = await sendMail({
    to: message.patient.email,
    toName: `${message.patient.firstName} ${message.patient.lastName}`.trim(),
    subject: reminder.subject,
    text: reminder.body,
  });

  if (!result.ok) {
    // Recorded on the row so the next person to open the queue sees why it is
    // still sitting there, and not only the person who pressed the button.
    await prisma.scheduledMessage.updateMany({
      where: { id, status: MessageStatus.PENDING },
      data: { note: MAIL_FAILURE_NOTES[result.failure] },
    });
    revalidateAll();
    return actionError(t(`note.mail${capitalise(result.failure)}`));
  }

  try {
    await prisma.$transaction([
      prisma.contact.create({
        data: {
          patientId: message.patient.id,
          appointmentId: message.appointment?.id ?? null,
          channel: ContactChannel.EMAIL,
          purpose: ContactPurpose.REMINDER,
          body: reminder.body.slice(0, 2000),
          actorId: user.id,
        },
      }),
      prisma.scheduledMessage.updateMany({
        where: { id, status: MessageStatus.PENDING },
        data: {
          status: MessageStatus.SENT,
          note: MAIL_SENT_NOTE,
          resolvedAt: new Date(),
          resolvedById: user.id,
        },
      }),
    ]);
  } catch (error) {
    // The message is already with the patient. Failing to write that down is
    // bad; implying it never went is worse, so this reports success and shouts
    // into the log — the row stays PENDING and somebody may send a second one,
    // which is a nuisance rather than a silence.
    console.error('[messages] sent but could not record', id, error);
  }

  await recordAudit(user, {
    action: 'update',
    entity: 'message',
    entityId: message.patient.id,
    summary: 'sent · EMAIL',
  });

  revalidateAll();
  return actionOk();
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Send one message to the practice's own address, to find out whether any of
 * this works.
 *
 * The recipient is `ClinicProfile.email` and cannot be anything else. That is
 * the entire security design of this action: a settings page with a "send a test
 * to…" box would be a way of sending mail from the clinic's verified domain to
 * an address of the sender's choosing, which is a spam relay with a nice form
 * around it. Here the only thing a press can do is put a message in the
 * practice's own inbox.
 *
 * Worth having because SPF, DKIM and DMARC are three DNS records that are wrong
 * in a way nothing reports: the provider accepts the message, the app says it
 * sent, and it lands in a spam folder nobody looks at. The only way to find out
 * is to receive one.
 */
export async function sendTestEmail(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const t = await getTranslations('settings');

  const user = await authorize('settings.edit');
  if (!user) return actionError(t('mailNotAllowed'));

  const config = mailerConfig();
  if (!config) return actionError(t('mailNotConfigured'));

  const result = await sendMail({
    to: config.replyTo ?? config.fromAddress,
    toName: config.fromName,
    subject: t('mailTestSubject'),
    text: t('mailTestBody'),
  });

  if (!result.ok) {
    const to = await getTranslations('outbox');
    return actionError(to(`note.mail${capitalise(result.failure)}`));
  }

  await recordAudit(user, {
    action: 'create',
    entity: 'settings',
    summary: `test email to ${config.replyTo ?? config.fromAddress}`,
  });

  return actionOk();
}

/**
 * Take a row off the queue without sending it.
 *
 * CANCELLED rather than SKIPPED. The two look alike on screen and mean different
 * things underneath: SKIPPED is the rules declining to queue something, written
 * by the job with a reason from `SKIP_NOTES`, and CANCELLED is the reason going
 * away — which is exactly what has happened when a person reads the row and
 * decides against it. Overloading SKIPPED would make "the job refused this"
 * unanswerable.
 */
export async function setQueuedMessageAside(formData: FormData): Promise<void> {
  const user = await authorize('recall.send');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const message = await prisma.scheduledMessage.findUnique({
    where: { id },
    select: { patientId: true },
  });
  if (!message) return;

  const { count } = await prisma.scheduledMessage.updateMany({
    where: { id, status: MessageStatus.PENDING },
    data: {
      status: MessageStatus.CANCELLED,
      note: CANCEL_NOTES['set-aside'],
      resolvedAt: new Date(),
      resolvedById: user.id,
    },
  });
  if (count === 0) return;

  await recordAudit(user, {
    action: 'update',
    entity: 'message',
    entityId: message.patientId,
    summary: 'set aside',
  });
  revalidateAll();
}

/**
 * Put a resolved row back on the queue.
 *
 * The undo for a mis-click, and the reason marking a row sent from a link press
 * is defensible at all: the cost of the button being too eager has to be one
 * press to reverse, or it is not a fair trade.
 *
 * SENT and CANCELLED-by-hand only. A row the *clock* withdrew was withdrawn
 * because the appointment moved, was cancelled, or has already begun — putting
 * that back would re-arm a message about something that is no longer true, which
 * is the precise failure `cancelScheduledFor` exists to prevent. Distinguished
 * by the note, which is the only thing on the row that records who resolved it
 * and why; `resolvedById` is null for everything the job did.
 */
export async function reopenQueuedMessage(formData: FormData): Promise<void> {
  const user = await authorize('recall.send');
  if (!user) return;

  const id = requiredString(formData.get('id'));
  if (!id) return;

  const message = await prisma.scheduledMessage.findUnique({
    where: { id },
    select: { patientId: true },
  });
  if (!message) return;

  const { count } = await prisma.scheduledMessage.updateMany({
    where: {
      id,
      status: { in: [MessageStatus.SENT, MessageStatus.CANCELLED] },
      // What a person did, never what the clock did.
      resolvedById: { not: null },
    },
    data: {
      status: MessageStatus.PENDING,
      note: null,
      resolvedAt: null,
      resolvedById: null,
    },
  });
  if (count === 0) return;

  await recordAudit(user, {
    action: 'update',
    entity: 'message',
    entityId: message.patientId,
    summary: 'put back',
  });
  revalidateAll();
}
