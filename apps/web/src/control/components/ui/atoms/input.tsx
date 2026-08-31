/**
 * Copied from shadcn/ui 2.3.0 (MIT) and rewritten onto CopaLibre's tokens.
 * See THIRD_PARTY_NOTICES.md.
 */
import type { InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Renders the `error` state token set; pair with `aria-describedby`/`aria-invalid`. */
  readonly invalid?: boolean;
}

export function Input({
  invalid = false,
  disabled,
  className = '',
  ...rest
}: InputProps): React.JSX.Element {
  const state = disabled ? 'disabled' : invalid ? 'error' : 'default';
  return (
    <input
      aria-invalid={invalid || undefined}
      className={`cl-input cl-input--${state} cl-focusable ${className}`}
      disabled={disabled}
      {...rest}
    />
  );
}
