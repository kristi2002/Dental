import type { ToothQuadrant } from '@/lib/teeth';
import { spanDigit, spanQuadrants } from '@/lib/tooth-span';
import { cn } from '@/lib/utils';

/**
 * A span, drawn the way the docket writes it: the digits, inside the corner of
 * the mouth they belong to.
 *
 * The digits alone are ambiguous and always have been — `5 x 7` is four
 * different bridges until you know which quadrant it is in. On paper the
 * quadrant is the cross ruled down the middle of the chart, and a span is
 * written in one of its four corners. That is what these two borders are: the
 * midline and the occlusal plane, kept on the side of the digits that the corner
 * is on. It is the notation the practice already reads, and it costs two CSS
 * borders rather than a legend.
 *
 * A screen reader gets the corner in words instead, which is why the caller
 * passes the labels in — this renders inside a server component and inside the
 * picker, so it cannot reach for a hook of its own.
 */

const BRACKET: Record<ToothQuadrant, string> = {
  // The vertical stroke is the midline, so it goes on the side the midline is
  // on; the horizontal stroke is where the teeth bite, so it goes under the
  // upper arch and over the lower one.
  UPPER_RIGHT: 'border-r border-b pr-1 pb-0.5',
  UPPER_LEFT: 'border-l border-b pl-1 pb-0.5',
  LOWER_RIGHT: 'border-r border-t pr-1 pt-0.5',
  LOWER_LEFT: 'border-l border-t pl-1 pt-0.5',
};

export function ToothSpan({
  value,
  quadrantLabel,
  className,
}: {
  /** The stored span, e.g. `17,16x,15`. */
  value: string | null | undefined;
  /** "Upper right", in the reader's language — for the words behind the bracket. */
  quadrantLabel?: (quadrant: ToothQuadrant) => string;
  className?: string;
}) {
  const groups = spanQuadrants(value);
  if (groups.length === 0) return null;

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-2.5 gap-y-1.5', className)}>
      {groups.map((group) => (
        <span
          key={group.quadrant}
          className={cn(
            'inline-flex items-center gap-1 border-ink-faint font-bold tabular-nums',
            BRACKET[group.quadrant],
          )}
        >
          {quadrantLabel ? <span className="sr-only">{quadrantLabel(group.quadrant)}: </span> : null}
          {group.positions.map((position) => (
            <span
              key={position.toothNum}
              // The gap is quieter than the teeth either side of it: it is a
              // position the laboratory is billing for, not a tooth anybody is
              // going to look at in the mouth.
              className={position.pontic ? 'text-ink-faint' : 'text-ink'}
            >
              {position.pontic ? '×' : spanDigit(position.toothNum)}
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}
