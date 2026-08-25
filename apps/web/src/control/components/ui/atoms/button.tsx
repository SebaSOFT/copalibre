/**
 * Copied from shadcn/ui 2.3.0 (MIT) and rewritten onto CopaLibre's tokens.
 * See THIRD_PARTY_NOTICES.md.
 */
import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'destructive-outline';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
}

export function Button({
  variant = 'primary',
  className = '',
  ...rest
}: ButtonProps): React.JSX.Element {
  // Native <button>, always: a div with a click handler is a control a keyboard
  // cannot reach and a screen reader cannot name.
  return <button className={`cl-btn cl-btn--${variant} cl-focusable ${className}`} {...rest} />;
}
