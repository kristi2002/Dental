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
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

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
export const SESSION_IDLE_SECONDS = Number(process.env.SESSION_IDLE_MINUTES ?? 15) * 60;

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

/**
 * The moment to record as "everything issued before this is no longer signed
 * in".
 *
 * **Rounded up to the next whole second, and that rounding is the whole point.**
 * `iat` is written in whole seconds, so a sign-out at 12:19:56.345 has to decide
 * what to do about a token stamped `12:19:56` — it could have been issued a
 * third of a second before the sign-out or a third of a second after, and the
 * token cannot say which.
 *
 * Rounding *down* answers "let it live", which is the wrong way for a guess
 * about a session to fail. It is also not hypothetical: signing in and signing
 * out land about a second apart in `e2e/auth.spec.ts`, so they shared a second
 * often enough to leave the original bug still reproducing at roughly one run
 * in six with the revocation check already in place.
 *
 * Rounding up answers "kill it", and costs at most this: somebody who signs
 * back in during the same second as their own sign-out is refused and types
 * their PIN again. Choosing a name and entering a PIN takes longer than that, so
 * no person can reach the window — and a spare login prompt is a far smaller
 * harm than a session that outlives the button that ended it.
 */
export function revokedAt(now: Date = new Date()): Date {
  return new Date(Math.ceil(now.getTime() / 1000) * 1000);
}

/**
 * Whether this token predates the owner's last sign-out.
 *
 * Split out from `getCurrentUser` so the rule can be tested without a database
 * or a cookie jar — it is three lines and one of them decides whether signing
 * out works.
 */
export function wasRevoked(
  payload: Pick<SessionPayload, 'iat'>,
  revoked: Date | null | undefined,
): boolean {
  if (!revoked) return false;
  return payload.iat < revoked.getTime() / 1000;
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
