/**
 * Original composition — the explanation an authored decision carries,
 * rendered as persistent text rather than a tooltip: unreachable by keyboard
 * on most implementations, invisible on touch, and absent from the
 * accessible tree unless deliberately wired (design.md, "Rendered as
 * persistent text, never a tooltip").
 *
 * Renders nothing when there is no text — a field whose declaration carries
 * no description stays byte-identical to a wizard step authored before
 * descriptions existed. The caller binds `id` to its control's
 * `aria-describedby` so the explanation reaches the accessible description,
 * not just the visible page.
 */
export interface DecisionHintProps {
  readonly id: string;
  readonly text?: string;
}

export function DecisionHint({ id, text }: DecisionHintProps): React.JSX.Element | null {
  if (text === undefined || text.trim() === '') return null;
  return (
    <p className="cl-decision-hint" id={id}>
      {text}
    </p>
  );
}
