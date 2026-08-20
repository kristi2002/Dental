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
  | 'bad-reply-to';

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

  // Nothing at all is the ordinary state of a clinic that has not got to this
  // yet, and it is not an error — the queue keeps offering `mailto:` links.
  if (!key && !from && !named && !reply) return { ok: false, problem: 'unset' };

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

  return {
    ok: true,
    config: {
      provider: named,
      apiKey: key,
      fromAddress: sender.address,
      fromName: sender.name,
      replyTo: reply || null,
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
