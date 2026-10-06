import type { ReactNode } from 'react';

/** Presentation shell for a rule whose GIVEN execution context comes from the system. */
export function VisualRuleBuilder({
  givenLabel,
  given,
  whenLabel,
  when,
  thenLabel,
  then,
}: {
  readonly givenLabel: string;
  readonly given: ReactNode;
  readonly whenLabel: string;
  readonly when: ReactNode;
  readonly thenLabel: string;
  readonly then: ReactNode;
}): React.JSX.Element {
  return (
    <section
      aria-label={`${givenLabel}, ${whenLabel}, ${thenLabel}`}
      className="cl-visual-rule-builder"
    >
      <div className="cl-visual-rule-builder__given">
        <strong>{givenLabel}</strong>
        <span>{given}</span>
      </div>
      <div className="cl-visual-rule-builder__logic">
        <section
          aria-label={whenLabel}
          className="cl-visual-rule-builder__block cl-visual-rule-builder__block--when"
        >
          <h3>{whenLabel}</h3>
          {when}
        </section>
        <section
          aria-label={thenLabel}
          className="cl-visual-rule-builder__block cl-visual-rule-builder__block--then"
        >
          <h3>{thenLabel}</h3>
          {then}
        </section>
      </div>
    </section>
  );
}
