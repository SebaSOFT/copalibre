import type { Entrant } from '../aggregates/participant.js';
import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/**
 * The two axes a statistic is collected over (0016-statistic-collectors-and-tags).
 *
 * Every statistic question is "what happened, to whom, over what stretch of
 * competition". Naming the two hierarchies once is what lets a collector answer
 * any of them by declaring a level of each, instead of a phase writing a fold
 * per question — and the questions do not converge, because disciplines differ
 * exactly where a hardcoded fold is most confident.
 */

/** Finest to coarsest. Every level above a collector's grain is an aggregate. */
export const COMPETITION_LEVELS = [
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
export const ACTOR_LEVELS = ['person', 'player', 'team', 'club'] as const;

export type CompetitionLevel = (typeof COMPETITION_LEVELS)[number];
export type ActorLevel = (typeof ACTOR_LEVELS)[number];

export class HierarchyError extends DomainError {
  readonly code = 'HIERARCHY_LEVEL_INVALID';
}

/**
 * Where each level's identifiers come from, and which phase owes any that
 * nothing populates.
 *
 * `0016` was drafted while `season`, `person` and `player` existed only as
 * names, and a collector grained at one had to report itself inert rather than
 * return zero — a product that answers a question nobody can populate is a page
 * of blanks with a feature's name on it. `0015` populated all three, so nothing
 * is inert today; the map stays because the next level added will be.
 */
export const LEVEL_SOURCES: Readonly<Record<CompetitionLevel | ActorLevel, string>> = Object.freeze(
  {
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
  },
);

export function isCompetitionLevel(value: string): value is CompetitionLevel {
  return (COMPETITION_LEVELS as readonly string[]).includes(value);
}

export function isActorLevel(value: string): value is ActorLevel {
  return (ACTOR_LEVELS as readonly string[]).includes(value);
}

/**
 * The levels a figure at `grain` can be aggregated to, coarsest-ward.
 *
 * "One level up" is a fact about the axis rather than something each caller
 * works out, which is what stops two readers disagreeing about whether a season
 * is above a stage.
 */
export function levelsAbove<L extends CompetitionLevel | ActorLevel>(
  axis: readonly L[],
  grain: L,
): readonly L[] {
  const index = axis.indexOf(grain);
  return index === -1 ? [] : axis.slice(index + 1);
}

export function isAbove<L extends CompetitionLevel | ActorLevel>(
  axis: readonly L[],
  candidate: L,
  grain: L,
): boolean {
  return axis.indexOf(candidate) > axis.indexOf(grain);
}

/** The actor an enrollment names, which is how a fold crosses from one axis to the other. */
export interface ResolvedActor {
  readonly level: ActorLevel;
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
    ? { level: 'team', actorId: entrant.entrantRef.teamId }
    : { level: 'person', actorId: entrant.entrantRef.personId };
}

/** Refuses a level neither axis publishes, naming the ones that exist. */
export function requireLevels(input: {
  readonly actor: string;
  readonly competition: string;
}): Result<{ readonly actor: ActorLevel; readonly competition: CompetitionLevel }, HierarchyError> {
  if (!isActorLevel(input.actor)) {
    return err(
      new HierarchyError(
        `Unknown actor level "${input.actor}". Published: ${ACTOR_LEVELS.join(', ')}`,
        { level: input.actor },
      ),
    );
  }
  if (!isCompetitionLevel(input.competition)) {
    return err(
      new HierarchyError(
        `Unknown competition level "${input.competition}". Published: ${COMPETITION_LEVELS.join(', ')}`,
        { level: input.competition },
      ),
    );
  }
  return ok({ actor: input.actor, competition: input.competition });
}
