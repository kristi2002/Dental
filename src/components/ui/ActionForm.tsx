'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  /** Hidden fields sent with the request, e.g. the record id. */
  values: Record<string, string | number>;
  children: ReactNode;
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
      className={cn('inline', className)}
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
