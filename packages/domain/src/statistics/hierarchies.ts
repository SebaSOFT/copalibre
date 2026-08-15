import type { Entrant } from '../aggregates/participant.js';
import type { Official, Venue } from '../aggregates/resource.js';
import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';

/**
 * The two axes a statistic is collected over.
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
 *
 * **`official` and `venue` are roll-up-terminal, not links in the
 * person→player→team→club chain.** An official's tag does not roll up into a
 * club's totals, and neither does a venue's — each is its own single-member
 * family. See `ACTOR_ROLLUP_CHAINS` below for how `granularitiesAbove`/
 * `isCoarser` keep the three families from being compared as if they were one
 * total order.
 */
export const ACTOR_GRANULARITIES = [
  'person',
  'player',
  'team',
  'club',
  'official',
  'venue',
] as const;

/**
 * The actor axis's roll-up families. `person → player → team → club` is
 * a real containment chain: a player's stats roll up to their team, which
 * rolls up to their club. `official` and `venue` are each their own,
 * single-member family — comparing across families answers "not comparable"
 * (see `isCoarser`) rather than a value derived from `ACTOR_GRANULARITIES`'
 * incidental array order.
 */
const ACTOR_ROLLUP_CHAINS: readonly (readonly ActorGranularity[])[] = [
  ['person', 'player', 'team', 'club'],
  ['official'],
  ['venue'],
];

function chainContaining<G>(chains: readonly (readonly G[])[], value: G): readonly G[] | undefined {
  return chains.find((chain) => chain.includes(value));
}

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
  official: '0072',
  venue: '0072',
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
 *
 * On the actor axis, this resolves within `granularity`'s own roll-up family
 * — `official` and `venue` each have nothing above them, and neither is
 * "above" `person`/`player`/`team`/`club` just because of where it sits in
 * `ACTOR_GRANULARITIES`' published order.
 */
export function granularitiesAbove<G extends CompetitionGranularity | ActorGranularity>(
  axis: readonly G[],
  granularity: G,
): readonly G[] {
  const chain = actorChainFor(axis, granularity);
  if (chain) {
    const index = chain.indexOf(granularity);
    return index === -1 ? [] : chain.slice(index + 1);
  }
  const index = axis.indexOf(granularity);
  return index === -1 ? [] : axis.slice(index + 1);
}

/**
 * Whether `candidate` is coarser than `granularity`.
 *
 * On the actor axis, two granularities from different roll-up families
 * — e.g. `club` and `official` — are never coarser than one another: that
 * comparison is "not comparable," not a value derived from
 * `ACTOR_GRANULARITIES`' incidental array position.
 */
export function isCoarser<G extends CompetitionGranularity | ActorGranularity>(
  axis: readonly G[],
  candidate: G,
  granularity: G,
): boolean {
  const candidateChain = actorChainFor(axis, candidate);
  const granularityChain = actorChainFor(axis, granularity);
  if (candidateChain !== undefined || granularityChain !== undefined) {
    if (candidateChain === undefined || candidateChain !== granularityChain) return false;
    return candidateChain.indexOf(candidate) > candidateChain.indexOf(granularity);
  }
  return axis.indexOf(candidate) > axis.indexOf(granularity);
}

/**
 * Resolves `value`'s roll-up family when `axis` is the published actor axis;
 * `undefined` for the competition axis (a single chain, unchanged behavior) or
 * any other array a caller might pass.
 */
function actorChainFor<G extends CompetitionGranularity | ActorGranularity>(
  axis: readonly G[],
  value: G,
): readonly G[] | undefined {
  if ((axis as readonly unknown[]) !== (ACTOR_GRANULARITIES as readonly unknown[]))
    return undefined;
  return chainContaining(ACTOR_ROLLUP_CHAINS, value as ActorGranularity) as
    readonly G[] | undefined;
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
 * a lookup rather than a granularity precisely so neither axis has to know about
 * enrollment.
 */
export function actorOfEntrant(entrant: Pick<Entrant, 'entrantRef'>): ResolvedActor {
  return entrant.entrantRef.kind === 'team'
    ? { granularity: 'team', actorId: entrant.entrantRef.teamId }
    : { granularity: 'person', actorId: entrant.entrantRef.personId };
}

/**
 * Resolves an official to its `official`-granularity actor reference.
 * An official is already the addressable unit — no unwrapping, unlike an
 * entrant naming a person or team underneath it.
 */
export function actorOfOfficial(official: Pick<Official, 'officialId'>): ResolvedActor {
  return { granularity: 'official', actorId: official.officialId };
}

/**
 * Resolves a venue to its `venue`-granularity actor reference. Same
 * shape as `actorOfOfficial` — a venue is already the addressable unit.
 */
export function actorOfVenue(venue: Pick<Venue, 'venueId'>): ResolvedActor {
  return { granularity: 'venue', actorId: venue.venueId };
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
