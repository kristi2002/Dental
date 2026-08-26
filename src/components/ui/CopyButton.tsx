'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

/**
 * Put a value on the clipboard, and say so for two seconds.
 *
 * The acknowledgement is not decoration. `navigator.clipboard` is refused
 * outright in some contexts and fails silently when it is, so a button with no
 * feedback is one nobody can tell apart from one that worked — and the whole
 * reason this exists is to be the route that *does* work when `tel:` and
 * `mailto:` quietly do not. A copy button that might also be quietly doing
 * nothing would be no better than what it replaced.
 */
export function CopyButton({
  value,
  label,
  copiedLabel,
  className = 'btn btn-ghost btn-sm',
  iconSize = 16,
  showLabel = true,
  role,
}: {
  value: string;
  label: string;
  copiedLabel: string;
  className?: string;
  iconSize?: number;
  /** Off for the icon-only button that sits beside a value it would repeat. */
  showLabel?: boolean;
  role?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      role={role}
      className={className}
      // Always present, because with `showLabel` off this is the only name the
      // button has — and it changes to the confirmation, so a screen reader is
      // told the same thing the icon says.
      title={copied ? copiedLabel : label}
      aria-label={copied ? copiedLabel : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Refused by the browser. The value is on screen beside this button
          // either way, which is why this fails quietly rather than alarming
          // somebody about a thing they can still do by hand.
        }
      }}
    >
      {copied ? (
        <Check size={iconSize} aria-hidden className="shrink-0 text-ok" />
      ) : (
        <Copy size={iconSize} aria-hidden className="shrink-0" />
      )}
      {showLabel ? (copied ? copiedLabel : label) : null}
    </button>
  );
}
