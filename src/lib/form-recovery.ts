'use client';

import { useActionState, useEffect, useRef } from 'react';
import { IDLE_STATE, type ActionState } from '@/lib/actions/types';

/**
 * `useActionState`, with the typed-in values put back after a refusal.
 *
 * React 19 clears an uncontrolled form once its action resolves. That is right
 * after a save and wrong after a refusal — nobody wants to retype a patient
 * because the phone number turned out to match somebody else's — so the
 * submitted values are kept and written back over the cleared fields.
 *
 * Attach the returned ref to the `<form>`; it is what the values are put back
 * into.
 */
export function useRecoveredForm(
  action: (state: ActionState, formData: FormData) => Promise<ActionState>,
) {
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef<FormData | null>(null);
  const restored = useRef<number | undefined>(undefined);

  const [state, formAction] = useActionState(
    async (previous: ActionState, formData: FormData) => {
      submitted.current = formData;
      return action(previous, formData);
    },
    IDLE_STATE,
  );

  useEffect(() => {
    // `ts` rather than a boolean: two refusals in a row are two events, and the
    // second must restore its own values rather than be treated as handled.
    if (state.status !== 'error' || state.ts === restored.current) return;
    restored.current = state.ts;

    const form = formRef.current;
    const values = submitted.current;
    if (!form || !values) return;

    for (const [name, value] of values.entries()) {
      // React's own action bookkeeping fields, and anything non-textual.
      if (name.startsWith('$') || typeof value !== 'string') continue;

      const field = form.elements.namedItem(name);
      if (
        (field instanceof HTMLInputElement && field.type !== 'checkbox' && field.type !== 'radio') ||
        field instanceof HTMLSelectElement ||
        field instanceof HTMLTextAreaElement
      ) {
        field.value = value;
      }
    }
  }, [state]);

  return { state, formAction, formRef };
}
