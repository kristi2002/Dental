import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calendarToken, verifyCalendarToken } from '../src/lib/calendar-feed';

/**
 * A calendar subscription URL is the one credential in this app that leaves the
 * building and stays out: it carries no session, it is pasted into a phone, and
 * it lives there for years. Its whole authority is the signature, and its whole
 * revocability is the version signed into it — so both are worth a line here.
 *
 * The version is checked against `StaffUser.calendarFeedVersion` by the route,
 * which has to read the staff row anyway. What these cover is the half that
 * happens before the database is reached: what a token claims, and what it takes
 * to make it claim something else.
 */
describe('calendar feed tokens', () => {
  const id = '8f0a1b2c-3d4e-5f60-7182-93a4b5c6d7e8';

  it('round-trips the id and the version it was issued at', async () => {
    const claim = await verifyCalendarToken(await calendarToken(id, 3));
    assert.deepEqual(claim, { staffUserId: id, version: 3 });
  });

  it('is stable, so the settings page shows one unchanging link', async () => {
    assert.equal(await calendarToken(id, 1), await calendarToken(id, 1));
  });

  it('issues a different token at every version', async () => {
    assert.notEqual(await calendarToken(id, 1), await calendarToken(id, 2));
  });

  /**
   * The point of the whole change. Regenerating bumps the stored version; the
   * link on the lost phone still verifies as *its own* version and the route
   * then refuses it, rather than every link in the practice dying together with
   * a rotated `AUTH_SECRET`.
   */
  it('reports the old version rather than silently passing as the new one', async () => {
    const issued = await calendarToken(id, 1);
    const claim = await verifyCalendarToken(issued);
    assert.equal(claim?.version, 1, 'an old link must still say which version it is');
    assert.notEqual(claim?.version, 2, 'and must not be readable as the current one');
  });

  /**
   * The version is inside the signed material, not merely beside it. If it were
   * not, anyone holding a revoked link could edit the number in the URL and walk
   * back to a version that still verifies — which would make revocation a
   * suggestion.
   */
  it('refuses a token whose version has been edited in the URL', async () => {
    const issued = await calendarToken(id, 2);
    const [staffId, , mac] = issued.split('~');

    assert.equal(await verifyCalendarToken(`${staffId}~1~${mac}`), null);
    assert.equal(await verifyCalendarToken(`${staffId}~3~${mac}`), null);
    assert.equal(await verifyCalendarToken(`${staffId}~999~${mac}`), null);
  });

  it('refuses a token signed for somebody else', async () => {
    const issued = await calendarToken(id, 1);
    const [, version, mac] = issued.split('~');
    const other = '11111111-2222-3333-4444-555555555555';

    assert.equal(await verifyCalendarToken(`${other}~${version}~${mac}`), null);
  });

  it('refuses a tampered signature', async () => {
    const issued = await calendarToken(id, 1);
    assert.equal(await verifyCalendarToken(`${issued}x`), null);
    assert.equal(await verifyCalendarToken(issued.slice(0, -1)), null);
  });

  it('refuses malformed input rather than throwing', async () => {
    for (const bad of ['', '~', id, `${id}~`, `${id}~1~2~3`, 'not-a-token']) {
      assert.equal(await verifyCalendarToken(bad), null, `should refuse ${JSON.stringify(bad)}`);
    }
  });

  it('refuses a version that is not a positive whole number', async () => {
    const [, , mac] = (await calendarToken(id, 1)).split('~');
    for (const bad of ['0', '-1', '1.5', 'abc', '']) {
      assert.equal(await verifyCalendarToken(`${id}~${bad}~${mac}`), null);
    }
  });

  /**
   * Links handed out before the column existed have two parts, not three. They
   * keep working — read as version 1 — right up until somebody regenerates, at
   * which point the stored version moves past 1 and they stop. That is the
   * behaviour that was wanted anyway, and it means the deploy does not force
   * every dentist to re-subscribe on the morning it lands.
   */
  it('reads a pre-versioning link as version 1', async () => {
    const [, , mac] = (await calendarToken(id, 1)).split('~');
    const legacy = `${id}~${mac}`;

    assert.deepEqual(await verifyCalendarToken(legacy), { staffUserId: id, version: 1 });
  });

  /** Same reasoning as `confirmations.ts`: a dot reads as a static file to routing. */
  it('uses ~ rather than . as the separator', async () => {
    assert.ok(!(await calendarToken(id, 1)).includes('.'));
  });
});
