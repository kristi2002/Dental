import { NextResponse } from 'next/server';
import { secretMatches } from '@/lib/constant-time';
import { MAX_FILE_BYTES } from '@/lib/file-constants';
import { storeFile } from '@/lib/files';
import {
  patientByEmail,
  recordInbound,
  threadByReference,
  type StoredAttachment,
} from '@/lib/messages/correspondence';
import { inboundAttachmentRequest } from '@/lib/messages/email';
import {
  matchThread,
  parseBrevoInbound,
  SPAM_SCORE_LIMIT,
  type InboundAttachment,
  type InboundEmail,
} from '@/lib/messages/inbound';
import { mailerConfig } from '@/lib/messages/mailer';

export const dynamic = 'force-dynamic';

/**
 * Where a patient's reply comes in.
 *
 * The other half of `mailer.ts`, and the more exposed half by a wide margin.
 * Everything the jobs endpoint says about being reachable from the internet
 * applies here and then some: that one is knocked on by a clock the practice
 * runs, and this one is knocked on by a mail provider on behalf of *anybody who
 * can send an email*. The secret proves the request came from the provider; it
 * proves nothing whatever about the message inside, which is why every decision
 * about the content is made in `inbound.ts` where it can be tested against
 * hostile input.
 *
 * **Why the secret is in the URL.** Brevo's inbound webhook is configured with a
 * URL and nothing else — it will not send a custom header — so a query string is
 * the only channel there is. That is worse than a header (URLs turn up in
 * proxy logs) and it is the whole of what is available, so the secret is
 * rotatable and the endpoint fails closed without one. A header is accepted too,
 * for anything that can send one.
 *
 * **It always answers 200 once the secret is right.** A webhook that returns 500
 * gets retried, and a message this app has refused on purpose — spam, an
 * attachment type it will not store — would be retried forever. What went wrong
 * goes in the response body for whoever is reading the provider's delivery log.
 */

/** Past this the request is not correspondence, it is somebody trying something. */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

/** One message's attachments should not hold the webhook open all day. */
const ATTACHMENT_TIMEOUT_MS = 20_000;

function authorised(request: Request): boolean {
  const secret = process.env.MAIL_INBOUND_SECRET;

  // Unset means nothing may come in — the same fail-closed posture as the jobs
  // endpoint, and for the same reason: an unconfigured deployment is the most
  // ordinary way for a deployment to be wrong.
  if (!secret || secret.length < 16) {
    console.error('[mail] MAIL_INBOUND_SECRET is missing or too short — refusing every delivery.');
    return false;
  }

  const provided =
    request.headers.get('x-mail-secret') ??
    new URL(request.url).searchParams.get('key') ??
    '';

  return secretMatches(provided, secret);
}

/**
 * Fetch one attachment and put it on disk.
 *
 * Returns null rather than throwing: an attachment that will not download is a
 * reason to lose the attachment and never a reason to lose the message, which
 * is very often the part that mattered.
 *
 * The size is checked twice — once against what the provider *said* in the
 * webhook, in `usableAttachments`, and again here against what actually
 * arrived. The first is a claim by the sender and the second is a fact.
 */
async function pullAttachment(
  apiKey: string,
  attachment: InboundAttachment,
): Promise<StoredAttachment | null> {
  const request = inboundAttachmentRequest(apiKey, attachment.downloadToken);

  try {
    const response = await fetch(request.url, {
      headers: request.headers,
      signal: AbortSignal.timeout(ATTACHMENT_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error('[mail] attachment refused', response.status, attachment.fileName);
      return null;
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_FILE_BYTES) {
      console.error('[mail] attachment out of range', bytes.byteLength, attachment.fileName);
      return null;
    }

    return {
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: bytes.byteLength,
      storageKey: await storeFile(bytes, attachment.mimeType),
    };
  } catch (error) {
    console.error('[mail] could not pull an attachment', attachment.fileName, error);
    return null;
  }
}

async function fileOne(email: InboundEmail, apiKey: string | null): Promise<boolean> {
  const match = await matchThread(email, { threadByReference, patientByEmail });

  const spam = email.spamScore !== null && email.spamScore >= SPAM_SCORE_LIMIT;

  // Nothing is downloaded for a message the classifier has already condemned.
  // Spam is where the hostile attachments are, and the thread is filed away
  // where nobody will open them anyway.
  const attachments =
    spam || !apiKey || email.attachments.length === 0
      ? []
      : (await Promise.all(email.attachments.map((item) => pullAttachment(apiKey, item)))).filter(
          (item): item is StoredAttachment => item !== null,
        );

  const { stored } = await recordInbound(
    email,
    {
      threadId: match.kind === 'reply' ? match.threadId : null,
      patientId: match.kind === 'known' ? match.patientId : null,
      spam,
    },
    attachments,
  );

  return stored;
}

export async function POST(request: Request) {
  if (!authorised(request)) {
    // 404 rather than 401, as the jobs endpoint does: whether this URL exists is
    // not something an unproven caller needs to learn.
    return new NextResponse(null, { status: 404 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ status: 'too-large' }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ status: 'unreadable' });
  }

  const emails = parseBrevoInbound(payload);
  if (emails.length === 0) return NextResponse.json({ status: 'nothing-usable' });

  // The API key is the mail configuration's, because attachments are fetched
  // back from the same provider that delivered the webhook. A practice that has
  // taken its mail configuration away still receives the words.
  const apiKey = mailerConfig()?.apiKey ?? null;

  let stored = 0;
  for (const email of emails) {
    // One at a time. A batch is a handful, each one writes, and the failure
    // mode of doing them together is two messages from the same stranger racing
    // to create the same thread — which the unique key would settle, at the
    // cost of one of them being dropped.
    try {
      if (await fileOne(email, apiKey)) stored += 1;
    } catch (error) {
      console.error('[mail] could not file an inbound message', error);
    }
  }

  return NextResponse.json(
    { status: 'ok', received: emails.length, stored },
    { headers: { 'cache-control': 'no-store' } },
  );
}
