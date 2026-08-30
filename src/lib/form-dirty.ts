/**
 * Has anybody actually typed into this?
 *
 * Read off the DOM at the moment of leaving rather than tracked as state: these
 * are uncontrolled forms — that is the whole reason `useRecoveredForm` has to
 * put values back by hand — so there is no React state to compare against, and a
 * `dirty` flag hung off every `onChange` would be a second source of truth for
 * something the elements already know.
 *
 * Compared against `defaultValue` / `defaultChecked`, so a field the form opened
 * with does not count as typing. A `<select>` is deliberately left out: every one
 * in this app opens on a real default and changing it back and forth would leave
 * the form looking dirty when it says exactly what it started with.
 *
 * It lives in a module of its own because two different things ask the question
 * and they must not answer it differently: `FormDialog`, before Cancel, the ✕,
 * the backdrop or Escape throws a dialog away, and `FormActions`, before the
 * Cancel *link* navigates a full-page form away. The second used to ask nothing
 * at all — a half-filled treatment plan went in one click, with no prompt, while
 * the dialog beside it had guarded the same loss for months.
 */
export function isFormDirty(form: HTMLFormElement | null | undefined): boolean {
  if (!form) return false;

  for (const element of Array.from(form.elements)) {
    if (element instanceof HTMLInputElement) {
      // A file input has no `defaultValue` worth comparing — anything chosen is
      // by definition something somebody chose.
      if (element.type === 'file') {
        if (element.files && element.files.length > 0) return true;
        continue;
      }
      if (element.type === 'checkbox' || element.type === 'radio') {
        if (element.checked !== element.defaultChecked) return true;
        continue;
      }
      if (element.value !== element.defaultValue) return true;
    } else if (element instanceof HTMLTextAreaElement) {
      // The one that matters most: a visit write-up is the longest text anybody
      // types into this app, and it lives in one of these.
      if (element.value !== element.defaultValue) return true;
    }
  }

  return false;
}
