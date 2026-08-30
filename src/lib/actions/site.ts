'use server';

import { headers } from 'next/headers';
import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { sendMail } from '@/lib/messages/mailer';
import { alertRecipient, requestAlertMail } from '@/lib/messages/request-alert';
import { fromDateKey, isDateKey } from '@/lib/dates';
import {
  isAllowedMimeType,
  MAX_REQUEST_FILES,
  MAX_REQUEST_UPLOAD_BYTES,
} from '@/lib/file-constants';
import { sniffMimeType } from '@/lib/file-signature';
import { deleteStoredFile, storeFile } from '@/lib/files';
import { prisma } from '@/lib/prisma';
import { clientKey, rateLimit } from '@/lib/rate-limit';
import { getBookingWindow, getSiteContact } from '@/lib/site';
import {
  isPreferredTime,
  isRequestTopic,
  MIDDAY_MINUTES,
  REQUEST_LIMITS,
} from '@/lib/site-content';
import { optionalString, requiredString } from '@/lib/utils';
import { actionError, actionOk, type ActionState } from './types';

/**
 * The day and the half-day, checked against the practice's own week.
 *
 * Both fields are optional, and "they did not say" is the commonest answer:
 * the calendar can be skipped, and a browser with no JavaScript reaches the
 * submit button without ever having paged it. So a missing value is a null and
 * never an error.
 *
 * **A value that is present is checked rather than trusted**, and not because
 * anybody expects a stranger to forge a date. The honest case is a tab left
 * open: somebody picks Friday, goes to dinner, and presses the button after
 * midnight on a page whose window no longer contains it — or after the practice
 * has entered a closure over that week. Writing the date anyway would put a day
 * the surgery is shut on the desk's list as though the visitor had asked for it,
 * and the desk would ring back to correct a mistake the page made. Saying "that
 * day has gone, pick another" is the version that keeps the form's own promise.
 *
 * The half-day is checked against the *chosen day's* real open stretches for the
 * same reason, and simply dropped rather than refused when it does not fit: a
 * morning that has stopped existing is a detail the desk can settle on the
 * telephone, where a day that has stopped existing is a wasted call. It is also
 * dropped when no day was given — "mornings, on no particular day" is not a
 * preference this practice can act on before it has spoken to somebody.
 */
async function readPreferredDay(
  formData: FormData,
): Promise<{ date: Date | null; half: string | null } | 'unavailable'> {
  const key = optionalString(formData.get('preferredDate'));
  if (!key) return { date: null, half: null };
  if (!isDateKey(key)) return 'unavailable';

  // Null when the database is unreachable. The request itself is still worth
  // taking — that is the whole point of a form whose only required fields are a
  // name and a number — so the day is dropped and the call back asks for it.
  const window = await getBookingWindow();
  if (!window) return { date: null, half: null };

  const day = window.days.find((entry) => entry.date === key);
  if (!day || !day.open) return 'unavailable';

  const wanted = optionalString(formData.get('preferredTime'));
  const half =
    wanted && isPreferredTime(wanted) &&
    day.ranges.some((range) =>
      wanted === 'morning' ? range.start < MIDDAY_MINUTES : range.end > MIDDAY_MINUTES,
    )
      ? wanted
      : null;

  return { date: fromDateKey(key), half };
}

/**
 * Put the request in front of somebody who is not looking at the screen.
 *
 * Composed here, where the request is still being served and a translator is
 * to hand, and *sent* from inside `after` — so a provider having a slow morning
 * costs the visitor nothing. They have already been told the practice will ring
 * them back by the time this runs.
 *
 * **Nothing in here may fail the request.** The row is written, the visitor has
 * their answer, and the rail's count is the signal this is merely trying to get
 * ahead of; a mail provider that refuses is a line in the log and no more. That
 * is also why the recipient being absent is not an error — a practice that has
 * not configured sending gets exactly the behaviour it had before this existed.
 *
 * The desk's own language throughout, not the visitor's. `request.locale`
 * records what *they* wrote in, which is what the desk's screen uses to answer
 * them; this is the practice talking to itself.
 */
async function alertTheDesk(request: {
  name: string;
  phone: string;
  email: string | null;
  topic: string | null;
  preferredDate: Date | null;
  preferredHalf: string | null;
  attachments: number;
}): Promise<void> {
  try {
    const locale = routing.defaultLocale;
    const [contact, ts, tr] = await Promise.all([
      getSiteContact(),
      getTranslations({ locale, namespace: 'site' }),
      getTranslations({ locale, namespace: 'requests' }),
    ]);

    const to = alertRecipient(contact.email, process.env.MAIL_REPLY_TO);
    if (!to) return;

    const half =
      request.preferredHalf === 'morning' || request.preferredHalf === 'afternoon'
        ? ts(`book.half.${request.preferredHalf}`)
        : null;
    const day = request.preferredDate
      ? new Intl.DateTimeFormat(locale, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          timeZone: 'Europe/Tirane',
        }).format(request.preferredDate)
      : null;

    const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '');

    const mail = requestAlertMail(
      to,
      contact.name,
      {
        name: request.name,
        phone: request.phone,
        email: request.email,
        topicLabel: request.topic ? ts(`topics.${request.topic}`) : null,
        preferredLabel: day ? (half ? `${day}, ${half}` : day) : null,
        attachments: request.attachments,
      },
      {
        subject: tr('alert.subject', { name: request.name }),
        intro: tr('alert.intro'),
        phone: tr('alert.phone'),
        email: tr('alert.email'),
        topic: tr('alert.topic'),
        preferred: tr('alert.preferred'),
        attachments: tr('alert.attachments'),
        openIt: tr('alert.openIt'),
      },
      base ? `${base}/${locale}/requests` : null,
    );

    after(async () => {
      const result = await sendMail(mail);
      if (!result.ok) {
        console.error('[site] could not tell the desk about a request', result.failure, result.detail);
      }
    });
  } catch (error) {
    console.error('[site] could not compose the desk alert', error);
  }
}

/** The fewest digits anything anybody could ring has. See its one caller. */
const MIN_PHONE_DIGITS = 6;

function hasEnoughDigits(phone: string): boolean {
  return phone.replace(/\D/g, '').length >= MIN_PHONE_DIGITS;
}

/** One file, checked and read into memory, ready to be written to disk. */
type ReadyFile = { fileName: string; mimeType: string; bytes: Uint8Array; size: number };

/**
 * The name to show the desk, with everything that is not a name taken out.
 *
 * `storeFile` generates the on-disk key, so this string never touches a path —
 * but it is still rendered on a staff screen and echoed in a `Content-Disposition`
 * header, and it arrives from somebody with no account. Any directory separator
 * is dropped so a filename cannot *read* as a path in a log or a header, control
 * characters go because they can break the header itself, and the length is
 * capped where `PatientDocument` caps it.
 *
 * A file left with no usable name gets one. An empty string in the list would be
 * a row the desk cannot click on with any confidence about what it is.
 */
function safeFileName(name: string, index: number): string {
  const cleaned = name
    .replace(/[\\/]/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 180);

  return cleaned.length > 0 ? cleaned : `file-${index + 1}`;
}

/**
 * The files a visitor attached, or the reason they cannot be taken.
 *
 * **This is the only place in the application where bytes arrive from somebody
 * with no account**, and it is checked accordingly. Four rules, and the order
 * matters — the cheap refusals come before anything is read into memory:
 *
 *  1. **Count.** At most `MAX_REQUEST_FILES`. A form that has been driven by
 *     something other than the page can post as many parts as it likes.
 *  2. **Size, counted as received.** The running total is compared against
 *     `MAX_REQUEST_UPLOAD_BYTES` rather than trusting the browser to have
 *     enforced its own hint. `serverActions.bodySizeLimit` is the outer wall;
 *     this is the one that can answer in the visitor's language.
 *  3. **Type, sniffed rather than declared.** `file.type` is a string the
 *     sender chose, and it is the string that would come back out of this app
 *     as a `Content-Type` header when the desk opens the file. So the first
 *     bytes decide, and what they say is what gets stored — see `sniffMimeType`.
 *     A `.pdf` that is really something else is refused rather than relabelled.
 *  4. **Allowlist.** What the signature reports still has to be one of the five
 *     types the practice accepts, so widening `ALLOWED_MIME_TYPES` stays the one
 *     place that decision is made.
 *
 * Nothing is written to disk here. A request that fails on its fourth file
 * should leave nothing behind from the first three.
 */
async function readAttachments(
  formData: FormData,
): Promise<ReadyFile[] | 'tooMany' | 'tooLarge' | 'badType'> {
  // An empty part is what a browser sends for a file input nobody touched.
  const files = formData
    .getAll('files')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length === 0) return [];
  if (files.length > MAX_REQUEST_FILES) return 'tooMany';

  // The declared sizes first, so an oversized post is refused before any of it
  // is pulled into a buffer.
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_REQUEST_UPLOAD_BYTES) {
    return 'tooLarge';
  }

  let received = 0;
  const ready: ReadyFile[] = [];

  for (const [index, file] of files.entries()) {
    const bytes = new Uint8Array(await file.arrayBuffer());

    // And then what actually arrived, which is the number that counts: `size` is
    // a property of the part, and this is the part.
    received += bytes.byteLength;
    if (received > MAX_REQUEST_UPLOAD_BYTES) return 'tooLarge';

    const mimeType = sniffMimeType(bytes.subarray(0, 32));
    if (!mimeType || !isAllowedMimeType(mimeType)) return 'badType';

    ready.push({
      fileName: safeFileName(file.name, index),
      mimeType,
      bytes,
      size: bytes.byteLength,
    });
  }

  return ready;
}

/**
 * The one write on this app that nobody has to sign in to perform.
 *
 * Everything else in `lib/actions` opens with `authorize(...)` and refuses
 * whoever is not allowed. This cannot: it is the button on the practice's public
 * page that says "ring me back", and requiring an account to press it would
 * defeat the entire purpose of the page it sits on.
 *
 * So the guards are different in kind, and there are four of them:
 *
 *  1. **It cannot reach anything a stranger cannot already see.** The action
 *     writes one row into `AppointmentRequest`, and the only thing it reads is
 *     `getBookingWindow` — the practice's opening hours and its closures, which
 *     are printed on the page this form is on. There is no patient lookup, no
 *     "do we know this number", no branch whose timing could answer a question
 *     about who is already on file. A stranger's only observable outcome is
 *     "accepted", "pick another day", or "try again later".
 *  2. **It is throttled per address**, on the same in-memory bucket the
 *     confirmation link uses. Four an hour is far above what a person filling in
 *     a form needs and far below what makes a table worth spamming.
 *  3. **It carries a honeypot.** `website` is a real input, hidden from people
 *     and from screen readers, and left empty by every human being. Anything
 *     that fills it is told the request was accepted and nothing is written —
 *     a bot that is told it failed comes back and tries differently.
 *  4. **Every field is capped** before it reaches Postgres, so a megabyte of
 *     text is a sentence in the visitor's own language rather than a database
 *     error in the practice's log.
 *
 * **And it now takes files**, which is the one thing on this list that changed
 * the shape of the risk rather than the size of it: until this, the worst a
 * stranger could do here was write text into a column. `readAttachments` is
 * where that is answered — a count, a total, and a type read off the bytes
 * instead of off the sender's word — and the bytes are written only once
 * everything else about the request has been accepted. A request that fails
 * validation leaves nothing on disk, and a request whose row fails to write
 * takes its files back off again.
 *
 * There is no audit entry, deliberately. `recordAudit` records what a *member of
 * staff* did, and attributing this to nobody would put a row in the trail that
 * no account is answerable for. The request itself is the record.
 */
export async function requestAppointment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const t = await getTranslations('site');

  // Silently accepted, never stored. See (3) above.
  if (requiredString(formData.get('website'))) return actionOk();

  const limit = rateLimit(`request:${clientKey(await headers())}`, {
    limit: 4,
    windowMs: 60 * 60_000,
  });
  if (!limit.allowed) return actionError(t('form.tooMany'));

  const name = requiredString(formData.get('name'));
  const phone = requiredString(formData.get('phone'));
  if (!name || !phone) return actionError(t('form.missing'));

  if (
    name.length > REQUEST_LIMITS.name ||
    phone.length > REQUEST_LIMITS.phone ||
    (formData.get('email')?.toString().length ?? 0) > REQUEST_LIMITS.email ||
    (formData.get('message')?.toString().length ?? 0) > REQUEST_LIMITS.message
  ) {
    return actionError(t('form.tooLong'));
  }

  // Long enough to be a telephone number somebody could actually ring.
  //
  // The field was length-capped and nothing else, so `type="tel"` — which
  // validates nothing, in any browser — was the whole of it, and a slip of the
  // thumb produced a request that looks perfectly good on the desk's screen and
  // rings nowhere. That is the worst shape this failure can take: the practice
  // spends the call, the visitor never hears back, and neither side ever learns
  // why.
  //
  // Deliberately the crudest possible test. Albanian numbers are written
  // `069 12 34 567`, Italian ones `+39 340 …`, and this form exists to be filled
  // in from three countries — so anything that counts digits by country would be
  // a rule that refuses a real patient, which is far worse than accepting an odd
  // one. Six digits is below every national minimum and above every typo.
  if (!hasEnoughDigits(phone)) return actionError(t('form.phoneShort'));

  const topic = optionalString(formData.get('topic'));

  const attachments = await readAttachments(formData);
  if (attachments === 'tooMany') {
    return actionError(t('form.filesTooMany', { max: MAX_REQUEST_FILES }));
  }
  if (attachments === 'tooLarge') {
    return actionError(
      t('form.filesTooLarge', { max: Math.floor(MAX_REQUEST_UPLOAD_BYTES / (1024 * 1024)) }),
    );
  }
  if (attachments === 'badType') return actionError(t('form.filesType'));

  const preferred = await readPreferredDay(formData);
  if (preferred === 'unavailable') return actionError(t('book.dayGone'));

  // Last, and only once every refusal above has been passed. Bytes written for a
  // request that then turns out to be unacceptable are bytes nothing will ever
  // point at.
  const stored: string[] = [];
  try {
    for (const file of attachments) {
      stored.push(await storeFile(file.bytes, file.mimeType));
    }
  } catch (error) {
    console.error('[site] could not store an attachment', error);
    await Promise.all(stored.map(deleteStoredFile));
    return actionError(t('form.filesFailed'));
  }

  try {
    await prisma.appointmentRequest.create({
      data: {
        name,
        phone,
        email: optionalString(formData.get('email')),
        message: optionalString(formData.get('message')),
        preferredDate: preferred.date,
        preferredTime: preferred.half,
        // Anything the form did not offer is dropped rather than stored: `topic`
        // is rendered back to the desk through `messages`, and a key with no
        // translation behind it would show up on their screen as the raw string
        // somebody posted.
        topic: topic && isRequestTopic(topic) ? topic : null,
        locale: await getLocale(),
        // Nested, so the request and the files it came with are one transaction.
        // A row that exists without its attachments would tell the desk somebody
        // sent nothing, which is worse than the write having failed outright.
        attachments: {
          create: attachments.map((file, index) => ({
            fileName: file.fileName,
            mimeType: file.mimeType,
            sizeBytes: file.size,
            storageKey: stored[index],
          })),
        },
      },
      select: { id: true },
    });
  } catch (error) {
    // Do not leave orphans on disk that no row points at. The sweeper would
    // clear them eventually; an hour of somebody's radiographs sitting in the
    // storage directory unreferenced is not a thing to leave to a weekly job.
    await Promise.all(stored.map(deleteStoredFile));
    console.error('[site] could not record the request', error);
    return actionError(t('form.failed'));
  }

  await alertTheDesk({
    name,
    phone,
    email: optionalString(formData.get('email')),
    topic: topic && isRequestTopic(topic) ? topic : null,
    preferredDate: preferred.date,
    preferredHalf: preferred.half,
    attachments: attachments.length,
  });

  // The desk's list, and the dashboard card that counts it. `layout` because the
  // count also rides in the navigation rail.
  revalidatePath('/', 'layout');
  return actionOk();
}
