import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { confirmationToken, verifyConfirmationToken } from '../src/lib/confirmations';
import { optOutToken, optOutUrl, verifyOptOutToken } from '../src/lib/opt-out';
import { verifySignedToken } from '../src/lib/signed-links';

/**
 * The second link a patient can open without an account, and the first one that
 * lets them change something about themselves.
 *
 * Two things are being protected here. One is the ordinary signature property —
 * a tampered token must not verify. The other is the property that only exists
 * because there are now *two* kinds of link: a token that says "yes, I am
 * coming" must never also say "never write to me again". They carry different
 * ids under different purposes, and the purpose string is the whole of what
 * keeps them apart.
 */

const PATIENT = '8f0a1b2c-3d4e-5f60-7182-93a4b5c6d7e8';

describe('opt-out tokens', () => {
  it('round-trips', async () => {
    assert.equal(await verifyOptOutToken(await optOutToken(PATIENT)), PATIENT);
  });

  it('is stable, so the same link keeps working in an old email', async () => {
    assert.equal(await optOutToken(PATIENT), await optOutToken(PATIENT));
  });

  it('differs between patients', async () => {
    const other = await optOutToken('11111111-2222-3333-4444-555555555555');
    assert.notEqual(await optOutToken(PATIENT), other);
  });

  it('rejects a tampered signature', async () => {
    const token = await optOutToken(PATIENT);
    const flipped = token.slice(0, -1) + (token.at(-1) === 'A' ? 'B' : 'A');
    assert.equal(await verifyOptOutToken(flipped), null);
  });

  it('rejects rubbish rather than throwing at it', async () => {
    for (const token of ['', '~', 'no-separator', '~onlyamac', `${PATIENT}~`]) {
      assert.equal(await verifyOptOutToken(token), null, token);
    }
  });

  it('builds a link the patient can actually open', async () => {
    const url = optOutUrl('sq', await optOutToken(PATIENT));
    assert.match(url, /\/sq\/unsubscribe\/[^/]+$/);
    // A dot would make next-intl's matcher treat the path as a static file.
    assert.ok(!url.split('/unsubscribe/')[1]?.includes('.'));
  });
});

describe('one purpose can never sign for another', () => {
  /**
   * The same id, signed twice. If the purpose were not part of the message,
   * these would be the same string — and a patient tapping "yes, I am coming"
   * in one message would be handing over a token that opts them out in another.
   */
  it('gives a different token to the same id under a different purpose', async () => {
    assert.notEqual(await optOutToken(PATIENT), await confirmationToken(PATIENT));
  });

  it('will not verify a confirmation token as an opt-out, or the reverse', async () => {
    assert.equal(await verifyOptOutToken(await confirmationToken(PATIENT)), null);
    assert.equal(await verifyConfirmationToken(await optOutToken(PATIENT)), null);
  });

  it('will not verify under a purpose nobody issued', async () => {
    assert.equal(await verifySignedToken('made-up:v1', await optOutToken(PATIENT)), null);
  });
});

/**
 * What is signed, pinned to a literal.
 *
 * The signing moved out of `confirmations.ts` into `signed-links.ts` when the
 * opt-out needed it, and every confirmation link this practice has ever sent is
 * sitting in somebody's WhatsApp history. A refactor that changed the message
 * by one byte would invalidate all of them silently — nobody would report it,
 * because a patient whose link says "this is not valid" rings the desk and the
 * desk books them by hand.
 *
 * So this recomputes the digest from the outside, the way the old code did it:
 * HMAC-SHA256 over `<purpose>:<id>`, truncated to the first sixteen bytes,
 * base64url, no padding.
 */
describe('the signature itself', () => {
  const secret = process.env.AUTH_SECRET ?? 'dev-only-insecure-secret-change-me';

  const expected = (purpose: string, id: string) =>
    createHmac('sha256', secret)
      .update(`${purpose}:${id}`)
      .digest()
      .subarray(0, 16)
      .toString('base64url');

  it('is unchanged for a confirmation link', async () => {
    const token = await confirmationToken(PATIENT);
    assert.equal(token, `${PATIENT}~${expected('appointment-confirmation:v1', PATIENT)}`);
  });

  it('is the same construction for the opt-out link', async () => {
    const token = await optOutToken(PATIENT);
    assert.equal(token, `${PATIENT}~${expected('contact-opt-out:v1', PATIENT)}`);
  });
});
