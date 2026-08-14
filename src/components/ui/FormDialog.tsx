'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { ActionState } from '@/lib/actions/types';
import { useRecoveredForm } from '@/lib/form-recovery';
import { cn } from '@/lib/utils';
import { SubmitButton } from './SubmitButton';

type Props = {
  /** Contents of the button that opens the dialog. */
  trigger: ReactNode;
  /** Full class list for the trigger button — replaces the default styling. */
  triggerClassName?: string;
  triggerTitle?: string;
  title: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  /** A function form receives the action state, for fields that react to an error. */
  children: ReactNode | ((state: ActionState) => ReactNode);
  submitLabel: string;
  pendingLabel: string;
  cancelLabel: string;
  closeLabel: string;
  /** Clear the fields after a successful save — right for "new", wrong for "edit". */
  resetOnSuccess?: boolean;
  /** Called whenever the dialog closes, so callers can reset their own state. */
  onClose?: () => void;
  wide?: boolean;
};

export function FormDialog({
  trigger,
  triggerClassName = 'btn btn-primary',
  triggerTitle,
  title,
  action,
  children,
  submitLabel,
  pendingLabel,
  cancelLabel,
  closeLabel,
  resetOnSuccess = true,
  onClose,
  wide = false,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const handledTs = useRef<number | undefined>(undefined);
  const titleId = useId();

  // Nobody wants to retype a visit because the slot clashed: a refusal leaves
  // the fields as they were typed. See `useRecoveredForm`.
  const { state, formAction, formRef } = useRecoveredForm(action);

  useEffect(() => {
    if (state.status !== 'ok' || state.ts === handledTs.current) return;
    handledTs.current = state.ts;
    if (resetOnSuccess) formRef.current?.reset();
    dialogRef.current?.close();
  }, [state, resetOnSuccess, formRef]);

  return (
    <>
      <button
        type="button"
        title={triggerTitle}
        className={triggerClassName}
        onClick={() => dialogRef.current?.showModal()}
      >
        {trigger}
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={onClose}
        className={cn(
          'm-auto w-[min(92vw,34rem)] max-h-[88vh] overflow-visible rounded-[var(--radius-card)]',
          'border border-line bg-surface p-0 text-ink shadow-pop',
          wide && 'w-[min(94vw,52rem)]',
        )}
      >
        <div className="flex max-h-[88vh] flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
            <h2 id={titleId} className="text-xl font-bold">
              {title}
            </h2>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-label={closeLabel}
              onClick={() => dialogRef.current?.close()}
            >
              <X size={20} aria-hidden />
            </button>
          </header>

          <form ref={formRef} action={formAction} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {typeof children === 'function' ? children(state) : children}
              {state.status === 'error' ? (
                <p
                  role="alert"
                  className="rounded-lg border border-danger bg-danger-soft px-3 py-2 font-semibold text-danger"
                >
                  {state.message}
                </p>
              ) : null}
            </div>

            <footer className="flex items-center justify-end gap-3 border-t border-line px-5 py-4">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => dialogRef.current?.close()}
              >
                {cancelLabel}
              </button>
              <SubmitButton label={submitLabel} pendingLabel={pendingLabel} />
            </footer>
          </form>
        </div>
      </dialog>
    </>
  );
}
