import { cn } from '@/lib/utils';

export type FieldWrapper = {
  label: string;
  hint?: string;
  optional?: string;
  className?: string;
  /**
   * Keep the label for screen readers but not on screen — for the one place a
   * heading directly above the field already says the same words, and printing
   * them twice reads as a mistake.
   */
  labelHidden?: boolean;
};

/**
 * The words above a field: its name, whether it is optional, and any sentence
 * of explanation.
 *
 * Its own module rather than a private helper of `Field`, because the date
 * field has to render the identical thing and lives in a file of its own —
 * `Field` reaches for `DateField` and `DateField` would have had to reach back.
 */
export function FieldLabel({
  htmlFor,
  id,
  label,
  hint,
  optional,
  labelHidden,
}: FieldWrapper & {
  htmlFor: string;
  /** Only where something other than the field itself has to point at it. */
  id?: string;
}) {
  return (
    <>
      <label
        id={id}
        className={cn('field-label', labelHidden && 'sr-only')}
        htmlFor={htmlFor}
      >
        {label}
        {optional ? (
          <span className="ml-1.5 font-normal text-ink-faint">({optional})</span>
        ) : null}
      </label>
      {hint ? <p className="mb-1.5 text-meta text-ink-soft">{hint}</p> : null}
    </>
  );
}
