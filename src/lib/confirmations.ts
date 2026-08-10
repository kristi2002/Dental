/**
 * Self-confirmation links: the patient taps a link in their reminder and tells
 * the clinic whether they are coming, without an account or a password.
 *
 * The token is an HMAC of the appointment id rather than a stored secret, so
 * there is no table to leak and no cleanup to forget. It grants exactly two
 * actions on exactly one appointment — confirm or decline — and the page behind
 * it shows a first name and a time, never a medical record.
 */

const encoder = new TextEncoder();

/** Distinct from the session key, so one purpose can never sign for the other. */
const PURPOSE = 'appointment-confirmation:v1';

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 16) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET is missing or too short — confirmation links cannot be signed.');
  }
  return 'dev-only-insecure-secret-change-me';
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(appointmentId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${PURPOSE}:${appointmentId}`),
  );

  // Half the digest is 128 bits — unguessable, and short enough that the link
  // still looks sane in a WhatsApp message.
  return base64Url(new Uint8Array(signature).slice(0, 16));
}

/**
 * Separator between the id and its signature.
 *
 * A tilde, not a dot: a dot in a path segment makes the URL look like a static
 * file to routing middleware — including next-intl's own matcher, which skips
 * anything matching `.*\..*` — and this link has to survive being pasted into
 * WhatsApp and opened cold. `~` is unreserved in RFC 3986 and absent from the
 * base64url alphabet, so it can never appear inside either half.
 */
const SEPARATOR = '~';

/** `<appointmentId>~<mac>` — the whole path segment the patient receives. */
export async function confirmationToken(appointmentId: string): Promise<string> {
  return `${appointmentId}${SEPARATOR}${await sign(appointmentId)}`;
}

/** Returns the appointment id only when the signature matches. */
export async function verifyConfirmationToken(token: string): Promise<string | null> {
  const separator = token.lastIndexOf(SEPARATOR);
  if (separator <= 0) return null;

  const appointmentId = token.slice(0, separator);
  const provided = token.slice(separator + 1);
  const expected = await sign(appointmentId);

  // Compared as fixed-length base64url strings, byte by byte, so a near miss
  // takes the same time as a wild guess.
  if (provided.length !== expected.length) return null;
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) {
    difference |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }

  return difference === 0 ? appointmentId : null;
}

/**
 * The absolute link to put in a message. Falls back to localhost in development;
 * set `NEXT_PUBLIC_APP_URL` so the patient receives a link that actually resolves.
 */
export function confirmationUrl(locale: string, token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/${locale}/confirm/${token}`;
}
