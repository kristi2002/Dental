import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isIdle,
  refreshSession,
  SESSION_IDLE_SECONDS,
  SESSION_MAX_AGE_SECONDS,
  signSession,
  verifySession,
} from '../src/lib/auth/token';

/**
 * The session token, and the two claims that make it revocable.
 *
 * Both were added to close the same hole from opposite ends. The cookie is an
 * HMAC with no stored row, which is what made it cheap — and also meant signing
 * out deleted a cookie while the token it carried stayed good for the rest of
 * its twelve hours, and the "15-minute idle lock" was enforced by the browser's
 * `maxAge` rather than by anything the server checked.
 *
 * These are the pure halves of that fix. The database comparison itself lives in
 * `getCurrentUser`; what is testable without a database is that the claims are
 * carried, survive a refresh, and mean what the check expects.
 */

const USER = 'staff-1';

describe('signSession', () => {
  it('carries the epoch it was minted with', async () => {
    const payload = await verifySession(await signSession(USER, 7));
    assert.equal(payload?.sub, USER);
    assert.equal(payload?.epoch, 7);
  });

  it('stamps `seen` so the idle window starts now', async () => {
    const payload = await verifySession(await signSession(USER, 0));
    const now = Math.floor(Date.now() / 1000);
    assert.ok(payload?.seen !== undefined);
    assert.ok(Math.abs(payload.seen - now) <= 2, 'seen should be roughly now');
  });

  it('expires at the absolute cap', async () => {
    const payload = await verifySession(await signSession(USER, 0));
    const now = Math.floor(Date.now() / 1000);
    assert.ok(Math.abs(payload!.exp - (now + SESSION_MAX_AGE_SECONDS)) <= 2);
  });
});

describe('refreshSession', () => {
  it('moves `seen` forward', async () => {
    const old = {
      sub: USER,
      iat: 1000,
      exp: 9_000_000_000,
      epoch: 3,
      seen: Math.floor(Date.now() / 1000) - 300,
    };
    const payload = await verifySession(await refreshSession(old));
    assert.ok(payload!.seen! > old.seen, 'activity should reset the idle window');
  });

  it('does not move the absolute expiry', async () => {
    // The 12-hour cap must not become unbounded for anybody who keeps clicking.
    // A fixed future `exp` — far enough out that `verifySession` does not
    // reject it as expired, which is what makes this a test of the refresh.
    const old = { sub: USER, iat: 1000, exp: 9_000_000_000, epoch: 3, seen: 1000 };
    const payload = await verifySession(await refreshSession(old));
    assert.equal(payload!.exp, old.exp);
    assert.equal(payload!.iat, old.iat);
  });

  it('carries the epoch across unchanged', async () => {
    // A refresh must never re-stamp the epoch from the database — that would
    // hand a revoked session a fresh licence on its next navigation, which is
    // the exact bug this column exists to prevent.
    const old = { sub: USER, iat: 1000, exp: 9_000_000_000, epoch: 3, seen: 1000 };
    const payload = await verifySession(await refreshSession(old));
    assert.equal(payload!.epoch, 3);
  });
});

describe('isIdle', () => {
  const now = new Date('2026-08-21T12:00:00Z');
  const nowSeconds = Math.floor(now.getTime() / 1000);

  it('is false for a session seen just now', () => {
    assert.equal(isIdle({ sub: USER, iat: 0, exp: 9e9, seen: nowSeconds }, now), false);
  });

  it('is false right up to the window', () => {
    const seen = nowSeconds - SESSION_IDLE_SECONDS;
    assert.equal(isIdle({ sub: USER, iat: 0, exp: 9e9, seen }, now), false);
  });

  it('is true one second past it', () => {
    const seen = nowSeconds - SESSION_IDLE_SECONDS - 1;
    assert.equal(isIdle({ sub: USER, iat: 0, exp: 9e9, seen }, now), true);
  });

  it('tolerates a token minted before `seen` existed', () => {
    // Otherwise the deploy that introduced this would sign out the whole
    // practice mid-morning. Those tokens carry their own 12-hour cap and age
    // out on their own.
    assert.equal(isIdle({ sub: USER, iat: 0, exp: 9e9 }, now), false);
  });
});

describe('verifySession', () => {
  it('rejects a tampered payload', async () => {
    const token = await signSession(USER, 0);
    const [body, signature] = token.split('.');
    const forged = `${body}x.${signature}`;
    assert.equal(await verifySession(forged), null);
  });

  it('rejects an expired token', async () => {
    // Built by hand rather than minted, since signSession always looks forward.
    const expired = await refreshSession({ sub: USER, iat: 0, exp: 1, epoch: 0, seen: 0 });
    assert.equal(await verifySession(expired), null);
  });

  it('rejects nothing at all', async () => {
    assert.equal(await verifySession(undefined), null);
    assert.equal(await verifySession(''), null);
  });
});
