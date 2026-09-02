/**
 * What the provider says happened *after* it accepted the message.
 *
 * Everything else in this folder is about getting a message out of the door.
 * This is the door answering back, and until it existed the app's idea of
 * "sent" was a claim about the provider rather than about the patient: a 200
 * from Brevo means the message was queued, and an address that died two years
 * ago is queued exactly as cheerfully as one somebody reads. Every send
 * reported success, the `Contact` log filled up, and the practice believed a
 * patient had been told.
 *
 * Pure, and provider-agnostic by *shape* rather than by configuration. The two
 * payloads are told apart by what they contain — Brevo names its field `event`,
 * Resend names its `type` and prefixes every value with `email.` — because the
 * alternative is reading `MAIL_PROVIDER` and being wrong exactly when it
 * matters: a practice that has just switched providers is a practice whose old
 * provider is still posting events about mail it sent yesterday.
 *
 * Nothing here touches the database. `delivery.ts` does that, with this
 * module's output, so `tests/events.test.ts` can put a hostile payload in and
 * read a decision out.
 */

/**
 * What the far side did with the message, in the six answers worth keeping.
 *
 * `delivered` is included even though nothing writes it down, because it is the
 * event a provider sends most of and a parser that silently dropped it would
 * look identical to one that was broken.
 */
export type DeliveryOutcome =
  | 'delivered'
  | 'hard'
  | 'soft'
  | 'blocked'
  | 'spam'
  | 'unsubscribed';

export type DeliveryEvent = {
  outcome: DeliveryOutcome;
  /** Lower-cased, because a bounce for `Ana@` is a bounce for `ana@`. */
  address: string;
  /** What the provider called the message, when it says. For the log only. */
  messageId: string | null;
};

/**
 * The outcomes that mean the address itself is unusable.
 *
 * `spam` is in here and it is the interesting one: a complaint is a fact about
 * the *patient's opinion* rather than about the mailbox, and it is treated as
 * both — the address stops being used and consent is closed, because somebody
 * who pressed "this is junk" has said something much clearer than any form ever
 * asked them.
 */
const BOUNCE_KINDS = {
  hard: 'HARD',
  soft: 'SOFT',
  blocked: 'BLOCKED',
  spam: 'SPAM',
} as const;

export type BounceKind = (typeof BOUNCE_KINDS)[keyof typeof BOUNCE_KINDS];

export function bounceKindFor(outcome: DeliveryOutcome): BounceKind | null {
  return outcome in BOUNCE_KINDS ? BOUNCE_KINDS[outcome as keyof typeof BOUNCE_KINDS] : null;
}

/**
 * Whether this outcome is the patient saying no.
 *
 * Two events mean it — an unsubscribe and a spam complaint — and both close
 * `contactConsent`. Nothing else here touches consent: a full mailbox is not a
 * refusal, and treating it as one would quietly opt out patients who never said
 * anything at all.
 */
export function closesConsent(outcome: DeliveryOutcome): boolean {
  return outcome === 'unsubscribed' || outcome === 'spam';
}

/** Brevo's transactional event names, mapped onto the six. */
const BREVO: Record<string, DeliveryOutcome> = {
  delivered: 'delivered',
  hard_bounce: 'hard',
  invalid_email: 'hard',
  soft_bounce: 'soft',
  blocked: 'blocked',
  // Brevo's word for "the far side refused this outright". Not a bounce from a
  // mailbox — usually the practice's own domain being rejected — so it lands
  // with `blocked` rather than pretending to know the address is wrong.
  error: 'blocked',
  spam: 'spam',
  complaint: 'spam',
  unsubscribed: 'unsubscribed',
};

/**
 * The events deliberately absent from both tables: `request`, `deferred`,
 * `opened`, `click`, `proxy_open`. The first two are the message still being in
 * flight, and the last three are surveillance of a patient reading their own
 * post, which this practice has no business recording.
 */
const RESEND: Record<string, DeliveryOutcome> = {
  'email.delivered': 'delivered',
  'email.complained': 'spam',
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Resend describes a bounce in a nested object rather than in the event name,
 * so the severity has to be read out of it. `Permanent` is the address being
 * wrong; `Transient` is the mailbox being full. `Suppressed` is Resend refusing
 * to try because the address bounced for somebody else — a fact about the
 * address, so it lands with `blocked`.
 */
function resendBounce(data: Record<string, unknown> | null): DeliveryOutcome {
  const bounce = asRecord(data?.bounce);
  const type = asString(bounce?.type).toLowerCase();
  const subType = asString(bounce?.subType).toLowerCase();

  if (subType === 'suppressed') return 'blocked';
  if (type === 'permanent') return 'hard';
  // `Transient` and `Undetermined` alike. Reading "permanent" into an
  // undetermined bounce would retire a working address after one bad night.
  return 'soft';
}

/** The first recipient, out of the several shapes a payload may name one in. */
function recipientOf(record: Record<string, unknown>): string {
  const direct = asString(record.email) || asString(record.recipient);
  if (direct) return direct;

  const to = record.to;
  if (Array.isArray(to)) {
    for (const entry of to) {
      const address = asString(entry) || asString(asRecord(entry)?.email);
      if (address) return address;
    }
  }
  return asString(to);
}

function readOne(payload: unknown): DeliveryEvent | null {
  const record = asRecord(payload);
  if (!record) return null;

  const data = asRecord(record.data);

  // Resend first: its envelope is unambiguous, and a payload carrying both
  // fields is a provider we do not know rather than one we half-know.
  const type = asString(record.type).toLowerCase();
  if (type.startsWith('email.')) {
    const outcome = type === 'email.bounced' ? resendBounce(data) : RESEND[type];
    if (!outcome) return null;

    const address = recipientOf(data ?? {});
    if (!address) return null;

    return {
      outcome,
      address: address.toLowerCase(),
      messageId: asString(data?.email_id) || null,
    };
  }

  const outcome = BREVO[asString(record.event).toLowerCase()];
  if (!outcome) return null;

  const address = recipientOf(record);
  if (!address) return null;

  return {
    outcome,
    address: address.toLowerCase(),
    // Brevo spells it with a hyphen in the event payload and without one in the
    // send response. Both are read, because the two have to match up.
    messageId: asString(record['message-id']) || asString(record.messageId) || null,
  };
}

/**
 * Every event in one delivery, in the order the provider listed them.
 *
 * An array is accepted as well as a single object because providers batch when
 * they fall behind, and a webhook that quietly handled only the first event of
 * a catch-up batch would lose exactly the bounces that arrived during an outage.
 */
export function readDeliveryEvents(payload: unknown): DeliveryEvent[] {
  const record = asRecord(payload);
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(record?.events)
      ? (record.events as unknown[])
      : [payload];

  const out: DeliveryEvent[] = [];
  for (const item of items) {
    const event = readOne(item);
    if (event) out.push(event);
  }
  return out;
}
