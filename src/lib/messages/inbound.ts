import { isAllowedMimeType, MAX_FILE_BYTES } from '@/lib/file-constants';
import { isEmailAddress, normaliseMessageId, referencedMessageIds } from './email';

/**
 * What arrives, decided without touching the network or the database.
 *
 * Pure for the reason `email.ts` is pure: this is the code that reads input
 * chosen by an unauthenticated stranger, and the only way to be sure it holds
 * is to be able to hand it a hostile payload in a test. The route next door
 * does the fetching and the writing and makes no decisions of its own.
 *
 * **Why the provider's shape, rather than raw MIME.** Brevo's inbound parsing
 * hands over JSON that has already been decoded — headers separated, body split
 * into text and HTML parts, attachments listed with their types. Taking the raw
 * message instead would mean a MIME parser in `package.json`, and MIME parsers
 * are a category of dependency with a long history of being the way something
 * gets in. The trade is a coupling to one provider's field names, and it is
 * bounded: it is this file, and `parseBrevoInbound` is forty lines.
 */

export type InboundAttachment = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Exchanged for the bytes by the route. Short-lived, per Brevo. */
  downloadToken: string;
};

export type InboundEmail = {
  /** The RFC `Message-ID` header. Null when the sender omitted one, which happens. */
  messageId: string | null;
  fromAddress: string;
  fromName: string;
  toAddress: string;
  subject: string;
  text: string;
  html: string | null;
  /** Ids this message answers, nearest ancestor first. */
  references: string[];
  /** 0–10, higher is worse. Null when the provider did not say. */
  spamScore: number | null;
  /**
   * A machine sent this — an out-of-office, a bounce, a mailing list. Worth
   * knowing because such a message is *about* a conversation without being a
   * reply in it, and letting one mark a thread "the patient answered" would be
   * the app reading a holiday auto-reply as a confirmation.
   */
  automated: boolean;
  attachments: InboundAttachment[];
};

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * One header, whatever shape the provider used for it.
 *
 * Header names are case-insensitive and repeatable, so this looks the name up
 * without regard to case and joins a repeated header rather than picking one
 * of them — `References` in particular is legitimately folded across several.
 */
function header(headers: unknown, name: string): string | null {
  if (typeof headers !== 'object' || headers === null) return null;
  const wanted = name.toLowerCase();

  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() !== wanted) continue;
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.filter((v) => typeof v === 'string').join(' ');
  }
  return null;
}

/**
 * The headers that mean "nobody is reading replies to this".
 *
 * Every one of them is a convention rather than a standard, which is why all
 * four are checked: `Auto-Submitted` is the RFC 3834 one and the only
 * well-behaved senders set it, `Precedence` is what everything else has used
 * since the eighties, and the two `X-` ones are Microsoft's.
 */
function looksAutomated(headers: unknown, fromAddress: string): boolean {
  const autoSubmitted = header(headers, 'auto-submitted');
  if (autoSubmitted && autoSubmitted.trim().toLowerCase() !== 'no') return true;

  const precedence = (header(headers, 'precedence') ?? '').trim().toLowerCase();
  if (precedence === 'bulk' || precedence === 'auto_reply' || precedence === 'list') return true;

  if (header(headers, 'x-autoreply') || header(headers, 'x-autorespond')) return true;

  // The null sender. A bounce comes from nobody, by design, and there is no
  // conversation to be had with an empty envelope.
  const from = fromAddress.trim().toLowerCase();
  return from === '' || from.startsWith('mailer-daemon@') || from.startsWith('postmaster@');
}

/**
 * The first address in a `To:` list, which is the only one this app can act on.
 *
 * A message addressed to the practice and three other people is still a message
 * to the practice; the rest is somebody else's thread.
 */
function firstAddress(list: unknown): { address: string; name: string } {
  if (!Array.isArray(list)) return { address: '', name: '' };
  for (const entry of list) {
    if (typeof entry !== 'object' || entry === null) continue;
    const box = entry as Record<string, unknown>;
    const address = str(box.Address).trim();
    if (address) return { address, name: str(box.Name).trim() };
  }
  return { address: '', name: '' };
}

/**
 * Attachments worth keeping, and the ones quietly dropped.
 *
 * Dropped rather than refused: an attachment this app will not store is not a
 * reason to lose the message it came with, and the message is very often the
 * part that mattered. The same allowlist the upload form uses — a patient
 * emailing an `.exe` is not a patient this app is going to help.
 */
function usableAttachments(list: unknown): InboundAttachment[] {
  if (!Array.isArray(list)) return [];

  const out: InboundAttachment[] = [];
  for (const entry of list) {
    if (typeof entry !== 'object' || entry === null) continue;
    const item = entry as Record<string, unknown>;

    const mimeType = str(item.ContentType).split(';')[0].trim().toLowerCase();
    const downloadToken = str(item.DownloadToken).trim();
    const sizeBytes = typeof item.ContentLength === 'number' ? item.ContentLength : 0;

    if (!downloadToken || !isAllowedMimeType(mimeType)) continue;
    if (sizeBytes <= 0 || sizeBytes > MAX_FILE_BYTES) continue;

    out.push({
      // Display only. `storeFile` generates the name on disk, so this never
      // reaches the filesystem — but it does reach a screen, so the path
      // separators come out to stop it reading as a location.
      fileName: str(item.Name).replace(/[/\\]/g, '_').slice(0, 200) || 'attachment',
      mimeType,
      sizeBytes,
      downloadToken,
    });
  }
  return out;
}

/** How many attachments one message may bring. Past this it is not correspondence. */
const MAX_ATTACHMENTS = 10;

/**
 * Brevo's inbound payload, turned into the shape this app stores.
 *
 * Returns an array because the webhook batches: Brevo may deliver several
 * messages in one POST, and each is independent — one being unusable must not
 * discard the rest.
 */
export function parseBrevoInbound(payload: unknown): InboundEmail[] {
  if (typeof payload !== 'object' || payload === null) return [];
  const items = (payload as Record<string, unknown>).items;
  if (!Array.isArray(items)) return [];

  const out: InboundEmail[] = [];

  for (const entry of items) {
    if (typeof entry !== 'object' || entry === null) continue;
    const item = entry as Record<string, unknown>;

    const from =
      typeof item.From === 'object' && item.From !== null
        ? (item.From as Record<string, unknown>)
        : {};
    const fromAddress = str(from.Address).trim();

    // Without a sender there is nobody to reply to and no way to file it. Every
    // other field is allowed to be missing.
    if (!fromAddress || !isEmailAddress(fromAddress)) continue;

    const to = firstAddress(item.To);
    const headers = item.Headers;
    const messageId = str(item.MessageId).trim() || header(headers, 'message-id') || '';

    const text = str(item.RawTextBody).trim();
    const html = str(item.RawHtmlBody).trim();
    const markdown = str(item.ExtractedMarkdownMessage).trim();

    out.push({
      messageId: messageId ? normaliseMessageId(messageId) : null,
      fromAddress: fromAddress.toLowerCase(),
      fromName: str(from.Name).trim().slice(0, 200),
      toAddress: to.address.toLowerCase(),
      subject: str(item.Subject).trim().slice(0, 500) || '(no subject)',
      // Brevo's own extraction of "what this person actually wrote", with the
      // quoted history and the signature stripped, is better than the raw part
      // for every message a human typed — and is empty for the machine-made
      // ones, which is what the fallbacks are for.
      text: markdown || text || stripTags(html),
      html: html || null,
      references: referencedMessageIds(str(item.InReplyTo), header(headers, 'references')),
      spamScore: typeof item.SpamScore === 'number' ? item.SpamScore : null,
      automated: looksAutomated(headers, fromAddress),
      attachments: usableAttachments(item.Attachments).slice(0, MAX_ATTACHMENTS),
    });
  }

  return out;
}

/**
 * A last-resort body for a message that arrived as markup and nothing else.
 *
 * **Not a sanitiser, and must never be mistaken for one.** Nothing in this app
 * renders inbound HTML — the stored `html` column exists so somebody can
 * download the original, never so a page can print it. This is here for the
 * narrower job of leaving a legible line in the list when a sender's mail
 * client sent no text part at all, and it is allowed to be crude because its
 * output is escaped by React like any other string.
 */
function stripTags(html: string): string {
  if (!html) return '';
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Above this, the provider is confident it is spam and the thread starts filed
 * away rather than in the inbox.
 *
 * Filed, never dropped. A number chosen by somebody else's classifier is not a
 * good enough reason to destroy a message a patient may have sent — and the one
 * time it is wrong, the practice needs to be able to go and look.
 */
export const SPAM_SCORE_LIMIT = 7;

export type ThreadMatch =
  | { kind: 'reply'; threadId: string }
  | { kind: 'known'; patientId: string }
  | { kind: 'unknown' };

/**
 * Which conversation a message belongs to, given what the database already holds.
 *
 * Takes the two lookups as arguments rather than performing them, so the order
 * of the attempts — the part that is a decision — can be tested without a
 * database. The route supplies the queries.
 *
 * The order is not arbitrary. A `References` chain is the sender's own client
 * telling us which message it answers, and it is right far more often than an
 * address is: one person may write from two mailboxes, and two people share one
 * `info@` all the time. So the header wins where there is one, the address is
 * the fallback, and a stranger gets a thread of their own rather than being
 * guessed at.
 */
export async function matchThread(
  email: InboundEmail,
  lookup: {
    threadByReference: (referencedIds: string[]) => Promise<string | null>;
    patientByEmail: (address: string) => Promise<string | null>;
  },
): Promise<ThreadMatch> {
  if (email.references.length > 0) {
    const threadId = await lookup.threadByReference(email.references);
    if (threadId) return { kind: 'reply', threadId };
  }

  const patientId = await lookup.patientByEmail(email.fromAddress);
  if (patientId) return { kind: 'known', patientId };

  return { kind: 'unknown' };
}

/**
 * The subject a new thread takes, with the reply prefixes taken off.
 *
 * Three languages' worth, because the app is trilingual and an Italian client
 * writes `R:` where an English one writes `Re:`. Repeated because mail clients
 * stack them: `Re: R: Re: Fwd:` is an ordinary thing to receive.
 */
export function threadSubject(subject: string): string {
  let value = subject.trim();
  let previous = '';

  while (value !== previous) {
    previous = value;
    value = value.replace(/^\s*(re|r|rif|aw|fwd|fw|i|përcjell)\s*(\[\d+\])?\s*:\s*/i, '');
  }

  return (value || subject).trim().slice(0, 500);
}
