'use client';

import { useActionState, type ReactNode } from 'react';
import { IDLE_STATE, type ActionState } from '@/lib/actions/types';

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  /** Hidden fields sent with the request, e.g. the record id. */
  values: Record<string, string | number>;
  children: ReactNode;
  /**
   * Replaces the form's own layout, rather than adding to it. `inline` is right
   * for a button in a row of buttons and wrong for a row in a menu, and the two
   * cannot both be set — whichever `display` utility Tailwind happened to emit
   * last would decide, which is not a thing a caller can read off the page.
   */
  className?: string;
  /** When set, the browser asks for confirmation before the action runs. */
  confirmMessage?: string;
};

/**
 * A one-button form around a server action — used for the small inline verbs
 * (delete, adjust stock, mark completed) that don't deserve a dialog.
 */
export function ActionForm({ action, values, children, className, confirmMessage }: Props) {
  return (
    <form
      action={action}
      className={className ?? 'inline'}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {Object.entries(values).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
    </form>
  );
}

/**
 * The same one-button form, for an action that can refuse.
 *
 * `ActionForm` above posts and forgets: its action returns nothing, so a press
 * that was denied for want of a permission, or that lost a race with somebody
 * else's delete, looks exactly like one that worked — the button flickers, the
 * page comes back unchanged, and the only record of the refusal is a line in the
 * audit trail nobody is reading. That is fine for a verb whose result is
 * obvious on the page a moment later and wrong for one whose result is that
 * nothing happened.
 *
 * The message lands after the button and is allowed to wrap onto its own line;
 * every row these sit in is already a `flex-wrap`, so a refusal pushes the row
 * taller rather than sideways off the card.
 */
export function ReportingActionForm({
  action,
  values,
  children,
  className,
  confirmMessage,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  values: Record<string, string | number>;
  children: ReactNode;
  className?: string;
  confirmMessage?: string;
}) {
  const [state, formAction] = useActionState(action, IDLE_STATE);

  return (
    <form
      action={formAction}
      // One `display` utility per branch, never two in one list: Tailwind emits
      // them in its own order, so `inline contents` would be decided by the
      // stylesheet rather than by this component. See `ActionForm` above.
      className={
        state.status === 'error'
          ? 'inline-flex max-w-full flex-wrap items-center gap-1.5'
          : (className ?? 'inline')
      }
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {Object.entries(values).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      {state.status === 'error' ? (
        <span
          role="alert"
          className="ml-1.5 rounded-md bg-danger-soft px-2 py-0.5 text-[0.85rem] font-semibold text-danger"
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
