import type { ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

function Label({
  htmlFor,
  label,
  hint,
  optional,
  labelHidden,
}: {
  htmlFor: string;
  label: string;
  hint?: string;
  optional?: string;
  labelHidden?: boolean;
}) {
  return (
    <>
      <label className={cn('field-label', labelHidden && 'sr-only')} htmlFor={htmlFor}>
        {label}
        {optional ? (
          <span className="ml-1.5 font-normal text-ink-faint">({optional})</span>
        ) : null}
      </label>
      {hint ? <p className="mb-1.5 text-[0.9rem] text-ink-soft">{hint}</p> : null}
    </>
  );
}

type FieldWrapper = {
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

export function TextField({
  label,
  hint,
  optional,
  className,
  labelHidden,
  id,
  ...props
}: FieldWrapper & InputHTMLAttributes<HTMLInputElement> & { id: string }) {
  return (
    <div className={className}>
      <Label htmlFor={id} label={label} hint={hint} optional={optional} labelHidden={labelHidden} />
      <input id={id} className="field-input" {...props} />
    </div>
  );
}

export function TextAreaField({
  label,
  hint,
  optional,
  className,
  labelHidden,
  id,
  ...props
}: FieldWrapper & TextareaHTMLAttributes<HTMLTextAreaElement> & { id: string }) {
  return (
    <div className={className}>
      <Label htmlFor={id} label={label} hint={hint} optional={optional} labelHidden={labelHidden} />
      <textarea id={id} className={cn('field-input', 'min-h-24 resize-y')} {...props} />
    </div>
  );
}

export function SelectField({
  label,
  hint,
  optional,
  className,
  labelHidden,
  id,
  children,
  ...props
}: FieldWrapper &
  SelectHTMLAttributes<HTMLSelectElement> & { id: string; children: ReactNode }) {
  return (
    <div className={className}>
      <Label htmlFor={id} label={label} hint={hint} optional={optional} labelHidden={labelHidden} />
      <select id={id} className="field-input" {...props}>
        {children}
      </select>
    </div>
  );
}
