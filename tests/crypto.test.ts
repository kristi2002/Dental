import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generatePin, PIN_MAX_LENGTH } from '../src/lib/auth/crypto';

/**
 * The PIN generator, and specifically the one property it exists for.
 *
 * `generatePin` has no caller — `staff.ts` takes a PIN typed into a form — so it
 * was removed once as dead code and put back deliberately: the rejection
 * sampling in it is the expensive part to work out, and a future reset flow that
 * has to re-derive the argument is a reset flow that will reach for `byte % 10`.
 *
 * Which is exactly what the last test here forbids. Format assertions alone
 * would let somebody "simplify" this to a modulo fold and stay green, and that
 * is the whole regression the function's comment is written against.
 */

describe('generatePin — shape', () => {
  it('is the requested number of digits, and nothing else', () => {
    for (const length of [4, 5, 6, 8]) {
      const pin = generatePin(length);
      assert.equal(pin.length, length, `asked for ${length}`);
      assert.match(pin, /^\d+$/, `${pin} is not all digits`);
    }
  });

  it('defaults to the longest PIN the app accepts', () => {
    assert.equal(generatePin().length, PIN_MAX_LENGTH);
  });

  it('can produce every digit', () => {
    // A generator stuck on a subset passes both assertions above. 400 draws of
    // 4 digits is 1600 samples; the chance of any particular digit being absent
    // from that is about 10^-73.
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      for (const digit of generatePin(4)) seen.add(digit);
    }
    assert.equal(seen.size, 10, `only saw ${[...seen].toSorted().join('')}`);
  });
});

describe('generatePin — the bias it was written to avoid', () => {
  it('does not favour the low half, the way `byte % 10` would', () => {
    // A byte holds 0–255, which is not a whole number of tens. Folding it with
    // `% 10` gives 0–5 twenty-six chances in 256 and 6–9 only twenty-five, so a
    // modulo generator produces a digit under 6 with probability 6 × 26/256 =
    // 0.609375 instead of 0.6.
    //
    // That gap is small enough that it takes a large sample to see at all,
    // which is the reason to assert it here rather than trust the reading: at
    // 50,000 four-digit draws the standard deviation of the proportion is
    // sqrt(0.6 × 0.4 / 200000) ≈ 0.0011, so the correct 0.6 and the modulo
    // 0.609375 sit roughly four standard deviations either side of the midpoint
    // below. A correct generator fails this about once in 10^5 runs; a modulo
    // one fails it essentially always.
    const DRAWS = 50_000;
    const MIDPOINT = 0.604_6875;

    let low = 0;
    let total = 0;
    for (let i = 0; i < DRAWS; i++) {
      for (const digit of generatePin(4)) {
        if (digit < '6') low++;
        total++;
      }
    }

    const proportion = low / total;
    assert.ok(
      proportion < MIDPOINT,
      `digits under 6 came up ${(proportion * 100).toFixed(3)}% of the time; ` +
        'an unbiased draw is 60% and a `byte % 10` fold is 60.94%',
    );
  });
});
