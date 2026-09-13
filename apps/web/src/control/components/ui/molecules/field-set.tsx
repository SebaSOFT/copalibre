import type { ReactNode } from 'react';

export interface FieldSetProps {
  readonly legend: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/** Owns the `<fieldset>`/`<legend>` pair, so a group of related fields composes it instead of rendering the pair from scratch. */
export function FieldSet({ legend, children, className = '' }: FieldSetProps): React.JSX.Element {
  return (
    <fieldset className={`cl-fieldset ${className}`.trim()}>
      <legend className="cl-fieldset__legend">{legend}</legend>
      {children}
    </fieldset>
  );
}
