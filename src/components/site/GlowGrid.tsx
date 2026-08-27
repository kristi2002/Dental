'use client';

import type { PointerEvent, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A brass light that follows the cursor across the treatment grid — and, from
 * the same two numbers, the slight lean of the card toward it.
 *
 * The effect itself is one line of CSS — a radial gradient positioned by two
 * custom properties, see `.glow-card` in `globals.css`. This component exists
 * only to keep those two properties in step with the pointer, and it is written
 * the way it is because the obvious version of it is a performance trap.
 *
 * The obvious version puts `onPointerMove` on every card. Eight cards, eight
 * listeners, and every one of them fires a React state update sixty times a
 * second while the mouse crosses it — which turns a decoration into the most
 * expensive thing on the page. This is **one** listener on the container, and it
 * writes the co-ordinates straight onto the card's style object rather than
 * through state: no re-render, no reconciliation, nothing for React to do. The
 * browser is already tracking the pointer; all this does is tell the compositor
 * where it is.
 *
 * `closest('li')` is what makes the delegation work — the event lands on
 * whatever is under the cursor, usually the photograph or the heading, and the
 * card is the ancestor that carries the gradient.
 *
 * There is nothing to clean up on the way out. The gradient's opacity is driven
 * by `:hover` in CSS, so it fades out on its own the moment the pointer leaves,
 * and the stale co-ordinates left behind on the element are invisible and get
 * overwritten by the next entry.
 *
 * **Touch screens are excluded in the stylesheet, not here.** `@media (hover:
 * hover)` is what stops a thumb tap leaving a smear of light frozen on a card,
 * which is what this looked like on a phone before that guard went in. The
 * listener still runs on touch; it just has nothing to paint.
 */
/**
 * Outside the component on purpose: it closes over nothing, so defining it in
 * the body would allocate a new function — and hand the `<ul>` a new prop — on
 * every render, for no gain.
 */
function onPointerMove(event: PointerEvent<HTMLUListElement>) {
  const card = (event.target as HTMLElement).closest('li');
  if (!card) return;

  const box = card.getBoundingClientRect();
  const x = event.clientX - box.left;
  const y = event.clientY - box.top;

  card.style.setProperty('--glow-x', `${x}px`);
  card.style.setProperty('--glow-y', `${y}px`);

  // The same measurement expressed a second way: −1 at one edge, +1 at the
  // other, 0 in the middle. `.tilt-plate` multiplies it by an angle, which is
  // why these are plain numbers rather than lengths — a unitless value is the
  // only thing that can become a `deg` inside a `calc()` further down.
  //
  // Two more writes on a handler that was already running, and no extra
  // arithmetic worth the name: the bounding box is the one genuinely expensive
  // call here and it is read once for both effects.
  card.style.setProperty('--tilt-x', `${(x / box.width) * 2 - 1}`);
  card.style.setProperty('--tilt-y', `${(y / box.height) * 2 - 1}`);
}

export function GlowGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ul className={cn(className)} onPointerMove={onPointerMove}>
      {children}
    </ul>
  );
}
