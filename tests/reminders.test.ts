import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  diallingCodeFor,
  mailtoLink,
  toWhatsappNumber,
  whatsappLink,
} from '../src/lib/reminders';

describe('toWhatsappNumber — Albanian local formats', () => {
  it('turns a local 069 number into its international form', () => {
    assert.equal(toWhatsappNumber('069 12 34 567'), '355691234567');
  });

  it('strips spaces, dashes and brackets', () => {
    assert.equal(toWhatsappNumber('069-123-4567'), '355691234567');
    assert.equal(toWhatsappNumber('(069) 123 4567'), '355691234567');
  });

  it('leaves an already-international number alone', () => {
    assert.equal(toWhatsappNumber('+355 69 123 4567'), '355691234567');
    assert.equal(toWhatsappNumber('355691234567'), '355691234567');
  });

  it('understands a 00 prefix as international', () => {
    assert.equal(toWhatsappNumber('00355691234567'), '355691234567');
  });

  it('honours a different country code', () => {
    assert.equal(toWhatsappNumber('069 1234567', '39'), '39691234567');
  });

  it('does not double a country code that is already there', () => {
    assert.equal(toWhatsappNumber('355691234567', '355'), '355691234567');
  });

  it('refuses something that is not a phone number', () => {
    assert.equal(toWhatsappNumber(''), null);
    assert.equal(toWhatsappNumber('   '), null);
    assert.equal(toWhatsappNumber('not a number'), null);
  });
});

describe('link builders', () => {
  it('builds a wa.me link with the message encoded', () => {
    const link = whatsappLink('069 1234567', 'Përshëndetje & mirë se vini');
    assert.ok(link!.startsWith('https://wa.me/355691234567?text='));
    assert.ok(link!.includes('%26'), 'the ampersand is encoded, not left to split the query');
  });

  it('returns null rather than a broken link when there is no number', () => {
    assert.equal(whatsappLink('', 'hello'), null);
  });

  it('builds a mailto with subject and body encoded', () => {
    const link = mailtoLink('a@b.co', 'Kontroll & rikthim', 'Line one\nLine two');
    assert.ok(link!.startsWith('mailto:'));
    assert.ok(link!.includes('subject='));
    assert.ok(link!.includes('%26'), 'the ampersand cannot start a new query parameter');
    assert.ok(link!.includes('%0A'), 'the newline survives encoding');
  });

  it('returns null without an address', () => {
    assert.equal(mailtoLink('', 's', 'b'), null);
    assert.equal(mailtoLink('   ', 's', 'b'), null);
  });
});


/**
 * Which country a number with no code of its own is read as.
 *
 * The bug this closes was silent in the worst way: an Italian mobile is written
 * `340 1234567` — no `+`, and no trunk zero to strip — so it fell through to
 * "prepend the practice's country" and became `3553401234567`. The reminder went
 * nowhere and nothing said so.
 */
describe('diallingCodeFor — whose country a bare number is in', () => {
  it('reads an Italian patient as Italian', () => {
    assert.equal(diallingCodeFor('it'), '39');
  });

  it('reads everyone else as the practice, which is where it is', () => {
    assert.equal(diallingCodeFor('sq'), '355');
    // English is the language a patient from any of several countries picks, so
    // there is nothing behind it to infer — and this is the old behaviour.
    assert.equal(diallingCodeFor('en'), '355');
    assert.equal(diallingCodeFor(null), '355');
    assert.equal(diallingCodeFor(undefined), '355');
    assert.equal(diallingCodeFor('de'), '355');
  });
});

describe('whatsappLink — the number it actually dials', () => {
  const NUMBER = /wa\.me\/(\d+)/;

  it('sends an Italian mobile to Italy rather than inventing an Albanian one', () => {
    const link = whatsappLink('340 1234567', 'ciao', 'it');
    assert.equal(link?.match(NUMBER)?.[1], '393401234567');
  });

  it('is unchanged for the practice’s own patients', () => {
    const link = whatsappLink('069 12 34 567', 'përshëndetje', 'sq');
    assert.equal(link?.match(NUMBER)?.[1], '355691234567');
  });

  it('leaves a number that states its own country alone, whatever the locale says', () => {
    // Somebody living in Italy who kept an Albanian number, and wrote it in full.
    const link = whatsappLink('+355 69 123 4567', 'ciao', 'it');
    assert.equal(link?.match(NUMBER)?.[1], '355691234567');
  });

  it('behaves exactly as before when nobody passes a locale', () => {
    const link = whatsappLink('069 12 34 567', 'x');
    assert.equal(link?.match(NUMBER)?.[1], '355691234567');
  });
});
