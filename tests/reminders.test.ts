import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mailtoLink, toWhatsappNumber, whatsappLink } from '../src/lib/reminders';

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
