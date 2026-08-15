import type { ActorGranularity, CollectorMeasure, CompetitionGranularity } from '@copalibre/domain';
import { aggregateTo, type CollectedFigure } from '@copalibre/tournament-engine';
import type { ReadTotal, StoredFigure } from '@copalibre/persistence';

/**
 * Batched membership lookups a rollup resolver reads from (0082, task 3.1) —
 * pre-fetched, because `aggregateTo`'s `resolve.actorAt` is synchronous.
 *
 * `person`/`player` each roll up through the team they are on; `official` and
 * `venue` carry no entry here at all, which is what leaves them refused
 * exactly as `isCoarser` already refuses a cross-family read — an
 * unresolved actor id is a figure `aggregateTo` drops, not an error.
 */
export interface ActorMembership {
  readonly teamOfPerson?: ReadonlyMap<string, string>;
  readonly teamOfPlayer?: ReadonlyMap<string, string>;
  readonly clubOfTeam?: ReadonlyMap<string, string>;
}

/**
 * Rolls stored figures up to a coarser granularity in memory, reusing
 * `aggregateTo` exactly as built rather than a second SQL join (0082, task
 * 3.1's design decision). The caller supplies every row at the collector's own
 * stored grain; this only resolves the actor axis upward.
 */
export function readRolledUp(
  figures: readonly StoredFigure[],
  measure: CollectorMeasure,
  to: { readonly actor?: ActorGranularity; readonly competition?: CompetitionGranularity },
  membership: ActorMembership = {},
): readonly ReadTotal[] {
  const collected: readonly CollectedFigure[] = figures.map((figure) => ({ ...figure }));

  const actorAt = (figure: CollectedFigure, granularity: ActorGranularity): string | undefined => {
    const team = teamOf(figure, membership);
    if (granularity === 'team') return team;
    if (granularity === 'club') {
      return team === undefined ? undefined : membership.clubOfTeam?.get(team);
    }
    return undefined;
  };

  const rolled = aggregateTo(collected, measure, to, { actorAt });
  return rolled.map((figure) => ({
    actorId: figure.actorId,
    competitionId: figure.competitionId,
    value: figure.value,
    samples: figure.samples,
  }));
}

function teamOf(figure: CollectedFigure, membership: ActorMembership): string | undefined {
  switch (figure.actorGranularity) {
    case 'person':
      return membership.teamOfPerson?.get(figure.actorId);
    case 'player':
      return membership.teamOfPlayer?.get(figure.actorId);
    case 'team':
      return figure.actorId;
    default:
      return undefined;
  }
}
