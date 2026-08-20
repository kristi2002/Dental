import type { ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { DateField } from './DateField';
import { FieldLabel, type FieldWrapper } from './FieldLabel';

export function TextField({
  label,
  hint,
  optional,
  className,
  labelHidden,
  id,
  ...props
}: FieldWrapper & InputHTMLAttributes<HTMLInputElement> & { id: string }) {
  // A date is still asked for as `<TextField type="date">` everywhere it is
  // asked for, and still posts the same `YYYY-MM-DD`. Routed here rather than
  // at the seventeen call sites so that which calendar opens is one decision:
  // see `DateField`, which keeps the native input and only replaces the popup.
  if (props.type === 'date') {
    return (
      <DateField
        {...props}
        id={id}
        label={label}
        hint={hint}
        optional={optional}
        className={className}
        labelHidden={labelHidden}
      />
    );
  }

  return (
    <div className={className}>
      <FieldLabel
        htmlFor={id}
        label={label}
        hint={hint}
        optional={optional}
        labelHidden={labelHidden}
      />
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
      <FieldLabel
        htmlFor={id}
        label={label}
        hint={hint}
        optional={optional}
        labelHidden={labelHidden}
      />
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
      <FieldLabel
        htmlFor={id}
        label={label}
        hint={hint}
        optional={optional}
        labelHidden={labelHidden}
      />
      <select id={id} className="field-input" {...props}>
        {children}
      </select>
    </div>
  );
}
