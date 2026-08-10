'use client';

import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/utils';

export function SubmitButton({
  label,
  pendingLabel,
  className,
  disabled = false,
}: {
  label: string;
  pendingLabel: string;
  className?: string;
  /** Blocks submission for reasons of the form's own, on top of the pending state. */
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className={cn('btn btn-primary', className)}
      disabled={pending || disabled}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
