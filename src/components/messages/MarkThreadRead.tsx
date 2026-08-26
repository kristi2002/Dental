'use client';

import { useEffect, useRef } from 'react';
import { markThreadRead } from '@/lib/actions/inbox';

/**
 * Opening a thread is what marks it read.
 *
 * Renders nothing. It exists because a server component may not write to the
 * database while it renders, and this genuinely is a side effect of *looking* —
 * there is no button to hang it on without inventing one nobody would press.
 *
 * Fires once per mount and never on a re-render, which matters: the action
 * revalidates the layout when it changes something, and a component that
 * re-fired on the resulting render would mark, revalidate, mark, revalidate.
 * The guard is a ref rather than the effect's dependency list because a
 * revalidation remounts nothing and changes no dependency — it just renders
 * again, which is exactly the case the list would not catch.
 */
export function MarkThreadRead({ threadId }: { threadId: string }) {
  const done = useRef<string | null>(null);

  useEffect(() => {
    if (done.current === threadId) return;
    done.current = threadId;
    // Not awaited and not reported. Failing to record that somebody read a
    // message must never be allowed to interrupt them reading it.
    void markThreadRead(threadId);
  }, [threadId]);

  return null;
}
