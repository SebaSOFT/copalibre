import type { ReactNode, HTMLAttributes } from 'react';
import { spaceVar, type SpacingStep } from './spacing.js';

export interface BoxProps extends Omit<HTMLAttributes<HTMLDivElement>, 'style' | 'className'> {
  readonly children: ReactNode;
  /** Padding on all sides, a token-scale step. */
  readonly padding?: SpacingStep;
  readonly className?: string;
}

/**
 * The simplest layout primitive: a single element carrying only padding, a
 * token-scale step. Where a component's own external margin was set inline
 * (a bypass "a component never sets its own external margin" already
 * forbade but had no primitive to check against), the caller wraps it in a
 * `Box` instead.
 */
export function Box({ children, padding, className = '', ...rest }: BoxProps): React.JSX.Element {
  return (
    <div
      className={`cl-box ${className}`.trim()}
      style={padding ? { padding: spaceVar(padding) } : undefined}
      {...rest}
    >
      {children}
    </div>
  );
}
