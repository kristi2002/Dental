/**
 * The two layers that stop the navy reading as a rectangle of one colour.
 *
 * A light and a grain, in that order, both `aria-hidden` and neither of them
 * saying anything: this is texture, and the whole of its argument is that a
 * large flat field is the one thing a screen renders worse than paper does.
 * Printed navy is ink with a weave under it; a screen's navy is `#12253f` and
 * nothing else, over eight hundred vertical pixels, and the eye reads it as a
 * hole rather than as a surface.
 *
 * The light wanders on a seventy-second cycle and the grain does not move at
 * all — see `.aurora` and `.grain` in `globals.css` for both sets of numbers and
 * why they are those numbers. What is worth saying *here* is why it is one
 * component rather than two divs pasted into each section: the storefront's
 * rule is that a flourish invented inside a component is a flourish nobody
 * counts, and the way to keep two layers from becoming five is to have exactly
 * one place they can be added from.
 *
 * **The caller has to be `relative` and `overflow-clip`.** Both layers are
 * absolutely positioned and the light is deliberately oversized, so a section
 * that is neither will leak a soft blue wash over its neighbour. `clip` rather
 * than `hidden`, as everywhere on this page — the reasoning is under `.drift`.
 */
export function Ambience() {
  return (
    <>
      <div aria-hidden className="aurora drift-light" />
      <div aria-hidden className="grain pointer-events-none absolute inset-0" />
    </>
  );
}
