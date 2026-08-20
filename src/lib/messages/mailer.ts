import {
  classifyStatus,
  mailRequest,
  readMailerConfig,
  type MailerConfig,
  type MailerProblem,
  type MailFailure,
  type OutgoingMail,
} from './email';

/**
 * The one function in this app that talks to the outside world on a patient's
 * behalf.
 *
 * Everything it decides lives next door in `email.ts`, where it can be tested.
 * This is the seam: read the configuration, build the request, hand it to
 * `fetch`, translate the outcome back into something the queue can record. It
 * is deliberately thin, because it is the only part that cannot be exercised
 * without a provider and a key.
 *
 * **What this does not change.** The blueprint's rule is "nudge, don't send",
 * and the reason given is that a human reviews every message. That is still
 * true: nothing here runs on a clock, and the only caller is a button somebody
 * presses on the send queue after reading the row. What has changed is the
 * transport — the message now leaves over HTTPS instead of being handed to a
 * mail client — and that is a deliberate relaxation, recorded in the blueprint
 * rather than smuggled in. See `docs/APP-BLUEPRINT.md` §1.2.
 */

export type MailResult = { ok: true } | { ok: false; failure: MailFailure; detail: string };

/**
 * How long to wait before giving up on the provider.
 *
 * Short, because somebody is standing at a desk watching a button spin. A send
 * that has not happened in ten seconds is one they should be told about so they
 * can reach for WhatsApp instead — and the row stays PENDING, so nothing is
 * lost if the message did in fact go out.
 */
const TIMEOUT_MS = 10_000;

export async function sendMail(mail: OutgoingMail): Promise<MailResult> {
  const result = readMailerConfig(process.env);
  if (!result.ok) {
    return { ok: false, failure: 'auth', detail: `not configured: ${result.problem}` };
  }

  const request = mailRequest(result.config, mail);

  try {
    const response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.ok) return { ok: true };

    // Read the body for the log and nothing else. Providers put useful sentences
    // in here ("sender not verified"), and they also put the message back, so it
    // is written to the server log and never to the screen or the note column.
    const detail = (await response.text().catch(() => '')).slice(0, 500);
    console.error('[mail] provider refused', response.status, detail);
    return { ok: false, failure: classifyStatus(response.status), detail };
  } catch (error) {
    console.error('[mail] could not reach the provider', error);
    return { ok: false, failure: 'unreachable', detail: String(error).slice(0, 200) };
  }
}

export type MailerStatus =
  | { configured: true; provider: string; from: string; replyTo: string | null }
  | { configured: false; problem: MailerProblem };

/**
 * The configuration itself, for the two callers that need an address out of it
 * rather than a sentence about it. Null when email is not set up.
 */
export function mailerConfig(): MailerConfig | null {
  const result = readMailerConfig(process.env);
  return result.ok ? result.config : null;
}

/**
 * Whether email would work, without sending anything.
 *
 * Read by the settings card and by the queue, which needs to know whether to
 * offer a button that sends or a link that opens a draft. It cannot tell a good
 * key from a bad one — only a real send can do that — so the card says what it
 * knows and no more, in the manner of `backup-status.ts`: a surface that
 * overstates its confidence is worse than one that admits the gap.
 */
export function mailerStatus(): MailerStatus {
  const result = readMailerConfig(process.env);
  if (!result.ok) return { configured: false, problem: result.problem };

  return {
    configured: true,
    provider: result.config.provider,
    from: result.config.fromName
      ? `${result.config.fromName} <${result.config.fromAddress}>`
      : result.config.fromAddress,
    replyTo: result.config.replyTo,
  };
}
