import {
  ACTOR_GRANULARITIES,
  COMPETITION_GRANULARITIES,
  isCoarser,
  type ActorGranularity,
  type CompetitionGranularity,
  type CollectorMeasure,
  type EventDefinition,
  type OutcomeContributor,
  type RecordedEvent,
  type StatisticAdjustment,
  type StatisticCollector,
} from '@copalibre/domain';
import { StatisticFoldError } from '../errors.js';

export type { StatisticAdjustment };

/**
 * Folding facts into figures (0016-statistic-collectors-and-tags).
 *
 * One pass produces every declared collector's figures at its own granularity,
 * on both axes at once — so a team table and a player table can never disagree
 * about the same match, because neither is computed separately.
 */

export interface FigureKey {
  readonly collectorCode: string;
  readonly actorGranularity: ActorGranularity;
  readonly actorId: string;
  readonly competitionGranularity: CompetitionGranularity;
  readonly competitionId: string;
}

export interface CollectedFigure extends FigureKey {
  readonly value: number;
  /**
   * How many facts produced the value.
   *
   * Carried on every figure, not only on averages, because an average at any
   * coarser granularity is `sum(value × samples) / sum(samples)` — and a column
   * added later is a migration, while a column carried from the start is a
   * number that was always right.
   */
  readonly samples: number;
}

/** Where a match sits on the competition axis, supplied by the caller. */
export interface CompetitionContext {
  readonly matchId: string;
  readonly stageId: string;
  readonly seasonId: string;
  readonly tournamentId: string;
  readonly organizationId: string;
}

/** Who a person is, on the rest of the actor axis. */
export interface ActorContext {
  readonly personId: string;
  readonly playerId?: string;
  readonly teamId?: string;
  readonly clubId?: string;
}

/**
 * The candidate fact a collector is about to accumulate, one shape per source
 * kind: the event a `event`/`statistic` source watches, the roster member a
 * `participation` source counts, or the source figure a `collector` source
 * folds from.
 */
export type FoldFact = RecordedEvent | (ActorContext & { readonly role: string }) | CollectedFigure;

export interface FoldInput {
  readonly collectors: readonly StatisticCollector[];
  readonly events: readonly RecordedEvent[];
  /** The match roster, which is where an appearance comes from. */
  readonly roster: readonly (ActorContext & { readonly role: string })[];
  /** Resolves the entrant a fact names to the actor that entered. */
  readonly actorOf: (entrantId: string) => ActorContext | undefined;
  readonly context: CompetitionContext;
  /**
   * The definitions the events were recorded against, so a declared
   * `EventEffect { kind: 'statistic', delta }` moves the same total a count
   * would. Absent, only counted and measured sources fold.
   */
  readonly definitions?: readonly EventDefinition[];
  /** Adjustments recorded by an operator or declared by a script. */
  readonly adjustments?: readonly StatisticAdjustment[];
  /**
   * Excludes a candidate fact before it is accumulated, checked against the
   * actor id already resolved at the collector's own declared granularity —
   * the identity a tag or eligibility check is naturally keyed against — and
   * the collector currently being folded, since a filter's decision (e.g.
   * `0073`'s `requiresTag`) is a per-collector declaration, not a blanket
   * rule for the whole fold.
   */
  readonly filter?: (fact: FoldFact, actorId: string, collector: StatisticCollector) => boolean;
}

/**
 * Orders collectors so a `collector`-sourced entry always folds after the
 * collector it names (0082's task 2.2).
 *
 * A stable partition, not a topological sort: a `collector`-sourced collector
 * naming another `collector`-sourced one is refused at fold time (see the
 * `collector` branch above), so nothing here needs to order more than one
 * level deep.
 */
export function orderForFold(
  collectors: readonly StatisticCollector[],
): readonly StatisticCollector[] {
  const direct = collectors.filter((one) => one.source.kind !== 'collector');
  const derived = collectors.filter((one) => one.source.kind === 'collector');
  return [...direct, ...derived];
}

export function foldStatistics(input: FoldInput): readonly CollectedFigure[] {
  const figures = new Map<string, CollectedFigure>();
  const definitions = new Map((input.definitions ?? []).map((one) => [one.code, one]));

  const add = (key: FigureKey, value: number, samples = 1): void => {
    const id = keyOf(key);
    const existing = figures.get(id);
    figures.set(
      id,
      existing
        ? {
            ...existing,
            value: combine(existing.value, value),
            samples: existing.samples + samples,
          }
        : { ...key, value, samples },
    );
  };

  for (const collector of input.collectors) {
    if (collector.source.kind === 'participation') {
      const roles = collector.source.roles;
      for (const member of input.roster) {
        if (roles && !roles.includes(member.role)) continue;
        const actorId = actorIdAt(member, collector.granularity.actor);
        if (actorId === undefined) continue;
        if (input.filter && !input.filter(member, actorId, collector)) continue;
        add(keyFor(collector, actorId, input.context), 1);
      }
      continue;
    }

    if (collector.source.kind === 'statistic') {
      const statisticCode = collector.source.statisticCode;
      for (const event of input.events) {
        for (const delta of declaredDeltas(event, statisticCode, definitions)) {
          const resolved = resolvedActor(input, event);
          if (!resolved) continue;
          const actorId = actorIdAt(resolved, collector.granularity.actor);
          if (actorId === undefined) continue;
          if (input.filter && !input.filter(event, actorId, collector)) continue;
          add(keyFor(collector, actorId, input.context), delta);
        }
      }
      continue;
    }

    if (collector.source.kind === 'collector') {
      const sourceCode = collector.source.code;
      const source = input.collectors.find((one) => one.code === sourceCode);
      if (source?.source.kind === 'collector') {
        throw new StatisticFoldError(
          `Collector "${collector.code}" feeds off "${sourceCode}", which is itself ` +
            'collector-sourced; a collector may name only a directly-computed collector',
          { code: collector.code, source: sourceCode },
        );
      }

      // A snapshot, not a live view: `refold` sorts `collector`-sourced
      // entries after everything else, so by the time this branch runs the
      // source collector's figures are already settled — iterating the live
      // map here would let a collector see partial output from a peer that
      // happens to run later in `input.collectors`.
      for (const figure of [...figures.values()]) {
        if (figure.collectorCode !== sourceCode) continue;
        if (input.filter && !input.filter(figure, figure.actorId, collector)) continue;
        add(
          keyFor(collector, figure.actorId, input.context),
          measuredFromFigure(collector.measure, figure),
        );
      }
      continue;
    }

    if (collector.source.kind !== 'event') continue;

    for (const event of input.events) {
      if (!watches(collector, event)) continue;

      const resolved = resolvedActor(input, event);
      if (!resolved) continue;

      const actorId = actorIdAt(resolved, collector.granularity.actor);
      if (actorId === undefined) continue;
      if (input.filter && !input.filter(event, actorId, collector)) continue;

      add(keyFor(collector, actorId, input.context), measured(collector.measure, event));
    }
  }

  for (const adjustment of input.adjustments ?? []) {
    const collector = input.collectors.find((one) => one.code === adjustment.collectorCode);
    if (!collector) continue;
    add(
      {
        collectorCode: adjustment.collectorCode,
        actorGranularity: adjustment.actorGranularity,
        actorId: adjustment.actorId,
        competitionGranularity: collector.granularity.competition,
        competitionId: competitionIdAt(collector.granularity.competition, input.context),
      },
      adjustment.delta,
    );
  }

  return [...figures.values()];
}

/**
 * Aggregates figures to a coarser granularity by the operation its measure
 * permits.
 *
 * Counts and sums add. Extremes take the extreme. **An average is recomputed
 * from the samples**, because the mean of four means is the mean only when
 * every group is the same size, and groups are never the same size.
 */
export function aggregateTo(
  figures: readonly CollectedFigure[],
  measure: CollectorMeasure,
  to: { readonly actor?: ActorGranularity; readonly competition?: CompetitionGranularity },
  resolve: {
    readonly actorAt?: (
      figure: CollectedFigure,
      granularity: ActorGranularity,
    ) => string | undefined;
    readonly competitionAt?: (
      figure: CollectedFigure,
      granularity: CompetitionGranularity,
    ) => string | undefined;
  } = {},
): readonly CollectedFigure[] {
  const grouped = new Map<string, CollectedFigure[]>();

  for (const figure of figures) {
    const actorGranularity = to.actor ?? figure.actorGranularity;
    const competitionGranularity = to.competition ?? figure.competitionGranularity;

    if (
      (to.actor && isCoarser(ACTOR_GRANULARITIES, figure.actorGranularity, to.actor)) ||
      (to.competition &&
        isCoarser(COMPETITION_GRANULARITIES, figure.competitionGranularity, to.competition))
    ) {
      // Aggregating downward would invent detail the figures do not carry.
      continue;
    }

    // Only a strictly coarser target needs resolving; asking for the
    // granularity a figure already has is a no-op, not a lookup that can fail.
    const actorId =
      to.actor && to.actor !== figure.actorGranularity
        ? resolve.actorAt?.(figure, to.actor)
        : figure.actorId;
    const competitionId =
      to.competition && to.competition !== figure.competitionGranularity
        ? resolve.competitionAt?.(figure, to.competition)
        : figure.competitionId;
    if (actorId === undefined || competitionId === undefined) continue;

    const key = keyOf({
      collectorCode: figure.collectorCode,
      actorGranularity,
      actorId,
      competitionGranularity,
      competitionId,
    });
    grouped.set(key, [...(grouped.get(key) ?? []), figure]);
  }

  return [...grouped.entries()].map(([key, members]) => {
    const [collectorCode, actorGranularity, actorId, competitionGranularity, competitionId] =
      key.split(' ');
    const samples = members.reduce((total, member) => total + member.samples, 0);

    return {
      collectorCode: collectorCode ?? '',
      actorGranularity: actorGranularity as ActorGranularity,
      actorId: actorId ?? '',
      competitionGranularity: competitionGranularity as CompetitionGranularity,
      competitionId: competitionId ?? '',
      value: combineAll(members, measure),
      samples,
    };
  });
}

function combineAll(members: readonly CollectedFigure[], measure: CollectorMeasure): number {
  const values = members.map((member) => member.value);
  switch (measure.kind) {
    case 'max':
      return Math.max(...values);
    case 'min':
      return Math.min(...values);
    case 'average': {
      // Weighted by what each figure was computed from — the mean of means is
      // not the mean, and this is the column that exists to prevent it.
      const samples = members.reduce((total, member) => total + member.samples, 0);
      if (samples === 0) return 0;
      return members.reduce((total, member) => total + member.value * member.samples, 0) / samples;
    }
    default:
      return values.reduce((total, value) => total + value, 0);
  }
}

function watches(collector: StatisticCollector, event: RecordedEvent): boolean {
  if (collector.source.kind !== 'event') return false;
  const codes = collector.source.definitionCodes;
  return codes === undefined || codes.includes(event.definitionCode);
}

function measured(measure: CollectorMeasure, event: RecordedEvent): number {
  if (measure.kind === 'count') return 1;
  const value = event.payload[measure.field];
  return typeof value === 'number' ? value : 0;
}

/**
 * A `collector`-sourced collector's measure, applied to a source figure.
 *
 * `measure.field` names a key on an event's payload, which a folded figure
 * does not have — its own `value` is already the single number a source
 * collector reported, so `sum`/`max`/`min`/`average` read that directly, the
 * same way `measured` reads an event's payload field.
 */
function measuredFromFigure(measure: CollectorMeasure, figure: CollectedFigure): number {
  return measure.kind === 'count' ? 1 : figure.value;
}

/**
 * A fact naming a person is about that person, whatever entrant produced it.
 * The entrant says which side; the person says who, and a per-person figure
 * needs the second.
 */
function personOverride(
  actor: ActorContext | undefined,
  personId?: string,
): ActorContext | undefined {
  if (personId === undefined) return actor;
  return { ...(actor ?? { personId }), personId };
}

function actorIdAt(actor: ActorContext, granularity: ActorGranularity): string | undefined {
  switch (granularity) {
    case 'person':
      return actor.personId;
    case 'player':
      return actor.playerId;
    case 'team':
      return actor.teamId;
    case 'club':
      return actor.clubId;
  }
}

function competitionIdAt(granularity: CompetitionGranularity, context: CompetitionContext): string {
  switch (granularity) {
    case 'event':
    case 'segment':
    case 'match':
      return context.matchId;
    case 'stage':
      return context.stageId;
    case 'season':
      return context.seasonId;
    case 'tournament':
      return context.tournamentId;
    case 'organization':
      return context.organizationId;
  }
}

function keyFor(
  collector: StatisticCollector,
  actorId: string,
  context: CompetitionContext,
): FigureKey {
  return {
    collectorCode: collector.code,
    actorGranularity: collector.granularity.actor,
    actorId,
    competitionGranularity: collector.granularity.competition,
    competitionId: competitionIdAt(collector.granularity.competition, context),
  };
}

function keyOf(key: FigureKey): string {
  return [
    key.collectorCode,
    key.actorGranularity,
    key.actorId,
    key.competitionGranularity,
    key.competitionId,
  ].join(' ');
}

/**
 * Within one fold every measure accumulates by addition; the shape a measure
 * takes belongs to `aggregateTo`, where the granularity being asked for is
 * known.
 */
function combine(existing: number, incoming: number): number {
  return existing + incoming;
}

/**
 * The deltas an event's definition declares for a statistic code.
 *
 * A collector sourced by `statistic` collects what a discipline *declared* the
 * event to be worth; one sourced by `event` counts occurrences. Two paths, one
 * fold, and nothing counted twice — which is why a discipline may say "an own
 * goal counts for the other side" without a second mechanism.
 */
function declaredDeltas(
  event: RecordedEvent,
  statisticCode: string,
  definitions: ReadonlyMap<string, EventDefinition>,
): readonly number[] {
  const effects = definitions.get(event.definitionCode)?.effects ?? [];
  return effects
    .filter((effect) => effect.kind === 'statistic' && effect.statisticCode === statisticCode)
    .map((effect) => (effect.kind === 'statistic' ? effect.delta : 0));
}

function resolvedActor(input: FoldInput, event: RecordedEvent): ActorContext | undefined {
  const actor = event.side === undefined ? undefined : input.actorOf(event.side);
  return personOverride(actor, event.personId);
}

/**
 * The per-actor rows a finalized result stores alongside a side's totals.
 *
 * Produced from the same fold rather than from a second pass: a contributor
 * list that could disagree with the total it sits next to is worse than no
 * contributor list.
 */
export function contributorsOf(
  figures: readonly CollectedFigure[],
  granularity: ActorGranularity,
): readonly OutcomeContributor[] {
  const byActor = new Map<string, Record<string, number>>();

  for (const figure of figures) {
    if (figure.actorGranularity !== granularity) continue;
    const statistics = byActor.get(figure.actorId) ?? {};
    statistics[figure.collectorCode] = (statistics[figure.collectorCode] ?? 0) + figure.value;
    byActor.set(figure.actorId, statistics);
  }

  return [...byActor.entries()].map(([actorId, statistics]) => ({
    actorGranularity: granularity,
    actorId,
    statistics,
  }));
}
