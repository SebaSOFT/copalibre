import type { TournamentFact } from '../../lib/tv-statistics.js';

/**
 * Extracted from `TvDashboard.tsx` (openspec 0225 task 7.1) — the rotating
 * rail's tournament-facts tab.
 */
export function TvFactsView({
  facts,
}: {
  readonly facts: readonly TournamentFact[];
}): React.JSX.Element {
  return (
    <div className="tv-facts-grid">
      {facts.map((fact) => (
        <div className="tv-fact-tile cl-chamfer" key={fact.label}>
          <span className="tv-fact-tile__label">{fact.label}</span>
          <span className="tv-fact-tile__value">{fact.value}</span>
          {fact.detail && <span className="tv-fact-tile__detail">{fact.detail}</span>}
        </div>
      ))}
    </div>
  );
}
