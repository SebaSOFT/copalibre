import { EntrantName } from '../../../ui/atoms/EntrantName.js';
import {
  formatOverallPlaceFromTemplate,
  formatPlacement,
  formatPlacementSource,
  placementOf,
} from '../../../../lib/side-source.js';
import { toNode, toRounds, type BracketRound } from '../../../../lib/bracket.js';
import type { BracketZone } from '../../../../lib/bracket-projection.js';
import type { TvDashboardLabels } from '../../tv-types.js';

function appendOverallPlace(
  base: string | undefined,
  place: number | undefined,
  overallPlaceOffset: number | undefined,
  labels: TvDashboardLabels,
): string | undefined {
  if (base === undefined || place === undefined || overallPlaceOffset === undefined) return base;
  if (!labels.overallPlace) return base;
  const suffix = formatOverallPlaceFromTemplate(
    labels.overallPlace,
    overallPlaceOffset + place,
    labels.sideSource,
  );
  return `${base} · ${suffix}`;
}

export function tvBracketBranchLabel(
  branch: string,
  zoneName: string | undefined,
  labels: TvDashboardLabels,
): string {
  switch (branch) {
    case 'winner':
    case 'winners':
      return zoneName?.trim() || labels.bracketBranch.winners;
    case 'loser':
    case 'losers':
      return labels.bracketBranch.losers;
    case 'grand-final':
      return labels.bracketBranch.grandFinal;
    case 'placement':
      return labels.bracketBranch.placement;
    default:
      return /^(?:pl\d+|placement)/.test(branch) ? labels.bracketBranch.placement : branch;
  }
}

export function tvBracketRoundTitle(
  round: BracketRound,
  rounds: readonly BracketRound[],
  labels: TvDashboardLabels,
  overallPlaceOffset?: number,
): string {
  if (round.branch === 'placement' || /^(?:pl\d+|placement)/.test(round.branch)) {
    const zoneNodeKeys = rounds.flatMap((entry) => entry.matches.map((match) => match.nodeKey));
    const placements = new Set<string>();
    for (const match of round.matches) {
      const placement =
        placementOf(match.nodeKey, zoneNodeKeys) ??
        (match.role ? placementOf(match.role, zoneNodeKeys) : undefined);
      if (placement !== undefined) {
        const base = formatPlacement(placement, labels.sideSource);
        const label =
          placement.to === undefined
            ? (appendOverallPlace(base, placement.from, overallPlaceOffset, labels) ?? base)
            : base;
        placements.add(label);
      } else if (match.role) {
        const single = /^(?:placement|place)-(\d+)$/.exec(match.role);
        const base = formatPlacementSource(match.role, labels.sideSource, {
          siblingKeys: zoneNodeKeys,
        });
        const label = appendOverallPlace(
          base,
          single ? Number(single[1]) : undefined,
          overallPlaceOffset,
          labels,
        );
        if (label !== undefined) placements.add(label);
      }
    }
    if (placements.size > 0) return [...placements].join(' · ');
    return `${labels.bracketRound} ${round.roundNumber}`;
  }

  const branchRounds = rounds
    .filter((candidate) => candidate.branch === round.branch)
    .sort((left, right) => left.roundNumber - right.roundNumber);
  const index = branchRounds.findIndex((candidate) => candidate.roundNumber === round.roundNumber);
  const roundsRemaining = branchRounds.length - index;
  if (roundsRemaining === 1) return labels.bracketRoundFinal;
  if (roundsRemaining === 2) return labels.bracketRoundSemifinals;
  if (roundsRemaining === 3) return labels.bracketRoundQuarterfinals;
  return `${labels.bracketRound} ${round.roundNumber}`;
}

export function TvBracketView({
  zones,
  labels,
}: {
  readonly zones: readonly BracketZone[];
  readonly labels: TvDashboardLabels;
}): React.JSX.Element {
  return (
    <section aria-label={labels.bracketTab} className="tv-bracket" data-testid="tv-bracket">
      {zones.map((zone, zoneIndex) => {
        const rounds = toRounds(zone.matches);
        const zoneNodeKeys = zone.matches.map((match) => match.nodeKey);
        return (
          <div className="tv-bracket__zone" key={zone.zoneId ?? zoneIndex}>
            {zone.zoneName && <h3 className="tv-bracket__zone-name">{zone.zoneName}</h3>}
            {rounds.map((round) => (
              <div className="tv-bracket__round" key={`${round.branch}-${round.roundNumber}`}>
                <h4 className="tv-bracket__round-name">
                  {tvBracketBranchLabel(round.branch, zone.zoneName, labels)} ·{' '}
                  {tvBracketRoundTitle(round, rounds, labels, zone.overallPlaceOffset)}
                </h4>
                <div className="tv-bracket__matches">
                  {round.matches.map((match) => {
                    const node = toNode(match, labels.resultState, labels.sideSource, zoneNodeKeys);
                    const singleRole = /^(?:placement|place)-(\d+)$/.exec(match.role ?? '');
                    return (
                      <article
                        aria-label={`${labels.bracketMatch} ${match.matchNumber}`}
                        className="tv-bracket-card cl-chamfer cl-chamfer--control"
                        key={match.matchId ?? match.matchNumber}
                      >
                        <div className="tv-bracket-card__header">
                          <span>
                            {match.role
                              ? appendOverallPlace(
                                  formatPlacementSource(match.role, labels.sideSource, {
                                    siblingKeys: zoneNodeKeys,
                                  }),
                                  singleRole ? Number(singleRole[1]) : undefined,
                                  zone.overallPlaceOffset,
                                  labels,
                                )
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
        );
      })}
    </section>
  );
}
