'use client';

import type { ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/utils';

export function SubmitButton({
  label,
  pendingLabel,
  className,
  disabled = false,
  name,
  value,
  variant = 'primary',
  icon,
  onClick,
}: {
  label: string;
  pendingLabel: string;
  className?: string;
  /** Blocks submission for reasons of the form's own, on top of the pending state. */
  disabled?: boolean;
  /**
   * Submitted alongside the fields when this is the button that was pressed —
   * how "save and add another" tells the action where to send you next. Two
   * buttons, one form, and the server decides rather than the browser.
   */
  name?: string;
  value?: string;
  /** The quieter of two submits, when a form has both. */
  variant?: 'primary' | 'secondary';
  /**
   * Run as the press starts, before the form is submitted.
   *
   * For the case `name`/`value` cannot serve: when it is the *client* that has
   * to know which of two submits was pressed, not the server. The periodontal
   * sweep is that case — both buttons write exactly the same reading through
   * exactly the same action, and the only difference is whether the dialog
   * closes afterwards or walks on to the next tooth.
   */
  onClick?: () => void;
  /**
   * Shown before the label, and dropped while pending — the spinner-less
   * "Saving…" is the whole feedback, and an icon left beside it reads as though
   * the button is still offering the thing it is already doing.
   */
  icon?: ReactNode;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name={name}
      value={value}
      onClick={onClick}
      className={cn('btn', variant === 'secondary' ? 'btn-secondary' : 'btn-primary', className)}
      disabled={pending || disabled}
    >
      {pending ? null : icon}
      {pending ? pendingLabel : label}
    </button>
  );
}
