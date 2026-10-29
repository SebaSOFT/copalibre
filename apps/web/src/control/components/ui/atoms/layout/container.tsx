import type { HTMLAttributes } from 'react';

export type ContainerVariant = 'control' | 'form';

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  readonly variant: ContainerVariant;
}

export function Container({
  children,
  className = '',
  variant,
  ...rest
}: ContainerProps): React.JSX.Element {
  return (
    <div className={`cl-container cl-container--${variant} ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}
