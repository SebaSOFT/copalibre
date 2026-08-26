import type { EventCategory } from '../descriptors/event-definition.js';
import type { LocalizedLabel } from '../i18n-label.js';
import { DomainError } from '../errors.js';
import { err, ok, type Result } from '../result.js';
import {
  ACTOR_GRANULARITIES,
  COMPETITION_GRANULARITIES,
  GRANULARITY_SOURCES,
  isActorGranularity,
  isCoarser,
  isCompetitionGranularity,
  type ActorGranularity,
  type CompetitionGranularity,
} from './hierarchies.js';

/**
 * A collector is a declaration, not a function.
 *
 * Every statistic before this one was a fold somebody wrote: outcomes per
 * entrant, events per match scope, a position mapped to points, a count toward
 * a segment. Four folds, four shapes, no shared vocabulary — and the next
 * discipline asks a question none of them anticipated.
 *
 * So a discipline declares *what it watches, how it turns many into one, and at
 * what granularity*, and everything else is reading that declaration at a
 * coarser granularity. Adding "saves per player per season" becomes a line in a
 * module document rather than a migration.
 */

/**
 * Which actor an event-sourced collector accumulates against — `'primary'`
 * matches `resolvedActor`'s existing behavior (the event's own actor);
 * `'every-other-side'` and `{ payloadField }` read the same way `EventEffect`'s
 * `awardTo` does, so a collector can watch a victim, an assist provider, or an
 * opposing side without the event's own effects needing to name that
 * collector at all.
 */
export type CollectorActorSource =
  'primary' | 'every-other-side' | { readonly payloadField: string };

export type CollectorSource =
  | {
      readonly kind: 'event';
      readonly definitionCodes?: readonly string[];
      readonly categories?: readonly EventCategory[];
      /** Absent means `'primary'` — exactly today's behavior. */
      readonly actorSource?: CollectorActorSource;
    }
  /** A value a finalized result already carries. */
  | { readonly kind: 'statistic'; readonly statisticCode: string }
  /** Another collector's output, so a derived figure stays declarative. */
  | { readonly kind: 'collector'; readonly code: string }
  /**
   * Appearances. "Matches played" cannot be folded from goals or fouls — a
   * player who touched nothing still played — so it comes from being named in
   * the roster rather than from an event nobody records.
   */
  | { readonly kind: 'participation'; readonly roles?: readonly string[] };

export type CollectorMeasure =
  | { readonly kind: 'count' }
  | { readonly kind: 'sum' | 'max' | 'min' | 'average'; readonly field: string };

export interface CollectorGranularity {
  readonly actor: ActorGranularity;
  readonly competition: CompetitionGranularity;
}

/**
 * When a collector's total is kept current.
 *
 * A field, not a boolean: `on-finalize`/`live` leaves room for a third cadence
 * later without a breaking rename. Absent reads as `on-finalize`, which is
 * every collector declared before this existed.
 */
export type CollectorCadence = { readonly kind: 'on-finalize' } | { readonly kind: 'live' };

export interface StatisticCollector {
  readonly code: string;
  readonly label: string | LocalizedLabel;
  readonly source: CollectorSource;
  readonly measure: CollectorMeasure;
  /**
   * The finest granularity a figure is kept at, on each axis.
   *
   * **This is the accumulation frequency.** A count that "restarts each period"
   * is declared at `(team, segment)` — one figure per period, and the match
   * figure is their sum. There is no reset field, because a reset loses
   * information and nothing here gets to lose any.
   */
  readonly granularity: CollectorGranularity;
  /** How far it may be read; absent means every granularity above its own. */
  readonly rollsUpTo?: {
    readonly actor?: ActorGranularity;
    readonly competition?: CompetitionGranularity;
  };
  /** Absent means `{ kind: 'on-finalize' }`. */
  readonly cadence?: CollectorCadence;
  /**
   * The tag an acting actor must carry, at the moment the fact occurred, for
   * that fact to count. Filtering happens at fold time, not at read
   * time — a stored total never needs a join against tag facts to answer.
   *
   * Only meaningful for `event`- and `statistic`-sourced collectors, both of
   * which have a fact with its own `occurredAt` to check tag state against.
   * A `participation`-sourced fact (roster membership) and a
   * `collector`-sourced fact (an already-folded figure) have no natural
   * instant of their own, so `requiresTag` on either is refused at
   * validation time rather than resolved against an invented one.
   */
  readonly requiresTag?: { readonly code: string; readonly competition?: CompetitionGranularity };
}

export class CollectorError extends DomainError {
  readonly code = 'COLLECTOR_INVALID';
}

/**
 * A collector that validates but cannot produce anything yet.
 *
 * Reported rather than returned empty: answering a question nobody can populate
 * with a zero is how a product ships a page of blanks and calls it a feature.
 */
export interface InertCollector {
  readonly code: string;
  readonly granularity: ActorGranularity | CompetitionGranularity;
  readonly owedBy: string;
}

/** What a collector may name, read off the discipline that declares it. */
export interface CollectorVocabulary {
  readonly eventCodes: readonly string[];
  readonly statisticCodes: readonly string[];
  /** Tag codes a `requiresTag` may name — the discipline's own `tags`. */
  readonly tagCodes: readonly string[];
  /** Granularities nothing populates yet; currently empty. */
  readonly unpopulatedGranularities?: readonly (ActorGranularity | CompetitionGranularity)[];
}

export interface ValidatedCollectors {
  readonly collectors: readonly StatisticCollector[];
  readonly inert: readonly InertCollector[];
}

/**
 * Validates a discipline's collectors together, because half of what can be
 * wrong is a relationship between two of them.
 */
export function validateCollectors(
  collectors: readonly StatisticCollector[],
  vocabulary: CollectorVocabulary,
): Result<ValidatedCollectors, CollectorError> {
  const byCode = new Map<string, StatisticCollector>();
  for (const collector of collectors) {
    if (byCode.has(collector.code)) {
      return err(
        new CollectorError(`Collector "${collector.code}" is declared more than once`, {
          code: collector.code,
        }),
      );
    }
    byCode.set(collector.code, collector);
  }

  for (const collector of collectors) {
    const invalid = validateOne(collector, vocabulary, byCode);
    if (invalid) return err(invalid);
  }

  const circular = firstCycle(collectors, byCode);
  if (circular) {
    return err(
      new CollectorError(
        `Collector "${circular}" feeds itself, directly or through others; nothing could compute it`,
        { code: circular },
      ),
    );
  }

  return ok({ collectors, inert: inertAmong(collectors, vocabulary) });
}

function validateOne(
  collector: StatisticCollector,
  vocabulary: CollectorVocabulary,
  byCode: ReadonlyMap<string, StatisticCollector>,
): CollectorError | undefined {
  if (!isActorGranularity(collector.granularity.actor)) {
    return new CollectorError(
      `Collector "${collector.code}" names actor granularity "${collector.granularity.actor}". ` +
        `Published: ${ACTOR_GRANULARITIES.join(', ')}`,
      { code: collector.code, granularity: collector.granularity.actor },
    );
  }
  if (!isCompetitionGranularity(collector.granularity.competition)) {
    return new CollectorError(
      `Collector "${collector.code}" names competition granularity ` +
        `"${collector.granularity.competition}". Published: ${COMPETITION_GRANULARITIES.join(', ')}`,
      { code: collector.code, granularity: collector.granularity.competition },
    );
  }

  const ceiling = collector.rollsUpTo;
  if (
    ceiling?.actor &&
    !isCoarser(ACTOR_GRANULARITIES, ceiling.actor, collector.granularity.actor)
  ) {
    return new CollectorError(
      `Collector "${collector.code}" declares an actor ceiling at or below its own granularity, ` +
        'which would put the ceiling under the floor',
      { code: collector.code, ceiling: ceiling.actor },
    );
  }
  if (
    ceiling?.competition &&
    !isCoarser(COMPETITION_GRANULARITIES, ceiling.competition, collector.granularity.competition)
  ) {
    return new CollectorError(
      `Collector "${collector.code}" declares a competition ceiling at or below its own ` +
        'granularity, which would put the ceiling under the floor',
      { code: collector.code, ceiling: ceiling.competition },
    );
  }

  if (collector.requiresTag) {
    if (collector.source.kind !== 'event' && collector.source.kind !== 'statistic') {
      return new CollectorError(
        `Collector "${collector.code}" declares requiresTag, but its source is ` +
          `"${collector.source.kind}", which has no fact-level instant to check tag state against; ` +
          'requiresTag is only meaningful on an event- or statistic-sourced collector',
        { code: collector.code, source: collector.source.kind },
      );
    }
    if (!vocabulary.tagCodes.includes(collector.requiresTag.code)) {
      return new CollectorError(
        `Collector "${collector.code}" requires tag "${collector.requiresTag.code}", which this ` +
          'discipline does not declare',
        { code: collector.code, tagCode: collector.requiresTag.code },
      );
    }
  }

  return sourceError(collector, vocabulary, byCode);
}

function sourceError(
  collector: StatisticCollector,
  vocabulary: CollectorVocabulary,
  byCode: ReadonlyMap<string, StatisticCollector>,
): CollectorError | undefined {
  const { source } = collector;

  if (source.kind === 'event') {
    const unknown = (source.definitionCodes ?? []).find(
      (code) => !vocabulary.eventCodes.includes(code),
    );
    return unknown
      ? new CollectorError(
          `Collector "${collector.code}" watches event "${unknown}", which the discipline does not define`,
          { code: collector.code, definitionCode: unknown },
        )
      : undefined;
  }

  if (source.kind === 'statistic') {
    return vocabulary.statisticCodes.includes(source.statisticCode)
      ? undefined
      : new CollectorError(
          `Collector "${collector.code}" reads statistic "${source.statisticCode}", which the ` +
            'discipline does not declare',
          { code: collector.code, statisticCode: source.statisticCode },
        );
  }

  if (source.kind === 'collector') {
    return byCode.has(source.code)
      ? undefined
      : new CollectorError(
          `Collector "${collector.code}" feeds off "${source.code}", which is not declared here`,
          { code: collector.code, source: source.code },
        );
  }

  return undefined;
}

/** The first collector that feeds itself, directly or through others. */
function firstCycle(
  collectors: readonly StatisticCollector[],
  byCode: ReadonlyMap<string, StatisticCollector>,
): string | undefined {
  for (const start of collectors) {
    const seen = new Set<string>();
    let current: StatisticCollector | undefined = start;

    while (current?.source.kind === 'collector') {
      if (seen.has(current.code)) return start.code;
      seen.add(current.code);
      current = byCode.get(current.source.code);
      if (current?.code === start.code) return start.code;
    }
  }
  return undefined;
}

function inertAmong(
  collectors: readonly StatisticCollector[],
  vocabulary: CollectorVocabulary,
): readonly InertCollector[] {
  const unpopulated = new Set(vocabulary.unpopulatedGranularities ?? []);
  if (unpopulated.size === 0) return [];

  const inert: InertCollector[] = [];
  for (const collector of collectors) {
    for (const granularity of [collector.granularity.actor, collector.granularity.competition]) {
      if (unpopulated.has(granularity)) {
        inert.push({
          code: collector.code,
          granularity,
          owedBy: GRANULARITY_SOURCES[granularity],
        });
      }
    }
  }
  return inert;
}

/**
 * Whether a figure may be read at a granularity, given what the collector
 * declared. A read above a stated ceiling is refused rather than answered with
 * a number the discipline did not sanction.
 */
export function readableAt(
  collector: StatisticCollector,
  at: { readonly actor: ActorGranularity; readonly competition: CompetitionGranularity },
): boolean {
  const actorOk =
    at.actor === collector.granularity.actor ||
    (isCoarser(ACTOR_GRANULARITIES, at.actor, collector.granularity.actor) &&
      (!collector.rollsUpTo?.actor ||
        !isCoarser(ACTOR_GRANULARITIES, at.actor, collector.rollsUpTo.actor)));

  const competitionOk =
    at.competition === collector.granularity.competition ||
    (isCoarser(COMPETITION_GRANULARITIES, at.competition, collector.granularity.competition) &&
      (!collector.rollsUpTo?.competition ||
        !isCoarser(COMPETITION_GRANULARITIES, at.competition, collector.rollsUpTo.competition)));

  return actorOk && competitionOk;
}

/** A collector's cadence, absent reading as `on-finalize`. */
export function cadenceOf(collector: StatisticCollector): CollectorCadence {
  return collector.cadence ?? { kind: 'on-finalize' };
}

/** Whether a collector folds inside the event-recording transaction, not just at match end. */
export function isLiveCadence(collector: StatisticCollector): boolean {
  return cadenceOf(collector).kind === 'live';
}
