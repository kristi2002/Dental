/**
 * Signed session token — a tiny JSON payload plus an HMAC, no dependency and no
 * server-side session table to keep tidy.
 *
 * Deliberately built on Web Crypto rather than `node:crypto` so the same code
 * verifies a cookie in the request proxy (edge runtime) and in a server action.
 */

const encoder = new TextEncoder();

export type SessionPayload = {
  /** StaffUser id. Role is *not* carried here — see `loadSessionUser`. */
  sub: string;
  /** Seconds since epoch. */
  iat: number;
  exp: number;
};

/** A shift, not a month: the tablet at reception is shared. */
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

export const SESSION_COOKIE = 'dent_session';

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 16) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'AUTH_SECRET is missing or shorter than 16 characters. Set it in .env before deploying.',
    );
  }
  // Development convenience only. Restarting invalidates every session, which is
  // the right trade for never shipping a hardcoded secret to production.
  return 'dev-only-insecure-secret-change-me';
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function importKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signSession(userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: userId,
    iat: now,
    exp: now + SESSION_MAX_AGE_SECONDS,
  };

  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await importKey(), encoder.encode(body));

  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/** Returns the payload only when the signature checks out and it has not expired. */
export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;

  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;

  const body = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  let valid: boolean;
  try {
    // `crypto.subtle.verify` is constant-time, so a wrong signature leaks nothing.
    valid = await crypto.subtle.verify(
      'HMAC',
      await importKey(),
      base64UrlDecode(signature),
      encoder.encode(body),
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body)));
  } catch {
    return null;
  }

  if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

  return payload;
}
