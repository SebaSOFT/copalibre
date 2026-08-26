/**
 * Original composition — a read-only label/value pair for a detail
 * screen (a person's profile, a registration's submitted data). Extracted
 * from duplicate inline definitions in `PersonProfileRoute.tsx` and
 * `RegistrationReviewPage.tsx`: single-use in each host screen does not make
 * it a "page" concern — it is the same reusable-shaped molecule wherever it
 * appears (design.md Decision 7's props-only rule applies here too).
 */
export interface FieldValueProps {
  readonly label: string;
  readonly value: string;
}

export function FieldValue({ label, value }: FieldValueProps): React.JSX.Element {
  return (
    <div className="cl-field-value">
      <span className="cl-field-value__label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
