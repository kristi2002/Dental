import { cn } from '@/lib/utils';

/**
 * One enormous word in the display serif, at five per cent, behind a section.
 *
 * The sibling of `Watermark` and deliberately its opposite number: that one
 * prints the practice's own tooth, this one prints a word, and no section is
 * ever given both. Two watermarks behind one heading is not twice as much
 * printing — it is a smudge, and the rationing is the entire reason either of
 * them reads as intent rather than as decoration left switched on.
 *
 * **The word is Latin, and it is not translated.** This is the rule the effect
 * stands or falls on. The site is read in Albanian, Italian and English, and a
 * watermark set in any one of the three is the section's own headline printed a
 * second time in grey — redundant in that locale and, worse, a fourth string to
 * keep in step across `messages/` for no gain at all. Latin belongs to none of
 * the three and to medicine generally, so the same word is right in all three
 * and reads as provenance rather than as repetition. Which is why the words are
 * passed in as plain children at the call site: there is nothing here for a
 * translator to do.
 *
 * **The caller hangs it off an edge.** Half off the section it is printing;
 * wholly inside it, it is a heading somebody forgot to style — that really is
 * the whole difference, and it is why every call site carries a negative offset
 * on one side. See `.ghost-word` in `globals.css` for why `white-space: nowrap`
 * is what makes that survivable, and why it is set upright rather than italic.
 *
 * `aria-hidden` and `pointer-events-none`, like every texture on this page: it
 * must never be read aloud and it must never swallow a press meant for the
 * content sitting over it.
 */
export function GhostWord({ children, className }: { children: string; className?: string }) {
  return (
    <span aria-hidden className={cn('ghost-word', className)}>
      {children}
    </span>
  );
}
