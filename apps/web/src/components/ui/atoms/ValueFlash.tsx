import type { HTMLAttributes } from 'react';
import { useValueFlash } from '../../../lib/use-value-flash.js';

export interface ValueFlashProps extends HTMLAttributes<HTMLSpanElement> {
  readonly value: number | string | null | undefined;
}

/** A tabular value that briefly marks an update without shifting its layout. */
export function ValueFlash({ value, className = '', ...rest }: ValueFlashProps): React.JSX.Element {
  const flashing = useValueFlash(value);
  const classes = [className, flashing ? 'cl-flash-on-change' : ''].filter(Boolean).join(' ');

  return (
    <span className={classes} {...rest}>
      {value ?? '—'}
    </span>
  );
}
