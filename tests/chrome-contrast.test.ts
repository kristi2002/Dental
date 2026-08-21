import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

/**
 * The teal chrome, measured.
 *
 * Every other colour in `globals.css` was chosen against the surface it sits on
 * and the numbers are written down beside it. The rail and masthead were the
 * exception, and they were the worst offender in the app: the ramp got *lighter*
 * downward, so white label text fell to 2.32:1 at the foot — 2.05:1 with the
 * `/85` those labels carried — on the one column a receptionist reads all day.
 *
 * This reads the real stylesheet rather than a copy of the values, so the test
 * fails if somebody edits the gradient rather than passing on a stale constant.
 * It is the meter that was missing.
 */

const CSS = readFileSync(path.join(import.meta.dirname, '../src/app/globals.css'), 'utf8');

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => {
    const c = Number.parseInt(value.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `overlay` at `alpha` composited onto `base` — what a `bg-black/15` wash is. */
function composite(overlay: string, alpha: number, base: string): string {
  const parse = (hex: string) =>
    [0, 2, 4].map((i) => Number.parseInt(hex.replace('#', '').slice(i, i + 2), 16));
  const [fr, fg, fb] = parse(overlay);
  const [br, bg, bb] = parse(base);
  const mix = (f: number, b: number) => Math.round(f * alpha + b * (1 - alpha));
  return `#${[mix(fr, br), mix(fg, bg), mix(fb, bb)]
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** The stops of one `linear-gradient(...)` in a named class. */
function gradientStops(className: string): string[] {
  const rule = new RegExp(`\\.${className}\\s*\\{[^}]*\\}`).exec(CSS);
  assert.ok(rule, `no .${className} rule in globals.css`);
  const stops = rule[0].match(/#[0-9a-fA-F]{6}/g);
  assert.ok(stops && stops.length >= 2, `.${className} has no gradient stops`);
  return stops;
}

const AA = 4.5;
const WHITE = '#ffffff';

for (const className of ['app-rail', 'app-header']) {
  describe(`.${className}`, () => {
    const stops = gradientStops(className);

    it('carries white text at every stop', () => {
      // Every stop, not just the ends: a gradient is read at every point along
      // it, and the failure was at the *light* end, which is easy to forget
      // when the swatch you are looking at is the dark one at the top.
      for (const stop of stops) {
        const ratio = contrast(WHITE, stop);
        assert.ok(
          ratio >= AA,
          `${stop} gives white ${ratio.toFixed(2)}:1, below AA ${AA}:1`,
        );
      }
    });

    it('still carries white text under the hover wash', () => {
      // The washes are black on purpose. A white wash lightens the row it is
      // meant to highlight, which pushed the label back under AA no matter how
      // dark the base got — see the note beside `.app-rail`.
      for (const stop of stops) {
        const hovered = composite('#000000', 0.15, stop);
        const ratio = contrast(WHITE, hovered);
        assert.ok(
          ratio >= AA,
          `hover over ${stop} gives white ${ratio.toFixed(2)}:1, below AA`,
        );
      }
    });

    it('still carries white text on the avatar chip', () => {
      for (const stop of stops) {
        const chip = composite('#000000', 0.2, stop);
        const ratio = contrast(WHITE, chip);
        assert.ok(ratio >= AA, `avatar over ${stop} gives ${ratio.toFixed(2)}:1`);
      }
    });
  });
}

describe('the rail keeps its shape', () => {
  it('still lightens from top to foot', () => {
    // The darkening was to make it legible, not to flatten it. If a later edit
    // makes the ramp uniform the design argument in the comment stops being
    // true, and this is the cheapest place to notice.
    const stops = gradientStops('app-rail');
    const first = luminance(stops[0]);
    const last = luminance(stops.at(-1)!);
    assert.ok(last > first, 'the rail should still be deepest at the top');
  });
});

describe('the phone chrome matches the rail it sits above', () => {
  it('themeColor is the rail’s first stop', () => {
    // Android paints its status bar with this. Left behind on an edit, the
    // strip above the app is a different teal from the app.
    const layout = readFileSync(
      path.join(import.meta.dirname, '../src/app/[locale]/layout.tsx'),
      'utf8',
    );
    const declared = /themeColor:\s*'(#[0-9a-fA-F]{6})'/.exec(layout);
    assert.ok(declared, 'no themeColor in [locale]/layout.tsx');
    assert.equal(declared[1].toLowerCase(), gradientStops('app-rail')[0].toLowerCase());
  });
});
