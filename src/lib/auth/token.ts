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

/**
 * The outer bound on a session, refreshed by nothing. A shift, not a month: the
 * tablet at reception is shared, and a token that outlives the day is a token
 * somebody else uses.
 */
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

/**
 * How long a session survives without the person doing anything.
 *
 * This is the number that actually protects the record. The absolute bound above
 * only helps at the end of the day; the realistic exposure is the receptionist
 * who walks to the door with a chart open on a screen the waiting room can see.
 * The cookie is written with this as its `maxAge` and re-issued on every
 * navigation, so the browser drops it on its own once nobody is there — which
 * makes the timeout enforced by expiry rather than by anything the page does.
 */
export const SESSION_IDLE_SECONDS = readIdleMinutes() * 60;

/**
 * Minutes, or the default — never `NaN`.
 *
 * This was a bare `Number(...)`, and the value is written straight into the
 * cookie's `maxAge`. `SESSION_IDLE_MINUTES=15m` — the form every other duration
 * in the deployment takes — parsed to `NaN`, and a `NaN` `maxAge` makes the
 * browser drop the cookie the moment the tab closes, so the practice would
 * simply find that staying signed in had stopped working, with nothing
 * anywhere saying why.
 */
function readIdleMinutes(): number {
  const raw = process.env.SESSION_IDLE_MINUTES;
  if (raw === undefined || raw.trim() === '') return 15;

  const minutes = Number(raw);
  if (Number.isFinite(minutes) && minutes >= 1) return minutes;

  console.warn(
    `[auth] SESSION_IDLE_MINUTES=${JSON.stringify(raw)} is not a number of minutes — using 15.`,
  );
  return 15;
}

export const SESSION_COOKIE = 'dent_session';

/**
 * One definition of the cookie, used by every place that writes it: sign-in,
 * the idle refresh in the proxy, and the heartbeat route. `maxAge` is the idle
 * window, which is what makes walking away expire the session.
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_IDLE_SECONDS,
} as const;

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

async function sign(payload: SessionPayload): Promise<string> {
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await importKey(), encoder.encode(body));

  return `${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function signSession(userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: userId, iat: now, exp: now + SESSION_MAX_AGE_SECONDS });
}

/**
 * Re-sign an existing session without moving its expiry.
 *
 * The idle window lives in the cookie's `maxAge`, so keeping someone signed in
 * means handing the browser the same token again with a fresh `maxAge`. The
 * payload is copied verbatim on purpose: `exp` is the absolute bound, and a
 * refresh that extended it would turn a 12-hour cap into an unbounded one for
 * anyone who keeps clicking.
 */
export async function refreshSession(payload: SessionPayload): Promise<string> {
  return sign({ sub: payload.sub, iat: payload.iat, exp: payload.exp });
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
