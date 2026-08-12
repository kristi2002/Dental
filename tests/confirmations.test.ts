import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { confirmationToken, verifyConfirmationToken } from '../src/lib/confirmations';

/**
 * The one unauthenticated write path in the app. Its entire authority is this
 * signature, so every way it could wrongly say yes is worth a line here.
 */
describe('confirmation tokens', () => {
  const id = '8f0a1b2c-3d4e-5f60-7182-93a4b5c6d7e8';

  it('round-trips', async () => {
    assert.equal(await verifyConfirmationToken(await confirmationToken(id)), id);
  });

  it('is stable for the same id', async () => {
    assert.equal(await confirmationToken(id), await confirmationToken(id));
  });

  it('differs between appointments', async () => {
    const other = await confirmationToken('11111111-2222-3333-4444-555555555555');
    assert.notEqual(await confirmationToken(id), other);
  });

  it('uses ~ rather than . as the separator', async () => {
    // A dot makes the path segment look like a static file to next-intl's
    // middleware matcher, and the link has to survive being pasted cold.
    const token = await confirmationToken(id);
    assert.ok(token.includes('~'));
    assert.ok(!token.includes('.'));
  });

  it('rejects a tampered signature', async () => {
    const token = await confirmationToken(id);
    const flipped = token.slice(0, -1) + (token.at(-1) === 'A' ? 'B' : 'A');
    assert.equal(await verifyConfirmationToken(flipped), null);
  });

  it('rejects a signature of a different appointment', async () => {
    const mine = await confirmationToken(id);
    const theirs = await confirmationToken('11111111-2222-3333-4444-555555555555');
    const forged = `${id}~${theirs.split('~')[1]}`;
    assert.notEqual(mine, forged);
    assert.equal(await verifyConfirmationToken(forged), null);
  });

  it('rejects a truncated signature', async () => {
    const token = await confirmationToken(id);
    assert.equal(await verifyConfirmationToken(token.slice(0, -2)), null);
  });

  it('rejects a padded signature', async () => {
    assert.equal(await verifyConfirmationToken(`${await confirmationToken(id)}A`), null);
  });

  it('rejects a token with no signature at all', async () => {
    assert.equal(await verifyConfirmationToken(id), null);
    assert.equal(await verifyConfirmationToken(`${id}~`), null);
  });

  it('rejects an empty or separator-only token', async () => {
    assert.equal(await verifyConfirmationToken(''), null);
    assert.equal(await verifyConfirmationToken('~'), null);
    assert.equal(await verifyConfirmationToken('~abc'), null);
  });

  it('splits on the LAST separator, so an id containing one still verifies', async () => {
    const odd = 'weird~id';
    assert.equal(await verifyConfirmationToken(await confirmationToken(odd)), odd);
  });
});
