import { cn } from '@/lib/utils';

/**
 * The two layers that stop a section reading as a rectangle of one colour.
 *
 * A light and a grain, in that order, both `aria-hidden` and neither of them
 * saying anything: this is texture, and the whole of its argument is that a
 * large flat field is the one thing a screen renders worse than paper does.
 * Printed navy is ink with a weave under it; a screen's navy is `#12253f` and
 * nothing else, over eight hundred vertical pixels, and the eye reads it as a
 * hole rather than as a surface.
 *
 * The light wanders on a long cycle and the grain does not move at all — see
 * `.aurora`, `.aurora-bone` and `.grain` in `globals.css` for both sets of
 * numbers and why they are those numbers. What is worth saying *here* is why it
 * is one component rather than two divs pasted into each section: the
 * storefront's rule is that a flourish invented inside a component is a flourish
 * nobody counts, and the way to keep two layers from becoming five is to have
 * exactly one place they can be added from.
 *
 * **`tone` is which room is being lit, not how brightly.** The navy version was
 * the original and the whole of it; the cream sections were left flat on the
 * reasoning that a light ground does not have the banding problem a dark one
 * has. That is true and it was the wrong conclusion, because banding was only
 * half the complaint — the other half is that four unbroken cream bands stacked
 * down the middle of the page read as one long band, and the hairlines between
 * them are doing work that the surface should be doing itself. So both grounds
 * get a light now, made of different colours and at very different strengths.
 * Neither is ever meant to be noticed; they are meant to be missed when removed.
 *
 * **The caller has to be `relative` and `overflow-clip`.** Both layers are
 * absolutely positioned and the light is deliberately oversized, so a section
 * that is neither will leak a soft wash over its neighbour. `clip` rather than
 * `hidden`, as everywhere on this page — the reasoning is under `.drift`.
 */
export function Ambience({ tone = 'navy' }: { tone?: 'navy' | 'bone' }) {
  const warm = tone === 'bone';

  return (
    <>
      <div
        aria-hidden
        // Two drifts rather than one, and which section gets which is the
        // caller's business only in the sense that alternating them costs
        // nothing. Both grounds could have shared the seventy-second cycle and
        // then every section on the page would be lit identically at every
        // moment, which is the flat field again in a more expensive form.
        className={warm ? 'aurora-bone drift-light-slow' : 'aurora drift-light'}
      />
      <div
        aria-hidden
        className={cn('grain pointer-events-none absolute inset-0', warm && 'grain-paper')}
      />
    </>
  );
}
