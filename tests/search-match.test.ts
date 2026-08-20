import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rankMatches, scoreMatch } from '../src/lib/search-match';

/**
 * The ordering the command palette is worth using because of.
 *
 * Before this, the palette filtered its screens with `matches()` — one
 * substring test over the whole label — so "stock lab" found nothing, and the
 * survivors came back in rail order however badly they matched. These are the
 * cases that made it feel broken to type into.
 */

describe('scoreMatch — does this answer what was typed', () => {
  it('finds a word in the middle of a label', () => {
    assert.ok(scoreMatch('Stock · Labels', 'labels') !== null);
  });

  it('finds words typed in order across a nested label — the case that used to fail', () => {
    // No run of characters in "Stock · Labels" spells "stock lab": the `·` and
    // its spaces sit in between, which is exactly what a substring test trips on.
    assert.ok(scoreMatch('Stock · Labels', 'stock lab') !== null);
    assert.ok(scoreMatch('Stock · Labels', 'st la') !== null);
  });

  it('refuses when one of the words typed is nowhere in the text', () => {
    assert.equal(scoreMatch('Stock · Labels', 'stock supplier'), null);
    assert.equal(scoreMatch('Patients', 'plans'), null);
  });

  it('ignores case and the diacritics nobody types', () => {
    assert.ok(scoreMatch('Pacientët', 'pacientet') !== null);
    assert.ok(scoreMatch('Çeliku', 'celiku') !== null);
  });

  it('scores nothing typed as zero, so an unfiltered list survives', () => {
    assert.equal(scoreMatch('Stock', ''), 0);
    assert.equal(scoreMatch('Stock', '   '), 0);
  });

  it('ranks the start of the text above the middle of a word', () => {
    const plans = scoreMatch('Plans', 'pl');
    const buried = scoreMatch('Supplies', 'pl');
    assert.ok(plans !== null && buried !== null);
    assert.ok(plans > buried);
  });

  it('ranks a whole word above the start of a longer one', () => {
    const exact = scoreMatch('Stock · Suppliers', 'stock');
    const partial = scoreMatch('Stocktake sheet', 'stock');
    assert.ok(exact !== null && partial !== null);
    assert.ok(exact > partial);
  });
});

describe('rankMatches — the list the palette draws', () => {
  const screens = ['Dashboard', 'Calendar', 'Patients', 'Plans', 'Stock', 'Stock · Labels'];

  it('drops what does not match and keeps the rest best-first', () => {
    assert.deepEqual(rankMatches(screens, 'stock', (s) => s), ['Stock', 'Stock · Labels']);
  });

  it('puts the screen actually called that on top', () => {
    assert.equal(rankMatches(screens, 'pl', (s) => s)[0], 'Plans');
  });

  it('leaves ties in the order they were given — the rail reads in that order', () => {
    // Both score the same on "s"; neither should jump the other.
    const ranked = rankMatches(['Stock', 'Services'], 's', (s) => s);
    assert.deepEqual(ranked, ['Stock', 'Services']);
  });

  it('returns everything, unreordered, when nothing has been typed', () => {
    assert.deepEqual(rankMatches(screens, '', (s) => s), screens);
  });
});
