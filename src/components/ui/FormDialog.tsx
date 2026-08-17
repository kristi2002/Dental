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
  /**
   * Called after the action succeeded, whether or not the browser gets round to
   * firing a `close` event.
   *
   * `onClose` is the DOM event and answers "the dialog went away" — which is not
   * the same question, fires on cancel too, and does not fire at all in every
   * environment. A caller that has to react to the *save* needs to be told about
   * the save.
   */
  onSuccess?: () => void;
  /**
   * Open the moment it mounts, and leave the trigger button out.
   *
   * For a dialog summoned by a gesture rather than a press — double-clicking an
   * empty slot on the calendar, say. The owner mounts it with a fresh `key` and
   * unmounts it on `onClose`, so the gesture is the button.
   */
  openOnMount?: boolean;
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
  onSuccess,
  openOnMount = false,
  wide = false,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const handledTs = useRef<number | undefined>(undefined);
  const titleId = useId();

  // Nobody wants to retype a visit because the slot clashed: a refusal leaves
  // the fields as they were typed. See `useRecoveredForm`.
  const { state, formAction, formRef } = useRecoveredForm(action);

  useEffect(() => {
    // `ts` rather than a boolean, for the reason `useRecoveredForm` uses it:
    // two saves in a row are two events, and the second must not be treated as
    // already handled.
    if (state.status !== 'ok' || state.ts === handledTs.current) return;
    handledTs.current = state.ts;
    if (resetOnSuccess) formRef.current?.reset();
    dialogRef.current?.close();
    onSuccess?.();
  }, [state, resetOnSuccess, formRef, onSuccess]);

  // Mount-time only, by design: re-opening is a remount with a new `key`, which
  // is also how the fields get the new slot's defaults.
  useEffect(() => {
    if (openOnMount) dialogRef.current?.showModal();
  }, [openOnMount]);

  return (
    <>
      {openOnMount ? null : (
        <button
          type="button"
          title={triggerTitle}
          className={triggerClassName}
          onClick={() => dialogRef.current?.showModal()}
        >
          {trigger}
        </button>
      )}

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
