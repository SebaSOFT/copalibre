import { NotFoundException } from '../http/error-contract.js';
import { Database, TournamentRepository } from '@copalibre/persistence';
import {
  PublicLivePenaltyResponse,
  PublicMatchCounterResponse,
  PublicMatchReportResponse,
} from '../dto/public-tournament.dto.js';
import { Kysely } from 'kysely';
import {
  type CountableRoster,
  countMatchCounters,
  type DisciplineDescriptor,
  primaryScoreOf,
  type RecordedEvent,
  resolveEffectiveMatchCounters,
  runningTimers,
  type Segment,
} from '@copalibre/domain';

export async function resolvePublishedTournament(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
) {
  const tournament = await new TournamentRepository(db).findByScopedAlias(
    organizationAlias,
    tournamentAlias,
  );
  if (!tournament || tournament.status === 'draft') {
    throw new NotFoundException(
      `No tournament "${tournamentAlias}" in organization "${organizationAlias}"`,
      { errorCode: 'public-projection-not-found' },
    );
  }
  const organization = await db
    .selectFrom('organizations')
    .select(['name', 'timezone'])
    .where('organization_id', '=', tournament.organizationId)
    .executeTakeFirst();
  if (!organization) throw new NotFoundException({ errorCode: 'public-projection-not-found' });

  return {
    tournament,
    organizationName: organization.name,
    organizationTimeZone: organization.timezone,
  };
}

export function isResolvedListingMatch(status: string): boolean {
  return status === 'finalized' || status === 'finished' || status === 'forfeited';
}

/**
 * The seconds left on each timed penalty in force against a side playing the match.
 */
export function livePenaltiesOf(
  descriptor: DisciplineDescriptor | null | undefined,
  events: readonly RecordedEvent[],
  resolvedTimerIds: ReadonlySet<string>,
  sides: readonly (string | null | undefined)[],
  now: number,
): PublicLivePenaltyResponse[] {
  if (!descriptor) return [];
  const playing = new Set(sides.filter((id): id is string => typeof id === 'string' && id !== ''));
  const starts = Object.fromEntries(
    descriptor.eventDefinitions.flatMap((definition) =>
      (definition.effects ?? [])
        .filter((effect) => effect.kind === 'timed-penalty')
        .map((effect) => [definition.code, effect.durationSeconds]),
    ),
  );
  return runningTimers(events, { starts, stops: [] }, now, resolvedTimerIds).flatMap((timer) =>
    timer.side === undefined || !playing.has(timer.side)
      ? []
      : [
          {
            timerId: timer.timerId,
            entrantId: timer.side,
            remainingSeconds: timer.remainingSeconds,
          },
        ],
  );
}

/**
 * The declared match counters of one match, tallied per side from its events. Counters are display
 * only: a tally past its allowance is reported as it is. A finished match keeps match-scope counters.
 * Absent when the discipline declares none, or the ruleset hides them all.
 */
export function publicMatchCountersOf(input: {
  readonly descriptor: DisciplineDescriptor | null | undefined;
  readonly overrides: Parameters<typeof resolveEffectiveMatchCounters>[1];
  readonly finished: boolean;
  readonly segments: readonly Segment[];
  readonly events: readonly RecordedEvent[];
  readonly rosters: readonly CountableRoster[];
  readonly entrantIds: readonly (string | null | undefined)[];
}): PublicMatchCounterResponse[] | undefined {
  if (!input.descriptor) return undefined;
  const effective = resolveEffectiveMatchCounters(input.descriptor, input.overrides).filter(
    (counter) => !input.finished || counter.scope === 'match',
  );
  if (effective.length === 0) return undefined;
  const sides = input.entrantIds.filter((id): id is string => typeof id === 'string' && id !== '');
  const tallies = countMatchCounters(effective, input.events, input.segments, input.rosters, sides);
  return effective.map((counter) => ({
    code: counter.code,
    label: counter.label,
    shortLabel: counter.shortLabel,
    scope: counter.scope,
    events: [...counter.events],
    ...(counter.allowance === undefined ? {} : { allowance: counter.allowance }),
    ...(counter.warnAt === undefined ? {} : { warnAt: counter.warnAt }),
    values: (tallies.find((tally) => tally.code === counter.code)?.values ?? []).map((value) => ({
      entrantId: value.entrantId,
      value: value.value,
    })),
  }));
}

export function publicScores(
  sides: readonly { readonly statistics?: Record<string, number> }[],
  descriptor?: DisciplineDescriptor,
): readonly (number | undefined)[] {
  return sides.map((side) => primaryScoreOf(side.statistics, descriptor));
}

/** A game's status as the series switcher shows it: a game a decided series never plays is not required. */
export function gameStatusOf(status: string): 'upcoming' | 'live' | 'final' | 'not-required' {
  if (status === 'not-required') return 'not-required';
  return publicMatchStatus(status);
}

export function publicMatchStatus(status: string): PublicMatchReportResponse['status'] {
  if (status === 'finalized') return 'final';
  if (status === 'in-progress') return 'live';
  return 'upcoming';
}

export function scheduleStartsAt(startsAt: string): string {
  return new Date(Number(startsAt)).toISOString();
}

/** The `formerAliases` field of an overview club: absent when the club has none. */
export function formerAliasesOf(
  alias: string | null,
  formerByCurrent: ReadonlyMap<string, readonly string[]>,
): { readonly formerAliases?: string[] } {
  const former = alias ? formerByCurrent.get(alias) : undefined;
  return former && former.length > 0 ? { formerAliases: [...former] } : {};
}
