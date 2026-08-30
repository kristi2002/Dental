'use client';

import { X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import type { ActionState } from '@/lib/actions/types';
import { isFormDirty } from '@/lib/form-dirty';
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
  /**
   * The question asked before a dialog with typing in it is thrown away.
   *
   * When set, closing a *dirty* form — Cancel, Escape, the ✕, or a click on
   * the backdrop — asks first. Unset, the dialog behaves exactly as it always
   * has.
   *
   * Opt-in rather than automatic, because most of these hold four fields picked
   * from selects and a confirmation on those would be a prompt in the way. It is
   * worth setting wherever somebody might have *written* something: a visit
   * note, a treatment plan, a message to a patient.
   */
  discardMessage?: string;
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
  discardMessage,
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

  /** See `isFormDirty`, which the page forms ask the same question of. */
  const isDirty = useCallback(() => isFormDirty(formRef.current), [formRef]);

  /** Close, unless there is unsaved typing and the person says to keep it. */
  const closeGuarded = useCallback(() => {
    if (discardMessage && isDirty() && !window.confirm(discardMessage)) return;
    dialogRef.current?.close();
  }, [discardMessage, isDirty]);

  /**
   * Escape, which is the way this is actually lost.
   *
   * A native `<dialog>` closes on Escape and there is nothing to hook but
   * `cancel` — which is fired *before* the close and can be prevented. Cancel,
   * the ✕ and the backdrop go through `closeGuarded` directly; this is the
   * fourth way out and the one nobody presses on purpose.
   */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !discardMessage) return;

    const onCancel = (event: Event) => {
      if (!isDirty()) return;
      event.preventDefault();
      if (window.confirm(discardMessage)) dialog.close();
    };

    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, [discardMessage, isDirty]);

  /**
   * And the backdrop, which is the second way.
   *
   * A modal `<dialog>` fills the viewport and its backdrop *is* the element, so
   * a click landing on the backdrop reports the dialog itself as its target —
   * the same trick `ReminderCenter` uses, and the reason this needs no
   * `stopPropagation` on the panel inside.
   */
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const onClick = (event: MouseEvent) => {
      if (event.target === dialog) closeGuarded();
    };

    dialog.addEventListener('click', onClick);
    return () => dialog.removeEventListener('click', onClick);
  }, [closeGuarded]);

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
              onClick={closeGuarded}
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
              {/* `closeGuarded`, like the ✕ and the backdrop and Escape. This
                  was the one way out that closed the dialog directly, which
                  made it the one way out that threw a half-written visit note
                  away without asking — and it is the button sitting next to
                  Save, so it is the way most people leave. */}
              <button type="button" className="btn btn-secondary" onClick={closeGuarded}>
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
