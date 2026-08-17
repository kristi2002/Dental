'use client';

import type { ReactNode } from 'react';

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
