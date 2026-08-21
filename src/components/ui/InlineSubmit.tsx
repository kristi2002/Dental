'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

/**
 * A submit button for the small inline verbs that disables itself while its
 * form is in flight.
 *
 * `SubmitButton` does this for the big labelled ones and swaps the label for a
 * pending word; that is right on a dialog's *Save* and wrong on a 48-pixel
 * square with a minus sign in it, which has no label to swap and must not
 * change size while somebody's thumb is on it. So this keeps the appearance
 * exactly and only stops accepting a second press.
 *
 * **Why it matters more here than on a dialog.** React does not block a second
 * submit while an action is in flight, and around seventy of these inline forms
 * pass a plain `<button type="submit">`. Most are idempotent — a delete, a
 * status change — and a second press lands on a row that is already gone. The
 * stock steppers are not: `adjustStock` applies a **relative** delta, so on the
 * materials list two taps on the minus square book out two boxes and the shelf
 * count is quietly wrong. Every screen in this app is built for a tablet at
 * reception, which is exactly where a slow response gets tapped twice.
 *
 * The pattern already existed correctly twice — `SubmitButton` and
 * `TakeOutForm`'s own `TakeOutButton` — and this is that pattern given a name
 * so the next inline verb gets it without anybody having to notice.
 *
 * Must be rendered *inside* the `<form>`: `useFormStatus` reports the status of
 * the form above it, and a button outside one always reads as idle.
 */
export function InlineSubmit({
  children,
  className,
  title,
  srLabel,
  disabled = false,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  /** Visible-to-screen-readers name, for the icon-only cases. */
  srLabel?: string;
  /** A reason of the caller's own — short stock, no permission — ORed with pending. */
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={className}
      title={title}
      disabled={pending || disabled}
      // While a press is being served, the button is not offering anything.
      // Announced rather than merely greyed, since the visual change here is
      // deliberately slight.
      aria-busy={pending || undefined}
    >
      {children}
      {srLabel ? <span className="sr-only">{srLabel}</span> : null}
    </button>
  );
}
