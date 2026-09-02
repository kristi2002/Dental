import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { revokedAt, wasRevoked } from '../src/lib/auth/token';

/**
 * Whether signing out actually ends the session.
 *
 * Deleting the cookie was the whole of it, and a cookie cannot win a race: the
 * router prefetches every screen in the rail, each response carrying
 * `Set-Cookie: dent_session=<refreshed>` from the proxy, and any of those still
 * in flight when the delete lands puts it straight back. Measured at roughly one
 * sign-out in three. `e2e/auth.spec.ts` had been reporting it as an
 * intermittent failure and was right every time.
 *
 * The end-to-end test proves the behaviour; these prove the *rule*, which is
 * where the mistake actually lived. The first version of this fix compared
 * against the sign-out second rounded **down**, and that still let a token
 * through whenever the sign-in and the sign-out shared a second — which in a
 * fast browser is often, and left the bug reproducing at about one run in six
 * with the fix apparently in place.
 *
 * Seconds are the unit throughout because `iat` is: `signSession` writes
 * `Math.floor(Date.now() / 1000)`, so a token's stamp cannot say where inside
 * its second it was issued. Every case below is about that ambiguity.
 */

/** `iat` as `signSession` writes it, from a wall-clock moment. */
const iatOf = (when: Date) => Math.floor(when.getTime() / 1000);

const at = (iso: string) => new Date(iso);

describe('revokedAt — the moment a sign-out is recorded at', () => {
  it('rounds up to the next whole second', () => {
    assert.equal(
      revokedAt(at('2026-09-02T12:19:56.345Z')).toISOString(),
      '2026-09-02T12:19:57.000Z',
      'a sign-out part-way through a second must outrank every token stamped with it',
    );
  });

  it('leaves an exact second alone rather than adding a spurious one', () => {
    assert.equal(
      revokedAt(at('2026-09-02T12:19:56.000Z')).toISOString(),
      '2026-09-02T12:19:56.000Z',
    );
  });
});

describe('wasRevoked — which tokens a sign-out kills', () => {
  it('lets everything through for somebody who has never signed out', () => {
    assert.equal(wasRevoked({ iat: iatOf(at('2026-09-02T12:19:56.000Z')) }, null), false);
    assert.equal(wasRevoked({ iat: 0 }, undefined), false);
  });

  it('kills a token issued before the sign-out', () => {
    const signedOut = revokedAt(at('2026-09-02T12:19:56.345Z'));
    const token = { iat: iatOf(at('2026-09-02T12:19:50.000Z')) };
    assert.equal(wasRevoked(token, signedOut), true);
  });

  it('kills a token issued in the same second as the sign-out', () => {
    // The case the first attempt at this fix got wrong, and the reason the bug
    // survived it. Signing in and signing out are about a second apart in the
    // browser test, so this is not an edge — it is most of the failures.
    const signedOut = revokedAt(at('2026-09-02T12:19:56.800Z'));
    const token = { iat: iatOf(at('2026-09-02T12:19:56.100Z')) };

    assert.equal(
      wasRevoked(token, signedOut),
      true,
      'a token stamped with the sign-out second could have been issued before it — assume it was',
    );
  });

  it('lets a fresh sign-in through, in the second after the sign-out', () => {
    // The cost of rounding up, and the assertion that bounds it: the refusal
    // above must not outlive the second it belongs to, or signing back in would
    // be impossible rather than merely delayed.
    const signedOut = revokedAt(at('2026-09-02T12:19:56.800Z'));
    const token = { iat: iatOf(at('2026-09-02T12:19:57.200Z')) };

    assert.equal(wasRevoked(token, signedOut), false);
  });

  it('stays dead however often the cookie is handed back', () => {
    // `refreshSession` copies `iat` across verbatim, which is what makes this
    // hold: a cookie resurrected by a late prefetch still carries the moment it
    // was *issued*, so re-issuing it a hundred times never makes it live again.
    const signedOut = revokedAt(at('2026-09-02T12:19:56.345Z'));
    const issued = { iat: iatOf(at('2026-09-02T12:19:50.000Z')) };

    for (let refresh = 0; refresh < 100; refresh += 1) {
      assert.equal(wasRevoked({ iat: issued.iat }, signedOut), true);
    }
  });

  it('does not revoke a session issued after a previous sign-out', () => {
    // The column is never cleared, so yesterday's sign-out must not touch
    // today's session.
    const signedOutYesterday = revokedAt(at('2026-09-01T18:00:00.000Z'));
    const today = { iat: iatOf(at('2026-09-02T08:30:00.000Z')) };

    assert.equal(wasRevoked(today, signedOutYesterday), false);
  });
});
