/**
 * Original composition (0141) — label + control-atom slot + help/error text.
 * The control-web-shell "no state below organism" rule (design.md Decision 7):
 * this molecule receives everything via props, it fetches nothing.
 */
import type { ReactNode } from 'react';
import { Label } from '../atoms/label.js';

export interface FormFieldProps {
  readonly id: string;
  readonly label: string;
  /** The control atom itself — Input/Select/Textarea/Checkbox — given `id` and, when erroring, `aria-describedby`. */
  readonly children: ReactNode;
  readonly helpText?: string;
  readonly errorText?: string;
}

export function FormField({
  id,
  label,
  children,
  helpText,
  errorText,
}: FormFieldProps): React.JSX.Element {
  return (
    <div className="cl-form-field">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {errorText ? (
        <p className="cl-form-field__error" id={`${id}-error`} role="alert">
          {errorText}
        </p>
      ) : helpText ? (
        <p className="cl-form-field__help" id={`${id}-help`}>
          {helpText}
        </p>
      ) : null}
    </div>
  );
}
