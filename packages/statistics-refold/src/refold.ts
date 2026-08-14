import { isLiveCadence, type RecordedEvent } from '@copalibre/domain';
import {
  foldStatistics,
  orderForFold,
  type CompetitionContext,
  type FoldInput,
} from '@copalibre/tournament-engine';
import {
  CompetitionRepository,
  EnrollmentRepository,
  StatisticRepository,
  TournamentRepository,
  type Database,
  type Refold,
  type StoredFigure,
  type UnitOfWork,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import {
  resolveMatchRoster,
  type EntrantRow,
  type PlayerRow,
  type RosterRow,
} from './actor-resolution.js';
import { mergeFigures } from './merge-figures.js';

export interface MatchFoldContext {
  readonly input: FoldInput;
  readonly organizationId: string;
}

/**
 * Resolves everything `foldStatistics` needs for one match from persistence
 * (0082, task 1.1): the roster (`match_rosters` + `entrants` + `players` +
 * `teams`), the competition context (stage → season → tournament →
 * organization), the discipline's declared collectors and event definitions,
 * and any hand adjustments recorded against the match.
 *
 * Returns `undefined` when the match, its tournament, or its pinned
 * discipline version cannot be resolved — `Refold`'s own contract for "this
 * match currently supports no figures."
 */
export async function resolveMatchFold(
  db: Kysely<Database>,
  matchId: string,
): Promise<MatchFoldContext | undefined> {
  const competition = new CompetitionRepository(db);
  const enrollment = new EnrollmentRepository(db);
  const tournaments = new TournamentRepository(db);
  const statistics = new StatisticRepository(db);

  const stageId = await competition.stageOfMatch(matchId);
  if (!stageId) return undefined;
  const seasonId = await competition.seasonOfStage(stageId);
  if (!seasonId) return undefined;
  const tournamentId = await competition.tournamentOfSeason(seasonId);
  if (!tournamentId) return undefined;
  const tournament = await tournaments.findById(tournamentId);
  if (!tournament) return undefined;
  const descriptor = await tournaments.findDescriptor(
    tournament.disciplineRef.descriptorId,
    tournament.disciplineRef.version,
  );
  if (!descriptor) return undefined;

  const context: CompetitionContext = {
    matchId,
    stageId,
    seasonId,
    tournamentId,
    organizationId: tournament.organizationId,
  };

  const [rosterRows, entrantRows, events, adjustments] = await Promise.all([
    matchRosterRows(db, matchId),
    matchEntrantRows(db, matchId),
    competition.listEvents(matchId),
    statistics.adjustmentsOf(matchId),
  ]);

  const teamIds = [
    ...new Set(
      entrantRows
        .map((entrant) => entrant.teamId)
        .filter((teamId): teamId is string => teamId !== null),
    ),
  ];
  const [players, clubOfTeam] = await Promise.all([
    playerRowsFor(enrollment, teamIds),
    enrollment.clubsOfTeams(teamIds),
  ]);

  const { roster, actorOf } = resolveMatchRoster({
    rosterRows,
    entrants: entrantRows,
    players,
    clubOfTeam,
  });

  return {
    organizationId: tournament.organizationId,
    input: {
      collectors: orderForFold(descriptor.collectors ?? []),
      events,
      roster,
      actorOf,
      context,
      definitions: descriptor.eventDefinitions,
      adjustments,
    },
  };
}

/**
 * The real `refold(matchId)` `StatisticProjection` calls (task 1.1/1.2) — the
 * same function the rebuild command (task 5.1) drives via
 * `StatisticProjection.apply`, so the write path is identical either way.
 */
export function createRefold(db: Kysely<Database>): Refold {
  return async (matchId: string): Promise<readonly StoredFigure[] | undefined> => {
    const resolved = await resolveMatchFold(db, matchId);
    if (!resolved) return undefined;
    return foldStatistics(resolved.input).map((figure) => ({
      collectorCode: figure.collectorCode,
      actorGranularity: figure.actorGranularity,
      actorId: figure.actorId,
      competitionGranularity: figure.competitionGranularity,
      competitionId: figure.competitionId,
      value: figure.value,
      samples: figure.samples,
    }));
  };
}

/**
 * Folds and stores every `live`-cadence collector for a single newly-recorded
 * event (0082, task 4.2), inside the caller's own transaction.
 *
 * Scoped to `event` alone, not the whole match log — `mergeFigures` is what
 * turns that marginal contribution into the accumulated total
 * `projectMatch`'s replace-the-match-row-set write needs, so a second live
 * event does not erase the first's.
 */
export async function foldLiveEvent(
  uow: UnitOfWork,
  input: {
    readonly organizationId: string;
    readonly matchId: string;
    /** From `resolveMatchFold`; `.events` is ignored in favor of `event` alone. */
    readonly foldContext: FoldInput;
    readonly event: RecordedEvent;
    readonly projectionVersion: number;
  },
): Promise<number> {
  const live = orderForFold(input.foldContext.collectors.filter(isLiveCadence));
  if (live.length === 0) return 0;

  const marginal = foldStatistics({
    ...input.foldContext,
    collectors: live,
    events: [input.event],
  });
  if (marginal.length === 0) return 0;

  const statistics = new StatisticRepository(uow.tx);
  const existing = await statistics.figuresForMatch(input.matchId);
  const merged = mergeFigures(existing, marginal);

  return statistics.projectMatch(uow, {
    organizationId: input.organizationId,
    matchId: input.matchId,
    figures: merged,
    projectionVersion: input.projectionVersion,
  });
}

async function matchRosterRows(
  db: Kysely<Database>,
  matchId: string,
): Promise<readonly RosterRow[]> {
  const rows = await db
    .selectFrom('match_rosters')
    .select(['entrant_id', 'person_ids'])
    .where('match_id', '=', matchId)
    .execute();
  return rows.map((row) => ({ entrantId: row.entrant_id, personIds: row.person_ids }));
}

async function matchEntrantRows(
  db: Kysely<Database>,
  matchId: string,
): Promise<readonly EntrantRow[]> {
  const fixture = await db
    .selectFrom('matches')
    .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
    .select(['fixtures.home_entrant_id', 'fixtures.away_entrant_id'])
    .where('matches.match_id', '=', matchId)
    .executeTakeFirst();
  const entrantIds = [fixture?.home_entrant_id, fixture?.away_entrant_id].filter(
    (id): id is string => id !== null && id !== undefined,
  );
  if (entrantIds.length === 0) return [];

  const rows = await db
    .selectFrom('entrants')
    .select(['entrant_id', 'entrant_kind', 'person_id', 'team_id'])
    .where('entrant_id', 'in', entrantIds)
    .execute();
  return rows.map((row) => ({
    entrantId: row.entrant_id,
    kind: row.entrant_kind,
    personId: row.person_id,
    teamId: row.team_id,
  }));
}

async function playerRowsFor(
  enrollment: EnrollmentRepository,
  teamIds: readonly string[],
): Promise<readonly PlayerRow[]> {
  const byTeam = await enrollment.playersByTeams(teamIds);
  const rows: PlayerRow[] = [];
  for (const [teamId, players] of byTeam) {
    for (const player of players) {
      rows.push({
        personId: player.personId,
        playerId: player.playerId,
        teamId,
        role: player.role,
      });
    }
  }
  return rows;
}
