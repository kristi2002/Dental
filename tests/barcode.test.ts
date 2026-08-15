import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  gtinCheckDigit,
  normaliseGtin,
  parseDigitalLink,
  parseElementString,
  parseGs1Date,
  parseScan,
} from '../src/lib/barcode';

/** FNC1, as a scanner transmits it. */
const GS = '';
const NOW = new Date('2026-08-14T00:00:00.000Z');
const day = (value: Date | null) => value?.toISOString().slice(0, 10) ?? null;

describe('gtinCheckDigit', () => {
  it('computes the digit a real GTIN-13 ends in', () => {
    // 5901234123457 — the specification's own worked example, padded to 14.
    assert.equal(gtinCheckDigit('0590123412345'), 7);
  });

  it('computes it for a GTIN-14 body', () => {
    assert.equal(gtinCheckDigit('0950600013435'), 2);
  });
});

describe('normaliseGtin — one material, one key', () => {
  it('pads every short form up to fourteen', () => {
    // The same carton scanned off its EAN-13 and off its DataMatrix has to
    // reach one row on the shelf, and only does if both are padded first.
    assert.equal(normaliseGtin('5901234123457'), '05901234123457');
    assert.equal(normaliseGtin('09506000134352'), '09506000134352');
  });

  it('accepts a GTIN-8 and a GTIN-12', () => {
    assert.equal(normaliseGtin('96385074'), '00000096385074');
    assert.equal(normaliseGtin('012345678905'), '00012345678905');
  });

  it('refuses a wrong check digit rather than storing a misread', () => {
    // A camera reading a curved foil pouch in bad light is exactly what this
    // digit is for. Linking a material to a misread code is forever.
    assert.equal(normaliseGtin('5901234123456'), null);
  });

  it('refuses a length that is not a GTIN at all', () => {
    assert.equal(normaliseGtin('12345'), null);
    assert.equal(normaliseGtin(''), null);
  });
});

describe('parseGs1Date', () => {
  it('reads YYMMDD as UTC midnight', () => {
    assert.equal(day(parseGs1Date('261231', NOW)), '2026-12-31');
  });

  it('reads day 00 as the end of that month', () => {
    // A box marked 2026-11 expires when November does. Reading day zero as
    // day one of nothing would expire the stock a month early.
    assert.equal(day(parseGs1Date('261100', NOW)), '2026-11-30');
    assert.equal(day(parseGs1Date('280200', NOW)), '2028-02-29');
  });

  it('puts a year more than 50 ahead into the previous century', () => {
    // The GS1 rule, and not "always 20xx": this is what keeps a 1998
    // manufacture date on an old instrument out of 2098.
    assert.equal(day(parseGs1Date('980601', NOW)), '1998-06-01');
    assert.equal(day(parseGs1Date('760601', NOW)), '2076-06-01');
  });

  it('rejects a date that is not one', () => {
    assert.equal(parseGs1Date('261301', NOW), null);
    assert.equal(parseGs1Date('26123', NOW), null);
    assert.equal(parseGs1Date('', NOW), null);
  });
});

describe('parseElementString', () => {
  it('reads a fixed-length AI without needing a separator after it', () => {
    const fields = parseElementString('010950600013435217261231');
    assert.equal(fields.get('01'), '09506000134352');
    assert.equal(fields.get('17'), '261231');
  });

  it('runs a variable-length value to the separator, not to a guessed length', () => {
    const fields = parseElementString(`0109506000134352 10ABC123${GS}17261231`.replace(' ', ''));
    assert.equal(fields.get('10'), 'ABC123');
    assert.equal(fields.get('17'), '261231');
  });

  it('does not read an AI out of the middle of a lot number', () => {
    // The case that makes this a parser rather than a regex: a lot number is
    // free text, and "17ABC" inside one is not an expiry date.
    const fields = parseElementString(`010950600013435210LOT17ABC${GS}11260101`);
    assert.equal(fields.get('10'), 'LOT17ABC');
    assert.equal(fields.get('17'), undefined);
    assert.equal(fields.get('11'), '260101');
  });

  it('reads a variable-length value that runs to the end with no separator', () => {
    // Plenty of scanners drop the trailing separator entirely.
    const fields = parseElementString('010950600013435210LOT99');
    assert.equal(fields.get('10'), 'LOT99');
  });

  it('reads the serial and the stated count', () => {
    const fields = parseElementString(`010950600013435221SER001${GS}3012`);
    assert.equal(fields.get('21'), 'SER001');
    assert.equal(fields.get('30'), '12');
  });
});

describe('parseDigitalLink — the QR modern packaging actually carries', () => {
  it('reads the product and its qualifiers out of the path', () => {
    const fields = parseDigitalLink('https://example.com/01/09506000134352/10/ABC123');
    assert.equal(fields?.get('01'), '09506000134352');
    assert.equal(fields?.get('10'), 'ABC123');
  });

  it('reads the non-key AIs out of the query string', () => {
    const fields = parseDigitalLink('https://example.com/01/09506000134352?17=261231&10=L7');
    assert.equal(fields?.get('17'), '261231');
    assert.equal(fields?.get('10'), 'L7');
  });

  it('accepts the short names packaging uses instead of the numbers', () => {
    const fields = parseDigitalLink('https://ex.com/gtin/09506000134352/lot/A1?ser=S9');
    assert.equal(fields?.get('01'), '09506000134352');
    assert.equal(fields?.get('10'), 'A1');
    assert.equal(fields?.get('21'), 'S9');
  });

  it('ignores whatever the brand filed the product under above the identifier', () => {
    const fields = parseDigitalLink('https://ex.com/shop/gloves/01/09506000134352');
    assert.equal(fields?.get('01'), '09506000134352');
  });

  it('is not a Digital Link without a product in it', () => {
    assert.equal(parseDigitalLink('https://example.com/about'), null);
    assert.equal(parseDigitalLink('not a url'), null);
  });
});

describe('parseScan — one call, whatever the scanner emitted', () => {
  it('reads a DataMatrix payload with its symbology prefix', () => {
    const scan = parseScan(`]d2010950600013435217261231${GS}10L42`, NOW);
    assert.equal(scan.format, 'gs1-element');
    assert.equal(scan.gtin, '09506000134352');
    assert.equal(scan.key, '09506000134352');
    assert.equal(day(scan.expiryDate), '2026-12-31');
    assert.equal(scan.lotNumber, 'L42');
  });

  it('reads a Digital Link to the same key as the element string', () => {
    // The point of normalising: two encodings of one carton must not become
    // two materials on the shelf.
    const link = parseScan('https://ex.com/01/09506000134352/10/L42?17=261231', NOW);
    const element = parseScan(`010950600013435217261231${GS}10L42`, NOW);
    assert.equal(link.format, 'gs1-digital-link');
    assert.equal(link.key, element.key);
    assert.equal(link.lotNumber, element.lotNumber);
    assert.equal(day(link.expiryDate), day(element.expiryDate));
  });

  it('treats a bare EAN-13 off an older box as the same product', () => {
    const scan = parseScan('5901234123457', NOW);
    assert.equal(scan.format, 'plain');
    assert.equal(scan.gtin, '05901234123457');
    assert.equal(scan.key, '05901234123457');
  });

  it('falls back to best-before when there is no expiry', () => {
    // Some consumables carry 15 instead of 17, and it means the same thing to
    // a cupboard.
    const scan = parseScan('010950600013435215270301', NOW);
    assert.equal(day(scan.expiryDate), '2027-03-01');
  });

  it('keeps a code it cannot make sense of rather than losing the scan', () => {
    // A label the practice printed itself is still something to link.
    const scan = parseScan('SHELF-A-GLOVES', NOW);
    assert.equal(scan.format, 'plain');
    assert.equal(scan.key, 'SHELF-A-GLOVES');
    assert.equal(scan.gtin, null);
  });

  it('never throws on rubbish', () => {
    for (const junk of ['', '   ', '][', '01', 'https://', GS + GS]) {
      assert.doesNotThrow(() => parseScan(junk, NOW));
    }
  });
});
