import { NotFoundException } from '@nestjs/common';
import type { Kysely } from 'kysely';
import {
  CompetitionRepository,
  EnrollmentRepository,
  StageReadModel,
  TournamentRepository,
  type Database,
  type StageMatchRecord,
} from '@copalibre/persistence';
import { decidingFactorLabel, type TraceNode } from '@copalibre/rules';
import {
  isImplicitGroup,
  isImplicitZone,
  resolveLabel,
  type EventDefinition,
  type Tournament,
} from '@copalibre/domain';
import { readStandings } from '../standings/read.js';
import {
  readStageSeries,
  publicSeriesState,
  type PublicSeriesState,
} from '../controllers/stage-series.js';
import { elapsedSecondsOf } from '../controllers/segment-clock.js';

/**
 * A stage/zone/group/series-agnostic flat list of matches — the shared read
 * both the public and control-web matches-view endpoints join from. `rawTrace`
 * is present only for the internal caller (control-web) to build a full trace
 * from when the viewer is authorized; the public mapper never reads it.
 */
export interface MatchesViewRow {
  readonly matchId: string;
  readonly stageNumber: number;
  readonly matchNumber: number;
  readonly round: number;
  readonly status: 'upcoming' | 'live' | 'final';
  readonly homeEntrantId?: string;
  readonly homeName?: string;
  readonly homeAbbreviation?: string;
  readonly awayEntrantId?: string;
  readonly awayName?: string;
  readonly awayAbbreviation?: string;
  readonly homeScore?: number;
  readonly awayScore?: number;
  readonly clockSeconds?: number;
  readonly venueName?: string;
  readonly latestEvent?: { readonly label: string; readonly occurredAt: string };
  readonly zoneName?: string;
  readonly groupName?: string;
  readonly homePosition?: number;
  readonly awayPosition?: number;
  readonly series?: PublicSeriesState;
  readonly decidingFactor?: string;
  /** Internal only — never serialized by the public mapper. */
  readonly homeClubId?: string;
  readonly awayClubId?: string;
  readonly rawTrace?: readonly TraceNode[];
}

export interface MatchesViewFilter {
  readonly stageNumber?: number;
  readonly groupId?: string;
  readonly state?: 'all' | 'live' | 'upcoming' | 'final';
}

/**
 * Lists matches across the requested scope: every stage when `stageNumber`
 * is absent, one stage (optionally one group within it) when present.
 * Position/deciding-factor are resolved per distinct group a stage declares
 * (falling back to a single, stage-wide read for a stage with no explicit
 * zone/group structure) — never per match, so a stage of many matches costs
 * one standings read per group, not one per match.
 */
export async function readMatchesView(
  db: Kysely<Database>,
  tournament: Pick<Tournament, 'tournamentId' | 'organizationId' | 'disciplineRef'>,
  filter: MatchesViewFilter,
): Promise<readonly MatchesViewRow[]> {
  const allStages = await new CompetitionRepository(db).listStagesOfTournament(
    tournament.tournamentId,
  );
  const stages =
    filter.stageNumber === undefined
      ? allStages
      : allStages.filter((stage) => stage.number === filter.stageNumber);
  if (filter.stageNumber !== undefined && stages.length === 0) {
    throw new NotFoundException(`No stage ${filter.stageNumber} in tournament`);
  }

  const rows: MatchesViewRow[] = [];
  for (const stage of stages) {
    rows.push(...(await readStageMatchesView(db, tournament, stage, filter.groupId)));
  }

  if (filter.state === undefined || filter.state === 'all') return rows;
  return rows.filter((row) => row.status === filter.state);
}

async function readStageMatchesView(
  db: Kysely<Database>,
  tournament: Pick<Tournament, 'tournamentId' | 'organizationId' | 'disciplineRef'>,
  stage: { readonly stageId: string; readonly number: number },
  onlyGroupId: string | undefined,
): Promise<readonly MatchesViewRow[]> {
  const competition = new CompetitionRepository(db);
  const records = await new StageReadModel(db).matches(stage.stageId, onlyGroupId);
  if (records.length === 0) return [];

  const fixtureGroups = await db
    .selectFrom('fixtures')
    .select(['fixture_id', 'group_id'])
    .where('stage_id', '=', stage.stageId)
    .execute();
  const groupIdByFixture = new Map(
    fixtureGroups.map((row) => [row.fixture_id, row.group_id ?? undefined] as const),
  );

  const zoneNamesByGroup = await zoneAndGroupNamesByGroupId(db, stage.stageId);

  const entrantIds = new Set<string>();
  for (const record of records) {
    if (record.homeEntrantId) entrantIds.add(record.homeEntrantId);
    if (record.awayEntrantId) entrantIds.add(record.awayEntrantId);
  }
  const enrollment = new EnrollmentRepository(db);
  const [names, clubIdByEntrant, descriptor, seriesByPosition, venueByMatch] = await Promise.all([
    enrollment.resolveEntrantNames([...entrantIds]),
    clubIdsOfEntrants(db, enrollment, [...entrantIds]),
    new TournamentRepository(db).findDescriptor(
      tournament.disciplineRef.descriptorId,
      tournament.disciplineRef.version,
    ),
    seriesStatesByPosition(db, tournament.tournamentId, stage.stageId, records),
    venueByMatchId(
      db,
      records.map((record) => record.matchId),
    ),
  ]);
  const definitionByCode = new Map(
    (descriptor?.eventDefinitions ?? []).map((definition) => [definition.code, definition]),
  );

  // One standings/trace read per distinct group the stage's matches actually
  // reference (including `undefined` for a stage with no explicit group
  // structure), not one per match.
  const distinctGroupIds = [
    ...new Set(records.map((record) => groupIdByFixture.get(record.fixtureId))),
  ];
  const standingsByGroup = new Map<
    string | undefined,
    { readonly position: ReadonlyMap<string, number>; readonly rawTrace: readonly TraceNode[] }
  >();
  for (const groupId of distinctGroupIds) {
    standingsByGroup.set(groupId, await positionAndTraceFor(db, tournament, stage.number, groupId));
  }

  return Promise.all(
    records.map(async (record): Promise<MatchesViewRow> => {
      const groupId = groupIdByFixture.get(record.fixtureId);
      const zoneNames = groupId === undefined ? undefined : zoneNamesByGroup.get(groupId);
      const standings = standingsByGroup.get(groupId);
      const series = seriesByPosition.get(`${record.round}:${record.position}`);
      const scores = record.scores;
      const status = publicMatchStatus(record.status);

      const decidingFactor =
        series === undefined && standings !== undefined
          ? decidingFactorOf(standings.rawTrace, record.homeEntrantId, record.awayEntrantId)
          : undefined;

      const [events, segments] = await Promise.all([
        competition.listEvents(record.matchId),
        status === 'live' ? competition.listSegments(record.matchId) : Promise.resolve([]),
      ]);
      const latestEvent = events.at(-1);
      const activeSegment = segments.find((segment) => segment.state === 'active');
      const venueName = venueByMatch.get(record.matchId);

      return {
        matchId: record.matchId,
        stageNumber: stage.number,
        matchNumber: record.games[0]?.number ?? 1,
        round: record.round,
        status,
        ...(record.homeEntrantId === undefined ? {} : { homeEntrantId: record.homeEntrantId }),
        ...(record.homeEntrantId === undefined
          ? {}
          : { homeName: names.get(record.homeEntrantId)?.name ?? 'Unknown' }),
        ...(record.homeEntrantId === undefined
          ? {}
          : { homeAbbreviation: names.get(record.homeEntrantId)?.abbreviation }),
        ...(record.awayEntrantId === undefined ? {} : { awayEntrantId: record.awayEntrantId }),
        ...(record.awayEntrantId === undefined
          ? {}
          : { awayName: names.get(record.awayEntrantId)?.name ?? 'Unknown' }),
        ...(record.awayEntrantId === undefined
          ? {}
          : { awayAbbreviation: names.get(record.awayEntrantId)?.abbreviation }),
        ...(scores?.[0] === undefined ? {} : { homeScore: scores[0] }),
        ...(scores?.[1] === undefined ? {} : { awayScore: scores[1] }),
        ...(venueName === undefined ? {} : { venueName }),
        ...(activeSegment === undefined
          ? {}
          : { clockSeconds: elapsedSecondsOf(activeSegment, Date.now()) }),
        ...(latestEvent === undefined
          ? {}
          : {
              latestEvent: {
                label: eventLabel(latestEvent.definitionCode, definitionByCode),
                occurredAt: latestEvent.occurredAt,
              },
            }),
        // series and zone/position are mutually exclusive by construction: a
        // series-settled cross never resolves a zone name for the same round/position.
        ...(series === undefined
          ? {
              ...(zoneNames?.zoneName === undefined ? {} : { zoneName: zoneNames.zoneName }),
              ...(zoneNames?.groupName === undefined ? {} : { groupName: zoneNames.groupName }),
              ...(record.homeEntrantId === undefined || standings === undefined
                ? {}
                : { homePosition: standings.position.get(record.homeEntrantId) }),
              ...(record.awayEntrantId === undefined || standings === undefined
                ? {}
                : { awayPosition: standings.position.get(record.awayEntrantId) }),
            }
          : { series }),
        ...(decidingFactor === undefined ? {} : { decidingFactor }),
        ...(record.homeEntrantId === undefined
          ? {}
          : { homeClubId: clubIdByEntrant.get(record.homeEntrantId) }),
        ...(record.awayEntrantId === undefined
          ? {}
          : { awayClubId: clubIdByEntrant.get(record.awayEntrantId) }),
        ...(standings === undefined ? {} : { rawTrace: standings.rawTrace }),
      };
    }),
  );
}

function publicMatchStatus(status: string): 'upcoming' | 'live' | 'final' {
  if (status === 'finalized') return 'final';
  if (status === 'in-progress') return 'live';
  return 'upcoming';
}

function eventLabel(
  definitionCode: string,
  definitionByCode: ReadonlyMap<string, EventDefinition>,
): string {
  const definition = definitionByCode.get(definitionCode);
  return definition ? resolveLabel(definition.label, 'en') : definitionCode;
}

async function clubIdsOfEntrants(
  db: Kysely<Database>,
  enrollment: EnrollmentRepository,
  entrantIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (entrantIds.length === 0) return new Map();
  const entrantTeams = await db
    .selectFrom('entrants')
    .select(['entrant_id', 'team_id'])
    .where('entrant_id', 'in', entrantIds)
    .execute();
  const teamIdByEntrant = new Map(
    entrantTeams.flatMap((entrant) =>
      entrant.team_id === null ? [] : [[entrant.entrant_id, entrant.team_id] as const],
    ),
  );
  const clubIdByTeam = await enrollment.clubsOfTeams([...new Set(teamIdByEntrant.values())]);
  return new Map(
    [...teamIdByEntrant.entries()].flatMap(([entrantId, teamId]) => {
      const clubId = clubIdByTeam.get(teamId);
      return clubId === undefined ? [] : [[entrantId, clubId] as const];
    }),
  );
}

async function zoneAndGroupNamesByGroupId(
  db: Kysely<Database>,
  stageId: string,
): Promise<ReadonlyMap<string, { readonly zoneName?: string; readonly groupName?: string }>> {
  const competition = new CompetitionRepository(db);
  const zones = await competition.listZonesOfStage(stageId);
  const result = new Map<string, { readonly zoneName?: string; readonly groupName?: string }>();
  for (const zone of zones) {
    const groups = await competition.listGroupsOfZone(zone.zoneId);
    for (const group of groups) {
      result.set(group.groupId, {
        ...(isImplicitZone(zone) ? {} : { zoneName: zone.name }),
        ...(isImplicitGroup(group) ? {} : { groupName: group.name }),
      });
    }
  }
  return result;
}

async function seriesStatesByPosition(
  db: Kysely<Database>,
  tournamentId: string,
  stageId: string,
  records: readonly StageMatchRecord[],
): Promise<ReadonlyMap<string, PublicSeriesState>> {
  const declaration = await readStageSeries(db, { tournamentId, stageId });
  if (declaration === undefined) return new Map();

  const matches = await new CompetitionRepository(db).listMatchesForStage(stageId);
  const byFixture = new Map<string, typeof matches>();
  for (const match of matches) {
    byFixture.set(match.fixtureId, [...(byFixture.get(match.fixtureId) ?? []), match]);
  }

  const states = new Map<string, PublicSeriesState>();
  for (const record of records) {
    const games = byFixture.get(record.fixtureId) ?? [];
    const state = publicSeriesState({
      declaration,
      ...(record.homeEntrantId === undefined ? {} : { homeEntrantId: record.homeEntrantId }),
      ...(record.awayEntrantId === undefined ? {} : { awayEntrantId: record.awayEntrantId }),
      games,
    });
    if (state !== undefined) states.set(`${record.round}:${record.position}`, state);
  }
  return states;
}

/**
 * Position and the raw trace for one group (or the whole stage, when
 * `groupId` is undefined) — swallows a format `readStandings` can't rank
 * (e.g. a pure elimination stage) rather than failing the whole card list,
 * since a match card's position/deciding-factor line is additive context,
 * not something every stage format is expected to have.
 */
async function positionAndTraceFor(
  db: Kysely<Database>,
  tournament: Pick<Tournament, 'tournamentId' | 'organizationId' | 'disciplineRef'>,
  stageNumber: number,
  groupId: string | undefined,
): Promise<{
  readonly position: ReadonlyMap<string, number>;
  readonly rawTrace: readonly TraceNode[];
}> {
  try {
    const result = await readStandings(db, tournament, stageNumber, groupId);
    return {
      position: new Map(result.rows.map((row) => [row.entrantId, row.rank])),
      rawTrace: result.rawTrace as readonly TraceNode[],
    };
  } catch {
    return { position: new Map(), rawTrace: [] };
  }
}

function decidingFactorOf(
  rawTrace: readonly TraceNode[],
  homeEntrantId: string | undefined,
  awayEntrantId: string | undefined,
): string | undefined {
  return (
    (homeEntrantId === undefined ? undefined : decidingFactorLabel(rawTrace, homeEntrantId)) ??
    (awayEntrantId === undefined ? undefined : decidingFactorLabel(rawTrace, awayEntrantId))
  );
}

async function venueByMatchId(
  db: Kysely<Database>,
  matchIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (matchIds.length === 0) return new Map();
  const rows = await db
    .selectFrom('match_schedule_assignments')
    .innerJoin('schedule_slots', 'schedule_slots.slot_id', 'match_schedule_assignments.slot_id')
    .innerJoin('venues', 'venues.venue_id', 'schedule_slots.venue_id')
    .select(['match_schedule_assignments.match_id', 'venues.name as venue_name'])
    .where('match_schedule_assignments.match_id', 'in', matchIds)
    .execute();
  return new Map(rows.map((row) => [row.match_id, row.venue_name]));
}
