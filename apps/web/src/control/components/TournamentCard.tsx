import { LIFECYCLE_PRESENTATION, type TournamentCard as CardModel } from '../lib/dashboard.js';

/**
 * One tournament on the dashboard (0022).
 *
 * The accent bar is the state's colour and the badge is its word. Both, always
 * — an operator scanning twenty cards in a noisy venue is exactly the person a
 * colour-only cue fails.
 */
export function TournamentCard({ card }: { readonly card: CardModel }): React.JSX.Element {
  const presentation = LIFECYCLE_PRESENTATION[card.lifecycle];

  return (
    <article className={`cl-card cl-chamfer cl-chamfer--control ${presentation.accent}`}>
      <span className="cl-badge" data-testid="lifecycle">
        {presentation.label}
      </span>
      <h3>{card.name}</h3>
      <dl>
        <dt>Partidos hoy</dt>
        <dd className="cl-stat-tile__value">{card.matchesToday}</dd>
        <dt>Inscripciones pendientes</dt>
        <dd className="cl-stat-tile__value">{card.pendingRegistrations}</dd>
      </dl>
    </article>
  );
}
