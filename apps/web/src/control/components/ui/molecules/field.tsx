/**
 * Label + control-atom slot + help/error text (openspec 0225 task 2.2: the
 * `Field` molecule, renamed and given a `required` indicator; `Label`
 * moves from a component with one consumer to this molecule's internal).
 * The control-web-shell "no state below organism" rule (design.md Decision 7):
 * this molecule receives everything via props, it fetches nothing.
 *
 * CSS classes stay `cl-form-field*` across the rename — several screens
 * (`StandingsTemplate.tsx`, `ImageCropModal.tsx`) already compose that class
 * name directly for a paragraph this molecule does not own, and renaming it
 * would turn those into ownership violations for no behavioral reason.
 */
import type { ReactNode } from 'react';
import { Label } from '../atoms/label.js';

export interface FieldProps {
  readonly id: string;
  readonly label: string;
  /** The control atom itself — Input/Select/Textarea/Checkbox — given `id` and, when erroring, `aria-describedby`. */
  readonly children: ReactNode;
  readonly helpText?: string;
  readonly errorText?: string;
  /** Shows a required indicator beside the label. Purely visual — the caller's own control still carries the real `required` attribute. */
  readonly required?: boolean;
}

export function Field({
  id,
  label,
  children,
  helpText,
  errorText,
  required = false,
}: FieldProps): React.JSX.Element {
  return (
    <div className="cl-form-field">
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="cl-form-field__required">
            {' '}
            *
          </span>
        ) : null}
      </Label>
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
