import type { Entrant } from '../aggregates/participant.js';
import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/**
 * The two axes a statistic is collected over (0016-statistic-collectors-and-tags).
 *
 * Every statistic question is "what happened, to whom, over what stretch of
 * competition". Naming the two hierarchies once is what lets a collector answer
 * any of them by declaring a granularity on each, instead of a phase writing a
 * fold per question — and the questions do not converge, because disciplines
 * differ exactly where a hardcoded fold is most confident.
 *
 * **Granularity, not "level"** (owner, 2026-08-01). `level` already means two
 * other things in this codebase — the tiers a discipline scores at, and a match
 * that ended level — and in a platform that also serves esports it reads as the
 * arena being played on, which is a `Venue`. One word for one thing.
 */

/** Finest to coarsest. Every granularity above a collector's is an aggregate. */
export const COMPETITION_GRANULARITIES = [
  'event',
  'segment',
  'match',
  'stage',
  'season',
  'tournament',
  'organization',
] as const;

/**
 * Finest to coarsest. A **person** is the human; a **player** is that person in
 * one team; a **team** is a side; a **club** fields several.
 *
 * An entrant is deliberately absent. It is the *enrollment* — an actor bound to
 * one competition — so it belongs to neither axis and bridges them. That is
 * what lets a club's totals cross tournaments while an entrant cannot: an
 * entrant lives inside one.
 */
export const ACTOR_GRANULARITIES = ['person', 'player', 'team', 'club'] as const;

export type CompetitionGranularity = (typeof COMPETITION_GRANULARITIES)[number];
export type ActorGranularity = (typeof ACTOR_GRANULARITIES)[number];

export class HierarchyError extends DomainError {
  readonly code = 'HIERARCHY_GRANULARITY_INVALID';
}

/**
 * Where each granularity's identifiers come from, and which phase owes any that
 * nothing populates.
 *
 * `0016` was drafted while `season`, `person` and `player` existed only as
 * names, and a collector declared at one had to report itself inert rather than
 * return zero — a product that answers a question nobody can populate is a page
 * of blanks with a feature's name on it. `0015` populated all three, so nothing
 * is inert today; this record stays because the next one added will be.
 */
export const GRANULARITY_SOURCES: Readonly<
  Record<CompetitionGranularity | ActorGranularity, string>
> = Object.freeze({
  event: '0009',
  segment: '0009',
  match: '0007',
  stage: '0007',
  season: '0015',
  tournament: '0002',
  organization: '0002',
  person: '0015',
  player: '0015',
  team: '0002',
  club: '0002',
});

export function isCompetitionGranularity(value: string): value is CompetitionGranularity {
  return (COMPETITION_GRANULARITIES as readonly string[]).includes(value);
}

export function isActorGranularity(value: string): value is ActorGranularity {
  return (ACTOR_GRANULARITIES as readonly string[]).includes(value);
}

/**
 * The granularities a figure can be aggregated to, coarsest-ward.
 *
 * "One step coarser" is a fact about the axis rather than something each caller
 * works out, which is what stops two readers disagreeing about whether a season
 * sits above a stage.
 */
export function granularitiesAbove<G extends CompetitionGranularity | ActorGranularity>(
  axis: readonly G[],
  granularity: G,
): readonly G[] {
  const index = axis.indexOf(granularity);
  return index === -1 ? [] : axis.slice(index + 1);
}

export function isCoarser<G extends CompetitionGranularity | ActorGranularity>(
  axis: readonly G[],
  candidate: G,
  granularity: G,
): boolean {
  return axis.indexOf(candidate) > axis.indexOf(granularity);
}

/** The actor an enrollment names, which is how a fold crosses from one axis to the other. */
export interface ResolvedActor {
  readonly granularity: ActorGranularity;
  readonly actorId: string;
}

/**
 * Resolves an entrant to the actor that entered.
 *
 * A recorded fact names the entrant that produced it; a profile asks about the
 * person or the club. This is the one place the two hierarchies meet, and it is
 * a lookup rather than a level precisely so neither axis has to know about
 * enrollment.
 */
export function actorOfEntrant(entrant: Pick<Entrant, 'entrantRef'>): ResolvedActor {
  return entrant.entrantRef.kind === 'team'
    ? { granularity: 'team', actorId: entrant.entrantRef.teamId }
    : { granularity: 'person', actorId: entrant.entrantRef.personId };
}

/** Refuses a granularity neither axis publishes, naming the ones that exist. */
export function requireGranularities(input: {
  readonly actor: string;
  readonly competition: string;
}): Result<
  { readonly actor: ActorGranularity; readonly competition: CompetitionGranularity },
  HierarchyError
> {
  if (!isActorGranularity(input.actor)) {
    return err(
      new HierarchyError(
        `Unknown actor granularity "${input.actor}". Published: ${ACTOR_GRANULARITIES.join(', ')}`,
        { granularity: input.actor },
      ),
    );
  }
  if (!isCompetitionGranularity(input.competition)) {
    return err(
      new HierarchyError(
        `Unknown competition granularity "${input.competition}". ` +
          `Published: ${COMPETITION_GRANULARITIES.join(', ')}`,
        { granularity: input.competition },
      ),
    );
  }
  return ok({ actor: input.actor, competition: input.competition });
}
