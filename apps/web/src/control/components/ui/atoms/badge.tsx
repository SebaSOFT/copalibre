/**
 * Copied from shadcn/ui 2.3.0 (MIT) and rewritten onto CopaLibre's tokens.
 * See THIRD_PARTY_NOTICES.md.
 */
import type { HTMLAttributes } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Required: a badge is a colour *and* a word. */
  readonly label: string;
}

export function Badge({ label, className = '', ...rest }: BadgeProps): React.JSX.Element {
  return (
    <span className={`cl-badge ${className}`} {...rest}>
      {label}
    </span>
  );
}
