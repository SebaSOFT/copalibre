/**
 * Copied from shadcn/ui 2.3.0 (MIT) and rewritten onto CopaLibre's tokens.
 * See THIRD_PARTY_NOTICES.md.
 */
import type { HTMLAttributes } from 'react';

export function Card({
  className = '',
  ...rest
}: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={`cl-card cl-chamfer cl-chamfer--control ${className}`} {...rest} />;
}
