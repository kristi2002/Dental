import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A bronze rule and three words in caps, above a section's heading.
 *
 * The hero has had exactly this since it was written — a hairline, a gap, then
 * "Vlorë, Albania" in bronze at 0.28em — and no other section on the page had
 * anything above its heading at all. Which meant the front page opened in a
 * magazine's voice and then spent nine sections in a brochure's: every band
 * starting cold with a large serif and no statement of what the reader has
 * arrived at.
 *
 * So this is the hero's own register promoted into a component rather than a
 * second one invented next to it. That distinction is the point. The page's
 * standing rule is that a flourish used once is a flourish, and the fix for one
 * you want twice is to name it — not to draw it again slightly differently and
 * finish with two eyebrows that disagree about their tracking.
 *
 * **It is not a heading.** A `<p>`, not an `<h3>`, and the heading it introduces
 * keeps its own level: an eyebrow marked up as a heading puts a rung into the
 * document outline that says nothing, and a screen reader running the outline
 * then hears "What we do" and "The work, shown rather than hidden" as two
 * separate sections when they are one. The rule beside it is `aria-hidden` for
 * the same reason a hairline always is.
 *
 * **The colour is the caller's and it is not free.** On cream it has to be
 * `gilt-deep`, which is 5.1:1 — the bright bronze is 2.1:1 there and unreadable
 * — and on navy it has to be `gilt` at 5.8:1, because `gilt-deep` on navy is
 * 1.4:1. There is no single bronze that works on both grounds, which is why this
 * takes a class instead of picking one. The rule may be the bright bronze
 * either way; decoration carries no contrast requirement.
 */
export function SectionEyebrow({
  children,
  className,
}: {
  children: ReactNode;
  /** The bronze for this ground: `text-gilt-deep` on cream, `text-gilt` on navy. */
  className?: string;
}) {
  return (
    <p className={cn('type-eyebrow', className)}>
      <span aria-hidden className="h-px w-8 shrink-0 bg-gilt" />
      {children}
    </p>
  );
}
