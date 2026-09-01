/**
 * Links a patient can open without an account, and the signature that is their
 * only authority.
 *
 * Lifted out of `confirmations.ts` unchanged when a second link needed the same
 * machinery — the one-click opt-out that every courtesy message now carries.
 * The alternative was a second copy of the signing, the truncation, the
 * separator and the constant-time comparison, which is four decisions to get
 * subtly different in two files.
 *
 * **The message being signed is `<purpose>:<id>`, byte for byte what
 * `confirmations.ts` signed before this file existed.** That is not tidiness:
 * confirmation links are sitting in patients' WhatsApp histories, and a
 * refactor that changed the scheme would silently invalidate every one of them.
 *
 * A purpose per link, and never a shared one. It is what stops a token issued
 * to say "yes, I am coming" from also saying "never write to me again" — the
 * two are the same id under a different string, and only the string keeps them
 * apart.
 */

const encoder = new TextEncoder();

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 16) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET is missing or too short — patient links cannot be signed.');
  }
  return 'dev-only-insecure-secret-change-me';
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(purpose: string, id: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${purpose}:${id}`));

  // Half the digest is 128 bits — unguessable, and short enough that the link
  // still looks sane in a WhatsApp message.
  return base64Url(new Uint8Array(signature).slice(0, 16));
}

/**
 * Separator between the id and its signature.
 *
 * A tilde, not a dot: a dot in a path segment makes the URL look like a static
 * file to routing middleware — including next-intl's own matcher, which skips
 * anything matching `.*\..*` — and these links have to survive being pasted
 * into WhatsApp and opened cold. `~` is unreserved in RFC 3986 and absent from
 * the base64url alphabet, so it can never appear inside either half.
 */
const SEPARATOR = '~';

/** `<id>~<mac>` — the whole path segment the patient receives. */
export async function signedToken(purpose: string, id: string): Promise<string> {
  return `${id}${SEPARATOR}${await sign(purpose, id)}`;
}

/** Returns the id only when the signature matches this purpose. */
export async function verifySignedToken(purpose: string, token: string): Promise<string | null> {
  const separator = token.lastIndexOf(SEPARATOR);
  if (separator <= 0) return null;

  const id = token.slice(0, separator);
  const provided = token.slice(separator + 1);
  const expected = await sign(purpose, id);

  // Compared as fixed-length base64url strings, byte by byte, so a near miss
  // takes the same time as a wild guess.
  if (provided.length !== expected.length) return null;
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) {
    difference |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }

  return difference === 0 ? id : null;
}

/**
 * The absolute link to put in a message. Falls back to localhost in
 * development; set `NEXT_PUBLIC_APP_URL` so the patient receives a link that
 * actually resolves.
 */
export function patientLinkUrl(locale: string, path: string, token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}/${locale}/${path}/${token}`;
}
