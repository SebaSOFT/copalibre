import { EntrantName } from '../../../ui/atoms/EntrantName.js';
import { formatPlacementSource } from '../../../../lib/side-source.js';
import { toNode, toRounds } from '../../../../lib/bracket.js';
import type { BracketZone } from '../../../../lib/bracket-projection.js';
import type { TvDashboardLabels } from '../../tv-types.js';

export function TvBracketView({
  zones,
  labels,
}: {
  readonly zones: readonly BracketZone[];
  readonly labels: TvDashboardLabels;
}): React.JSX.Element {
  return (
    <section aria-label={labels.bracketTab} className="tv-bracket" data-testid="tv-bracket">
      {zones.map((zone, zoneIndex) => (
        <div className="tv-bracket__zone" key={zone.zoneId ?? zoneIndex}>
          {zone.zoneName && <h3 className="tv-bracket__zone-name">{zone.zoneName}</h3>}
          {toRounds(zone.matches).map((round) => (
            <div className="tv-bracket__round" key={`${round.branch}-${round.roundNumber}`}>
              <h4 className="tv-bracket__round-name">
                {round.branch} · {labels.bracketRound} {round.roundNumber}
              </h4>
              <div className="tv-bracket__matches">
                {round.matches.map((match) => {
                  const node = toNode(match, labels.resultState, labels.sideSource);
                  return (
                    <article
                      aria-label={`${labels.bracketMatch} ${match.matchNumber}`}
                      className="tv-bracket-card cl-chamfer cl-chamfer--control"
                      key={match.matchId ?? match.matchNumber}
                    >
                      <div className="tv-bracket-card__header">
                        <span>
                          {match.role
                            ? formatPlacementSource(match.role, labels.sideSource)
                            : `${labels.bracketMatch} ${match.matchNumber}`}
                        </span>
                        <span>{node.badge.label}</span>
                      </div>
                      {node.slots.map((slot, index) => (
                        <div
                          className="tv-bracket-card__slot"
                          key={`${index}-${slot.entrantId ?? slot.label}`}
                        >
                          <EntrantName
                            className="tv-bracket-card__name"
                            compact
                            pending={slot.pending}
                            fullName={slot.label}
                            abbreviation={slot.abbreviation}
                          />
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
