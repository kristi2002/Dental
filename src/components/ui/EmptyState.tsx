import type { ReactNode } from 'react';
import { ExplainLink } from '@/components/help/ExplainLink';

export function EmptyState({
  icon,
  title,
  action,
  explain = false,
}: {
  icon?: ReactNode;
  title: string;
  action?: ReactNode;
  /**
   * Offer "what is this screen for?" underneath.
   *
   * Opt-in rather than automatic, and the opt-in is the whole design. This
   * component is used sixty-odd times, and most of those are a small panel
   * inside a busy screen — "no visits recorded yet" in one tab of a patient
   * record, "nothing booked" in one card of the dashboard. Three offers to
   * explain the screen, on a screen that is plainly not empty, is noise.
   *
   * Set it where the empty state *is* the screen, and especially where the
   * screen is empty because the practice has not set it up yet: those are the
   * mornings somebody is genuinely asking what this is for.
   */
  explain?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
      {icon ? <span className="text-line-strong">{icon}</span> : null}
      <p className="max-w-md text-body text-ink-soft">{title}</p>
      {action}
      {explain ? <ExplainLink /> : null}
    </div>
  );
}
