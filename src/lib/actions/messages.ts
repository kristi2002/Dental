'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { ContactChannel, ContactPurpose, MessageStatus } from '@/generated/prisma/enums';
import { authorize, recordAudit } from '@/lib/auth/guard';
import { getQueuedMessage } from '@/lib/messages/board';
import { composeForQueued } from '@/lib/messages/compose';
import { recordOutbound } from '@/lib/messages/correspondence';
import { MAIL_FAILURE_NOTES, MAIL_SENT_NOTE } from '@/lib/messages/email';
import { mailerConfig, sendMail } from '@/lib/messages/mailer';
import { CANCEL_NOTES, retryAfter, SENT_NOTES, usableEmail } from '@/lib/messages/outbox';
import { MAX_MESSAGE_LENGTH } from '@/lib/messages/templates';
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
export async function markQueuedMessageCalled(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return resolveAsSent(
    requiredString(formData.get('id')),
    'PHONE',
    requiredString(formData.get('body')),
  );
}

async function resolveAsSent(
  id: string,
  rawChannel: string,
  body: string,
): Promise<ActionState> {
  const te = await getTranslations('errors');

  const user = await authorize('recall.send');
  if (!user) return actionError(te('forbidden'));

  const channel = toChannel(rawChannel);
  if (!id || !channel) return actionError(te('generic'));

  let patientId = '';

  try {
    const message = await prisma.scheduledMessage.findUnique({
      where: { id },
      select: { id: true, status: true, patientId: true, appointmentId: true },
    });
    // Already resolved by somebody else. The outbox's own doc says two people
    // work this queue and ask each other "did somebody already ring them?" —
    // this is the app answering that question instead of shrugging.
    if (!message) return actionError(te('gone'));
    if (message.status !== MessageStatus.PENDING) return actionError(te('alreadyHandled'));
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
          // The queue row this answers. The two have always been written in
          // this one transaction and could not name each other, so "did that
          // reminder go out, and what did it say" meant lining two tables up by
          // patient and timestamp — the same guess-by-calendar-day that
          // `VisitRecord.appointmentId` exists to stop.
          scheduledMessageId: message.id,
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
    return actionError(te('generic'));
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
  return actionOk();
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
  // `board.ts` has already put the address through `usableEmail`, so an address
  // the provider has told us is dead arrives here empty and this is the sentence
  // the front desk gets. Saying "there is no email address" about an address
  // they can see on the record would be the wrong sentence; `emailBounced` is
  // what the row prints beside the button.
  if (!message.patient.email) {
    return actionError(message.patient.emailBounced ? t('bouncedError') : t('noEmailError'));
  }

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
    // The long form, which is the one written to be read as a letter. It used
    // to send `body` — the WhatsApp wording — so the same button produced a
    // different message depending on whether a mailer was configured, the
    // `mailto:` draft being built from the email text all along.
    text: reminder.emailBody,
  });

  if (!result.ok) {
    // Recorded on the row so the next person to open the queue sees why it is
    // still sitting there, and not only the person who pressed the button —
    // and counted, so "tried and refused twice" stops looking like "nobody has
    // got to this". `sendAfter` steps forward, which moves the row into the
    // held section until the wait is up. See `retryAfter`.
    const now = new Date();
    await prisma.scheduledMessage.updateMany({
      where: { id, status: MessageStatus.PENDING },
      data: {
        note: MAIL_FAILURE_NOTES[result.failure],
        attempts: { increment: 1 },
        lastAttemptAt: now,
        sendAfter: retryAfter(result.failure, now),
      },
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
          // As above: the queue row this is the record of.
          scheduledMessageId: id,
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

  // Filed as correspondence as well as logged as a contact. The two are not the
  // same record and neither replaces the other: `Contact` is the practice's
  // clinical log of having chased somebody, and the thread is the conversation
  // the patient can now reply into. Deliberately last and deliberately
  // unawaited-on-failure — see `recordOutbound`, which never throws at a caller
  // whose message has already left.
  await recordOutbound({
    patientId: message.patient.id,
    toAddress: message.patient.email,
    fromAddress: mailerConfig()?.fromAddress ?? '',
    subject: reminder.subject,
    text: reminder.body,
    messageId: result.messageId,
    actorId: user.id,
  });

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
 * Write to one patient, about whatever the practice needs to say.
 *
 * The composer's send, and the first thing in this app that transmits wording
 * somebody typed rather than wording it composed. That is a smaller step than it
 * sounds and the reason is the one `composeForQueued` already gives: what has to
 * be untouchable is the **recipient**, not the text. A member of staff with a
 * mail client could type anything to a patient today; what they could not do is
 * make the practice's verified sending domain deliver it to an address of their
 * choosing. So the body comes from the form and the address is read from the
 * row, and only the patient's id crosses the wire.
 *
 * Everything else is the same gate as the queue: a person read it, a person
 * pressed send, consent is honoured, and it is logged twice — once as a contact
 * and once as correspondence.
 */
export async function sendPatientMessage(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('messageTemplates');

  const user = await authorize('message.send');
  if (!user) return actionError(t('notAllowed'));

  const patientId = requiredString(formData.get('patientId'));
  const subject = requiredString(formData.get('subject')).trim().slice(0, 300);
  const body = requiredString(formData.get('body')).trim().slice(0, MAX_MESSAGE_LENGTH);

  if (!patientId || !body) return actionError(t('emptyMessage'));

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      emailBouncedAt: true,
      emailBounceKind: true,
      contactConsent: true,
    },
  });

  if (!patient) return actionError(t('patientGone'));
  if (patient.contactConsent === false) return actionError(t('optedOutError'));

  // The same rule the queue applies, applied to the one place staff can type
  // their own wording: an address the provider has told us is dead is not an
  // address, and a composer that cheerfully accepted it would be the hole in a
  // feedback loop the rest of the app now respects.
  const address = usableEmail(patient.email, {
    bouncedAt: patient.emailBouncedAt,
    kind: patient.emailBounceKind,
  });
  if (!address) {
    return actionError(patient.emailBouncedAt ? t('bouncedError') : t('noEmailError'));
  }

  const config = mailerConfig();
  if (!config) return actionError(t('mailNotConfigured'));

  const result = await sendMail({
    to: address,
    toName: `${patient.firstName} ${patient.lastName}`.trim(),
    // A blank subject line is a message that reads as spam to every filter it
    // meets, so the practice's name is the floor rather than an empty header.
    subject: subject || t('defaultSubject'),
    text: body,
  });

  if (!result.ok) return actionError(t(`send.mail${capitalise(result.failure)}`));

  try {
    await prisma.contact.create({
      data: {
        patientId: patient.id,
        channel: ContactChannel.EMAIL,
        purpose: toPurpose(formData.get('purpose')),
        body: body.slice(0, 2000),
        actorId: user.id,
      },
    });
  } catch (error) {
    // Same reasoning as the queue's: the message is with the patient already.
    // Saying it failed would be a lie somebody acts on by sending it again.
    console.error('[messages] sent but could not log the contact', patient.id, error);
  }

  await recordOutbound({
    patientId: patient.id,
    toAddress: address,
    fromAddress: config.fromAddress,
    subject: subject || t('defaultSubject'),
    text: body,
    messageId: result.messageId,
    actorId: user.id,
  });

  await recordAudit(user, {
    action: 'create',
    entity: 'message',
    entityId: patient.id,
    summary: 'wrote · EMAIL',
  });

  revalidateAll();
  return actionOk();
}

/** The composer offers five; anything else is somebody's hand-written form. */
function toPurpose(value: FormDataEntryValue | null): ContactPurpose {
  const name = typeof value === 'string' ? value : '';
  return name in ContactPurpose ? (name as ContactPurpose) : ContactPurpose.OTHER;
}

/**
 * Send one message to an address the environment names, to find out whether any
 * of this works.
 *
 * **The recipient never comes from the request.** That is the entire security
 * design of this action, and it survives `MAIL_TEST_TO` intact: a settings page
 * with a "send a test to…" box would be a way of mailing anyone at all from the
 * clinic's verified domain, whereas an environment variable can only be changed
 * by somebody who already has the server. `MailerConfig.testTo` resolves the
 * ladder — `MAIL_TEST_TO`, else Reply-To, else the sending address — so the
 * press has exactly one destination and this function does not get to pick it.
 *
 * (An earlier version of this note claimed the recipient was
 * `ClinicProfile.email`. It was never read here; the argument was right and the
 * column was wrong.)
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
    to: config.testTo,
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
    summary: `test email to ${config.testTo}`,
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
export async function setQueuedMessageAside(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const te = await getTranslations('errors');

  const user = await authorize('recall.send');
  if (!user) return actionError(te('forbidden'));

  const id = requiredString(formData.get('id'));
  if (!id) return actionError(te('generic'));

  const message = await prisma.scheduledMessage.findUnique({
    where: { id },
    select: { patientId: true },
  });
  if (!message) return actionError(te('gone'));

  const { count } = await prisma.scheduledMessage.updateMany({
    where: { id, status: MessageStatus.PENDING },
    data: {
      status: MessageStatus.CANCELLED,
      note: CANCEL_NOTES['set-aside'],
      resolvedAt: new Date(),
      resolvedById: user.id,
    },
  });
  // Guarded on PENDING in the write, so nought means somebody else resolved it
  // between the read above and this. That is the whole reason this action
  // reports: on the old signature it was indistinguishable from a press that
  // worked.
  if (count === 0) return actionError(te('alreadyHandled'));

  await recordAudit(user, {
    action: 'update',
    entity: 'message',
    entityId: message.patientId,
    summary: 'set aside',
  });
  revalidateAll();
  return actionOk();
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
export async function reopenQueuedMessage(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const te = await getTranslations('errors');

  const user = await authorize('recall.send');
  if (!user) return actionError(te('forbidden'));

  const id = requiredString(formData.get('id'));
  if (!id) return actionError(te('generic'));

  const message = await prisma.scheduledMessage.findUnique({
    where: { id },
    select: { patientId: true },
  });
  if (!message) return actionError(te('gone'));

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
  // Nought means the row was not a person's to reopen — the clock withdrew it,
  // and putting it back would re-arm a message about an appointment that has
  // moved or already begun. The button is offered on rows where that is not
  // obvious from the outside, so it has to say which happened.
  if (count === 0) return actionError(te('notReopenable'));

  await recordAudit(user, {
    action: 'update',
    entity: 'message',
    entityId: message.patientId,
    summary: 'put back',
  });
  revalidateAll();
  return actionOk();
}
