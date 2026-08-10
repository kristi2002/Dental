import type { ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

function Label({
  htmlFor,
  label,
  hint,
  optional,
}: {
  htmlFor: string;
  label: string;
  hint?: string;
  optional?: string;
}) {
  return (
    <>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {optional ? (
          <span className="ml-1.5 font-normal text-ink-faint">({optional})</span>
        ) : null}
      </label>
      {hint ? <p className="mb-1.5 text-[0.9rem] text-ink-soft">{hint}</p> : null}
    </>
  );
}

type FieldWrapper = { label: string; hint?: string; optional?: string; className?: string };

export function TextField({
  label,
  hint,
  optional,
  className,
  id,
  ...props
}: FieldWrapper & InputHTMLAttributes<HTMLInputElement> & { id: string }) {
  return (
    <div className={className}>
      <Label htmlFor={id} label={label} hint={hint} optional={optional} />
      <input id={id} className="field-input" {...props} />
    </div>
  );
}

export function TextAreaField({
  label,
  hint,
  optional,
  className,
  id,
  ...props
}: FieldWrapper & TextareaHTMLAttributes<HTMLTextAreaElement> & { id: string }) {
  return (
    <div className={className}>
      <Label htmlFor={id} label={label} hint={hint} optional={optional} />
      <textarea id={id} className={cn('field-input', 'min-h-24 resize-y')} {...props} />
    </div>
  );
}

export function SelectField({
  label,
  hint,
  optional,
  className,
  id,
  children,
  ...props
}: FieldWrapper &
  SelectHTMLAttributes<HTMLSelectElement> & { id: string; children: ReactNode }) {
  return (
    <div className={className}>
      <Label htmlFor={id} label={label} hint={hint} optional={optional} />
      <select id={id} className="field-input" {...props}>
        {children}
      </select>
    </div>
  );
}
