import type { FormEvent, ReactNode } from 'react';

export interface FormProps {
  readonly children: ReactNode;
  readonly onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  readonly noValidate?: boolean;
  readonly className?: string;
  /** So a submit button living outside the form (a modal's footer) can target it via HTML's `form` attribute. */
  readonly id?: string;
  readonly 'aria-label'?: string;
  readonly 'aria-labelledby'?: string;
}

/** Owns the `<form>` element, so a screen composes it instead of rendering one from scratch. */
export function Form({
  children,
  onSubmit,
  noValidate,
  className = '',
  ...rest
}: FormProps): React.JSX.Element {
  return (
    <form
      className={`cl-form ${className}`.trim()}
      noValidate={noValidate}
      onSubmit={onSubmit}
      {...rest}
    >
      {children}
    </form>
  );
}
