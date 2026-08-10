'use client';

import { useFormStatus } from 'react-dom';
import { cn } from '@/lib/utils';

export function SubmitButton({
  label,
  pendingLabel,
  className,
}: {
  label: string;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={cn('btn btn-primary', className)} disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}
