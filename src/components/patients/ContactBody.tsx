'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * A contact's message, clipped to three lines with a way to read the rest.
 *
 * The reminder bodies this renders are greeting + appointment line + blank
 * line + confirm link — long enough that a flat clamp regularly cuts the
 * confirm link itself, which is the one part of the message staff need when a
 * patient disputes ever being given a way to answer. The toggle only appears
 * when the text actually overflows, so a one-line body gets no dead control.
 */
export function ContactBody({
  body,
  showMore,
  showLess,
}: {
  body: string;
  showMore: string;
  showLess: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
    // Measured against the clamped layout only — re-checking after expanding
    // would always see it fit and hide the very toggle being used.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body]);

  return (
    <div>
      <p
        ref={ref}
        className={cn(
          'mt-1 text-body whitespace-pre-line text-ink-soft',
          !expanded && 'line-clamp-3',
        )}
      >
        {body}
      </p>
      {overflowing ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 text-meta font-semibold text-brand-deep hover:underline"
        >
          {expanded ? showLess : showMore}
        </button>
      ) : null}
    </div>
  );
}
