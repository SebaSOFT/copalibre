import { toNode, toRounds } from '../../../../lib/bracket.js';
import type { BracketZone } from '../../../../lib/bracket-projection.js';
import type { TvDashboardLabels } from '../../tv-types.js';

/**
 * The matches of the zones that play a league rather than a bracket, grouped by round: a league
 * zone has no tree to draw, but its audience still wants to see who plays whom and how it ended.
 * Composed like `TvBracketView` — same cards, same `--tv-*` tokens — so the two read as one family.
 */
export function TvLeagueFixtures({
  zones,
  labels,
}: {
  readonly zones: readonly BracketZone[];
  readonly labels: TvDashboardLabels;
}): React.JSX.Element {
  return (
    <section aria-label={labels.fixturesTab} className="tv-fixtures" data-testid="tv-fixtures">
      {zones.map((zone, zoneIndex) => (
        <div className="tv-fixtures__zone" key={zone.zoneId ?? zoneIndex}>
          {zone.zoneName && <h3 className="tv-fixtures__zone-name">{zone.zoneName}</h3>}
          {toRounds(zone.matches).map((round) => (
            <div className="tv-fixtures__round" key={`${round.branch}-${round.roundNumber}`}>
              <h4 className="tv-fixtures__round-name">
                {labels.bracketRound} {round.roundNumber}
              </h4>
              <div className="tv-fixtures__matches">
                {round.matches.map((match) => {
                  const node = toNode(match, labels.resultState);
                  return (
                    <article
                      aria-label={`${labels.bracketMatch} ${match.matchNumber}`}
                      className="tv-bracket-card cl-chamfer cl-chamfer--control"
                      key={match.matchId ?? match.matchNumber}
                    >
                      <div className="tv-bracket-card__header">
                        <span>
                          {labels.bracketMatch} {match.matchNumber}
                        </span>
                        <span>{node.badge.label}</span>
                      </div>
                      {node.slots.map((slot, index) => (
                        <div
                          className="tv-bracket-card__slot"
                          key={`${index}-${slot.entrantId ?? slot.label}`}
                        >
                          <span className="tv-bracket-card__name" title={slot.label}>
                            {slot.abbreviation ?? slot.label}
                          </span>
                          {slot.score !== undefined && (
                            <strong className="tv-bracket-card__score">{slot.score}</strong>
                          )}
                        </div>
                      ))}
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
