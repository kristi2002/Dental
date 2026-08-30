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
 * "Values" includes the boxes. It did not until recently, and the gap was the
 * quiet kind: the text came back and the ticks did not, so a refusal that was
 * corrected and saved went in with a flag nobody knew they had lost.
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

    /**
     * The boxes, which the loop above cannot do and used to simply drop.
     *
     * A ticked box was lost on every refusal while every field around it came
     * back — tick **Urgent**, hit a clash, correct the date, save, and the case
     * is quietly no longer urgent. `UrgentToggle` is uncontrolled *because* this
     * function was believed to restore it; it did not.
     *
     * It has to be driven from the elements rather than from the `FormData`,
     * which is the reason it was left out: an unticked box posts nothing at all,
     * so the absence of a name is itself the answer, and a loop over what *was*
     * posted can never turn a box back off. So collect what each name submitted,
     * then ask every box and radio in the form whether its own value is in
     * there.
     */
    const posted = new Map<string, Set<string>>();
    for (const [name, value] of values.entries()) {
      if (name.startsWith('$') || typeof value !== 'string') continue;
      const seen = posted.get(name);
      if (seen) seen.add(value);
      else posted.set(name, new Set([value]));
    }

    for (const element of Array.from(form.elements)) {
      if (!(element instanceof HTMLInputElement)) continue;
      if (element.type !== 'checkbox' && element.type !== 'radio') continue;
      if (!element.name) continue;

      // `value` reads back as `"on"` when the attribute is absent, which is
      // exactly what such a box posts — so this is the string to look for
      // either way, and the group's own values sort themselves out when several
      // boxes share a name.
      element.checked = posted.get(element.name)?.has(element.value) ?? false;
    }
  }, [state]);

  return { state, formAction, formRef };
}
