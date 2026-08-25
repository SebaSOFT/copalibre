/**
 * Copied from shadcn/ui 2.3.0 (MIT) and rewritten onto CopaLibre's tokens.
 * See THIRD_PARTY_NOTICES.md.
 */
import type { TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly invalid?: boolean;
}

export function Textarea({
  invalid = false,
  disabled,
  className = '',
  ...rest
}: TextareaProps): React.JSX.Element {
  const state = disabled ? 'disabled' : invalid ? 'error' : 'default';
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={`cl-textarea cl-textarea--${state} cl-focusable ${className}`}
      disabled={disabled}
      {...rest}
    />
  );
}
