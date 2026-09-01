/**
 * What it takes to actually send one, decided without touching the network.
 *
 * Pure on purpose — every rule below is exercised by `tests/email.test.ts`
 * against no provider at all, including the exact JSON body each one receives.
 * The alternative is finding out the payload was wrong by sending a wrong one to
 * a patient, which is not a debugging loop this app gets to have.
 *
 * **Why an HTTPS API rather than SMTP.** SMTP would be provider-agnostic and it
 * is the obvious choice, right up until the deploy: hosts block outbound 25,
 * 465 and 587 by default far more often than they block 443, and a clinic whose
 * reminders silently fail because a VPS has a firewall rule is exactly the
 * failure this app should not ship. The API also needs no dependency — one
 * `fetch`, no transport library in the image — which keeps `package.json` at the
 * eleven entries it has earned.
 *
 * Two providers because both have a free tier a small practice will never
 * exhaust, and because supporting the second one cost thirty lines and proves
 * the first is not baked into the call site.
 */

/** Who can be sent through. Both free tiers cover a clinic's daily handful. */
export type MailProvider = 'brevo' | 'resend';

export type MailerConfig = {
  provider: MailProvider;
  apiKey: string;
  /** The address the practice sends from. Must be one the provider has verified. */
  fromAddress: string;
  /** The display name beside it. Empty is allowed; the address alone is valid. */
  fromName: string;
  /**
   * Where a reply should land. Configuration rather than a database column,
   * because it belongs with the rest of the sending setup and because a message
   * must never depend on a row somebody may not have filled in yet.
   *
   * Null means the header is omitted entirely and replies go to the sending
   * address — which for a `no-reply@` mailbox means nowhere, so this is the one
   * optional setting the deployment guide argues hardest for.
   */
  replyTo: string | null;
  /**
   * Where Settings → Sending email aims its test message. Never null: there is
   * always somewhere sensible to put one, and resolving the fallback here means
   * the button and the sentence printed beside it cannot disagree about where
   * it is about to go.
   *
   * **Why it is a setting of its own rather than Reply-To.** The two answer
   * different questions. Reply-To is where a *patient* is sent when they answer
   * a reminder, and on a real practice that is the front desk's mailbox. The
   * test is for whoever is wiring the DNS up, and they need it in a folder they
   * can watch — which during setup is very often not the practice's inbox at
   * all. Overloading Reply-To to get a test somewhere means every patient reply
   * follows it there, which is a strange price for reading one message.
   *
   * **Still not a form field.** It comes from the environment, so the only
   * person who can change it is the one with access to the server — which is
   * the property `sendTestEmail` is really defending. A "send a test to…" box
   * on the settings page would be a way of mailing anyone at all from the
   * practice's verified domain.
   */
  testTo: string;
};

/**
 * Why email is not configured, as opposed to how loudly to say so.
 *
 * Separate from the message for the reason `backup-status.ts` separates them:
 * "nobody has set this up" and "somebody set it up wrongly" look identical on a
 * card and want completely different things done about them.
 */
export type MailerProblem =
  | 'unset'
  | 'unknown-provider'
  | 'no-key'
  | 'bad-from'
  | 'bad-reply-to'
  | 'bad-test-to';

export type MailerConfigResult =
  | { ok: true; config: MailerConfig }
  | { ok: false; problem: MailerProblem };

/**
 * `Name <address>` or a bare address.
 *
 * Written out rather than pulled from a library because the only shape that has
 * to be understood is the one this app documents in `.env.production.example`.
 */
export function parseFrom(value: string): { name: string; address: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const angled = /^(.*)<([^<>]+)>$/.exec(trimmed);
  const address = (angled ? angled[2] : trimmed).trim();
  if (!isEmailAddress(address)) return null;

  // Quotes around a display name are the convention in a mail header and noise
  // in a JSON field, which is the only place this one ends up.
  const name = angled ? angled[1].trim().replace(/^"(.*)"$/, '$1').trim() : '';
  return { name, address };
}

/**
 * Conservative to the point of rejecting addresses that are technically legal.
 *
 * A quoted local part with a space in it is valid per RFC 5321 and has never
 * once been a real patient's address; refusing it costs nothing and closes the
 * whole class of inputs that behave strangely somewhere downstream. Control
 * characters are refused outright — the payload is JSON over HTTPS so there are
 * no headers to inject into, but that is a property of today's transport and
 * not a reason to pass them on.
 */
export function isEmailAddress(value: string): boolean {
  const address = value.trim();
  if (address.length === 0 || address.length > 254) return false;
  // Whitespace and the punctuation that separates one address from another.
  // Note what is deliberately absent: the hyphen. Every second clinic mailbox
  // is called `no-reply@`, and an over-eager character class would refuse it.
  if (/[\s<>",;]/.test(address)) return false;

  // The C0 range and DEL, by code point rather than by a regex escape. A
  // control character written into source as a hex escape is one nobody can see
  // in a diff, and one a careless writer turns into a literal NUL byte.
  for (const character of address) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return false;
  }

  const at = address.lastIndexOf('@');
  if (at <= 0 || at === address.length - 1) return false;

  const local = address.slice(0, at);
  const domain = address.slice(at + 1);
  if (local.length > 64) return false;
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) return false;
  if (domain.includes('..')) return false;

  return true;
}

/**
 * The configuration, read off the environment.
 *
 * Takes the environment rather than reading `process.env` so a test can state a
 * case in four lines, and so the settings card and the sender cannot disagree
 * about what "configured" means.
 */
export function readMailerConfig(env: Record<string, string | undefined>): MailerConfigResult {
  const key = (env.MAIL_API_KEY ?? '').trim();
  const from = (env.MAIL_FROM ?? '').trim();
  const named = (env.MAIL_PROVIDER ?? '').trim().toLowerCase();
  const reply = (env.MAIL_REPLY_TO ?? '').trim();
  const test = (env.MAIL_TEST_TO ?? '').trim();

  // Nothing at all is the ordinary state of a clinic that has not got to this
  // yet, and it is not an error — the queue keeps offering `mailto:` links.
  if (!key && !from && !named && !reply && !test) return { ok: false, problem: 'unset' };

  if (named !== 'brevo' && named !== 'resend') {
    return { ok: false, problem: 'unknown-provider' };
  }
  if (!key) return { ok: false, problem: 'no-key' };

  const sender = parseFrom(from);
  if (!sender) return { ok: false, problem: 'bad-from' };

  // Set but wrong is a different situation from not set, and the difference is
  // worth a message: a typo here means every reply a patient sends bounces, and
  // nothing else in the system would ever mention it.
  if (reply && !isEmailAddress(reply)) return { ok: false, problem: 'bad-reply-to' };

  // Same argument once more, and it lands harder here: a typo in this one means
  // the test button reports success against an address nobody reads, which is
  // precisely the false reassurance the button exists to prevent.
  if (test && !isEmailAddress(test)) return { ok: false, problem: 'bad-test-to' };

  return {
    ok: true,
    config: {
      provider: named,
      apiKey: key,
      fromAddress: sender.address,
      fromName: sender.name,
      replyTo: reply || null,
      // The ladder, resolved once. Unset falls back to Reply-To, which is what
      // this did before the setting existed, so a deployment that never names
      // one behaves exactly as it always has.
      testTo: test || reply || sender.address,
    },
  };
}

export type OutgoingMail = {
  to: string;
  toName: string;
  subject: string;
  /** Plain text only. See `mailRequest`. */
  text: string;
};

/**
 * The HTTP request that sends one message, as data.
 *
 * Returned rather than performed so the payload each provider receives is a
 * value a test can assert on. `mailer.ts` does nothing but hand this to `fetch`.
 *
 * **Plain text, never HTML.** A reminder is three sentences and a link; there is
 * nothing HTML would add. It also means there is no markup for a patient's name
 * to be interpolated into, so the whole class of injection bugs that comes with
 * building mail bodies by concatenation simply does not arise here.
 */
export function mailRequest(
  config: MailerConfig,
  mail: OutgoingMail,
): { url: string; headers: Record<string, string>; body: string } {
  if (config.provider === 'brevo') {
    return {
      url: 'https://api.brevo.com/v3/smtp/email',
      headers: {
        'api-key': config.apiKey,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: config.fromName
          ? { name: config.fromName, email: config.fromAddress }
          : { email: config.fromAddress },
        to: [mail.toName ? { email: mail.to, name: mail.toName } : { email: mail.to }],
        subject: mail.subject,
        textContent: mail.text,
        ...(config.replyTo ? { replyTo: { email: config.replyTo } } : {}),
      }),
    };
  }

  return {
    url: 'https://api.resend.com/emails',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: config.fromName
        ? `${config.fromName} <${config.fromAddress}>`
        : config.fromAddress,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
      ...(config.replyTo ? { reply_to: config.replyTo } : {}),
    }),
  };
}

/**
 * The identity the provider gave the message it just accepted.
 *
 * **Why this is read at all.** A reply arrives carrying `In-Reply-To`, and the
 * only way to know which conversation it belongs to is to have written down
 * what went out. Until now the response body was read for the error text and
 * thrown away on success, which was correct for a system that could not
 * receive anything and is the one thing that has to change first now that it
 * can. Adding it afterwards would leave a gap of threadless replies exactly as
 * wide as the interval between the two deployments.
 *
 * **The two providers do not answer the same question.** Brevo returns the real
 * RFC 5322 header, angle brackets and all. Resend returns its own id, which is
 * not the header but does appear *inside* it. So this stores whatever came
 * back, and matching is done loosely at the other end — see `matchesMessageId`,
 * which is where that looseness is paid for and explained.
 */
export function readMessageId(provider: MailProvider, body: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // A provider that accepted the message and answered with something other
    // than JSON has still sent it. Losing the thread is worth far less than
    // failing a send that worked.
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Record<string, unknown>;

  const value = provider === 'brevo' ? record.messageId : record.id;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * A `Message-ID` reduced to the part two mail clients would agree on.
 *
 * The header is case-insensitive in practice, is written with and without
 * angle brackets by different software, and picks up whitespace in transit.
 * None of that is a difference in identity, and comparing raw strings would
 * make it one.
 */
export function normaliseMessageId(value: string): string {
  return value.trim().replace(/^<|>$/g, '').trim().toLowerCase();
}

/**
 * Every id named by an `In-Reply-To` or `References` header, in the order a
 * thread should be looked for: the direct parent first, then back up the chain.
 *
 * `References` lists the whole ancestry oldest-first, so it is reversed — the
 * nearest ancestor is the one most likely to still be a thread we hold.
 */
export function referencedMessageIds(inReplyTo?: string | null, references?: string | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const take = (header: string | null | undefined, reverse: boolean) => {
    if (!header) return;
    const ids = header.match(/<[^<>]+>/g) ?? header.trim().split(/\s+/);
    for (const id of reverse ? ids.toReversed() : ids) {
      const key = normaliseMessageId(id);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
  };

  take(inReplyTo, false);
  take(references, true);
  return out;
}

/**
 * Whether a stored outbound id is the one a reply is answering.
 *
 * Exact match first, which is the Brevo case and the honest one. The fallback
 * is for Resend, whose id is a bare uuid that the outgoing `Message-ID` header
 * was built around: `<uuid@send.klinika.al>`. Containment is a blunt test and
 * it is bounded by the length check — a stored id short enough to appear inside
 * an unrelated header by chance is not something to thread on.
 */
export function matchesMessageId(stored: string, referenced: string): boolean {
  const a = normaliseMessageId(stored);
  const b = normaliseMessageId(referenced);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.length >= 16 && b.includes(a);
}

/**
 * Where to fetch one inbound attachment from, given the token the webhook
 * carried.
 *
 * Brevo hands over a token rather than the bytes, so a message with three
 * X-rays on it is a small JSON POST and three deliberate fetches — which is the
 * right way round, because it means the app decides what it is willing to
 * store *before* anything is transferred. See `usableAttachments`.
 *
 * Brevo-only: Resend has no inbound product, so a practice on Resend sends
 * through Resend and receives through nothing. That is stated in the deployment
 * notes rather than papered over here.
 */
export function inboundAttachmentRequest(
  apiKey: string,
  downloadToken: string,
): { url: string; headers: Record<string, string> } {
  return {
    url: `https://api.brevo.com/v3/inbound/attachments/${encodeURIComponent(downloadToken)}`,
    headers: { 'api-key': apiKey, accept: 'application/octet-stream' },
  };
}

/**
 * Why a send failed, in the only four ways worth telling apart.
 *
 * Each one has a different person fixing it, which is the test for whether a
 * distinction earns its keep: `rejected` is the owner verifying a sender domain,
 * `auth` is the owner pasting the key again, `limit` is waiting until tomorrow
 * or paying, and `unreachable` is nobody — try again, or use WhatsApp.
 */
export type MailFailure = 'auth' | 'rejected' | 'limit' | 'unreachable';

export function classifyStatus(status: number): MailFailure {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'limit';
  // 400 and 422 are both "we understood you and are refusing" — almost always
  // an unverified sender domain, which is the first thing anybody hits.
  if (status >= 400 && status < 500) return 'rejected';
  return 'unreachable';
}

/** The stored, English, one-line `note` for a row whose send did not work. */
export const MAIL_FAILURE_NOTES: Record<MailFailure, string> = {
  auth: 'the mail provider refused the key',
  rejected: 'the mail provider refused the message',
  limit: "today's sending limit is used up",
  unreachable: 'the mail provider could not be reached',
};

/** And the one for a send that did. Mirrors `SENT_NOTES` in `outbox.ts`. */
export const MAIL_SENT_NOTE = 'sent by email';
