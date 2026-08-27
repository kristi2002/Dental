import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The page's one reveal, used everywhere so the page has one rhythm.
 *
 * A **server** component, and no JavaScript at all — which is the second version
 * of this file. The first wrapped Motion's `whileInView`, and it shipped the
 * hidden state to the browser as an inline `opacity:0` in the server-rendered
 * HTML. That is the wrong way round for a page whose job is to be read: the
 * content should exist and the animation should be the enhancement, not the
 * other way about. See the note on `.reveal` in `globals.css` for the whole
 * story, including how it left reduced-motion readers staring at a blank page.
 *
 * `animation-timeline: view()` does the same job in the compositor, driven by
 * scroll position rather than by a timer, and it costs nothing to hydrate. Where
 * it is unsupported the browser shows the finished page, which is a perfectly
 * good outcome and the reason this approach cannot fail the way the last one
 * did.
 *
 * Scroll-triggered animation is the quickest way to make a page feel expensive
 * and the quickest way to make it feel templated; the difference is restraint.
 * So there is one primitive rather than a flourish per section — everything
 * rises the same 18px across the same slice of the scroll — and the only knob a
 * caller gets is `step`, for staggering a row.
 */
export function Reveal({
  children,
  step = 0,
  className,
  as: Component = 'div',
}: {
  children: ReactNode;
  /**
   * Stagger, as a position in the row rather than a duration. Each unit shifts
   * this element's slice of the scroll range a little later, so a row of four
   * arrives in sequence. Distance, not time: it stays in step however fast the
   * page is scrolled, which a `transition-delay` does not.
   */
  step?: number;
  className?: string;
  /** `li` where the parent is a list — a `div` inside a `ul` is not a list item. */
  as?: 'div' | 'li' | 'section' | 'figure';
}) {
  return (
    <Component
      className={cn('reveal', className)}
      style={step ? ({ '--reveal-step': `${step * 5}%` } as CSSProperties) : undefined}
    >
      {children}
    </Component>
  );
}
