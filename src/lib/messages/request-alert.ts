import type { OutgoingMail } from './email';

/**
 * Telling the practice that a stranger has asked to be seen.
 *
 * Everything else this application does about messaging is "nudge, don't send":
 * it composes, a person reads it, a person presses the button. This is the one
 * message the app sends on its own, and the reason is the one queue where
 * nobody has any relationship with the practice yet.
 *
 * Until this existed, a request off the public page produced exactly one signal
 * — a number beside **Requests** in the navigation rail, which is visible only
 * to somebody already signed in. A request left at six on a Friday was therefore
 * first seen on Monday morning, and `nav-destinations.ts` makes the argument
 * against that better than this file can: it is the only list here where "a day
 * of silence does not read as a delay, it reads as being ignored".
 *
 * **It is a notification and not a copy of the record.** The body carries what
 * the desk needs in order to decide whether this is worth interrupting the
 * morning for — who, what about, and how urgent it sounds — and then a link.
 * The medical detail, whatever the visitor chose to write and whatever they
 * attached, stays behind the sign-in where it belongs; an X-ray does not go out
 * over email to a mailbox that may be read on a phone on a bus.
 *
 * Plain text, for the reason `mailRequest` gives: nothing here would be improved
 * by markup, and a body assembled by concatenation from a stranger's typing is
 * exactly the wrong place to introduce any.
 */

/** What the desk is told, before any of it has been turned into a sentence. */
export type RequestAlert = {
  name: string;
  phone: string;
  email: string | null;
  /** Already translated — the desk reads its own language, not the visitor's. */
  topicLabel: string | null;
  /** Already formatted, e.g. `Friday 4 September, morning`. */
  preferredLabel: string | null;
  /** How many files came with it. The files themselves deliberately do not. */
  attachments: number;
};

/**
 * The words around the facts, resolved by the caller.
 *
 * Passed in rather than looked up here so this stays a pure function with a test
 * around it, and so the lookup happens while the request is still being served —
 * this is composed before `after` and sent inside it, and a translator reached
 * for on the far side of a response is a needless thing to depend on.
 */
export type RequestAlertLabels = {
  /** `New booking request — {name}` */
  subject: string;
  intro: string;
  phone: string;
  email: string;
  topic: string;
  preferred: string;
  attachments: string;
  openIt: string;
};

/**
 * One line per fact the visitor actually gave, and nothing for the ones they
 * did not — a body padded with `Email: —` is three lines longer and no more
 * informative, and this is read on a telephone.
 */
export function requestAlertMail(
  to: string,
  toName: string,
  alert: RequestAlert,
  labels: RequestAlertLabels,
  /** Where the desk opens it. Absent when `NEXT_PUBLIC_APP_URL` is unset. */
  requestsUrl: string | null,
): OutgoingMail {
  const lines = [
    labels.intro,
    '',
    alert.name,
    `${labels.phone}: ${alert.phone}`,
  ];

  if (alert.email) lines.push(`${labels.email}: ${alert.email}`);
  if (alert.topicLabel) lines.push(`${labels.topic}: ${alert.topicLabel}`);
  if (alert.preferredLabel) lines.push(`${labels.preferred}: ${alert.preferredLabel}`);
  if (alert.attachments > 0) lines.push(`${labels.attachments}: ${alert.attachments}`);

  if (requestsUrl) {
    lines.push('', `${labels.openIt}: ${requestsUrl}`);
  }

  return {
    to,
    toName,
    subject: labels.subject,
    text: lines.join('\n'),
  };
}

/**
 * Where the alert is sent, out of the two addresses a deployment may have set.
 *
 * The practice's own address first — it is what somebody filled in on the
 * settings screen and therefore what they expect the practice's mail to reach.
 * `MAIL_REPLY_TO` behind it, because a deployment that has configured sending at
 * all has configured that one, and an alert reaching the address replies already
 * go to is far better than no alert.
 *
 * Null is a perfectly ordinary answer and not an error: a practice that has not
 * set up mail still gets the count in the rail, exactly as before.
 */
export function alertRecipient(
  clinicEmail: string | null,
  replyTo: string | undefined,
): string | null {
  const clinic = clinicEmail?.trim();
  if (clinic) return clinic;

  const fallback = replyTo?.trim();
  return fallback || null;
}
