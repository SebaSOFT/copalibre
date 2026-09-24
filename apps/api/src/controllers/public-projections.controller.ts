import { Controller, Get, Param, Query, Inject, Logger } from '@nestjs/common';
import { NotFoundException } from '../http/error-contract.js';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { SecurityPlaneTag } from '../auth/security-plane.js';
import {
  Database,
  TournamentRepository,
  EnrollmentRepository,
  CompetitionRepository,
  PersonRepository,
  withTransaction,
  StageReadModel,
  stageMatchOrdinals,
  PublicOverviewReadModel,
} from '@copalibre/persistence';
import {
  PublicOverviewResponse,
  PublicLiveResponse,
  PublicBracketResponse,
  PublicMatchesViewResponse,
  PublicOverviewMatchResponse,
  PublicMatchReportResponse,
  PublicPersonProfileResponse,
  PlayerStatisticsDrilldownResponse,
  PublicOrganizationTournamentListResponse,
  PublicTournamentListingItemResponse,
  PublicTournamentWinnerZoneResponse,
} from '../dto/public-tournament.dto.js';
import { TableLayoutListResponse, TableProjectionResponse } from '../dto/table-projections.dto.js';
import { Kysely } from 'kysely';
import { DATABASE } from '../database.token.js';
import { readStandings } from '../standings/read.js';
import { readMatchesView } from '../matches-view/read.js';
import {
  listEffectiveTableLayouts,
  readPlayerStatisticsDrilldown,
  readSegmentedTableProjection,
  readTableProjection,
  type PlayerStatisticsDrilldownResult,
} from '../table-projections/read.js';

import { toBracketMatch, ambiguousRoundPositions } from './seeding.controller.js';
import { resolveStageZones } from './bracket-zones.js';
import { readStageSeriesByPosition, seriesResponseOf } from './stage-series.js';
import { reconstructChampionshipFixture } from './tournament-winner-resolution.js';
import { segmentedTableResponse, tableResponse } from './table-projections.controller.js';
import { generateFixtures } from '@copalibre/tournament-engine';
import {
  resolveLabel,
  ageAt,
  primaryScoreOf,
  compileEffectiveRuleset,
  type DisciplineDescriptor,
  type StatisticCollector,
  type Tournament,
  type LocalizedLabel,
  deriveTournamentStatus,
} from '@copalibre/domain';

/** A dot-path's value in a compiled ruleset's nested config tree, `undefined` when absent. */
function fieldValueAt(config: Record<string, unknown>, dotPath: string): unknown {
  return dotPath.split('.').reduce<unknown>((node, key) => {
    if (node === undefined || node === null || typeof node !== 'object') return undefined;
    return (node as Record<string, unknown>)[key];
  }, config);
}

@ApiTags('Public Projections')
@Controller('organizations/:organizationAlias/public/tournaments')
export class PublicTournamentListingController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  @Get()
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'List published tournaments for an organization' })
  @ApiOkResponse({ type: PublicOrganizationTournamentListResponse })
  async listTournaments(
    @Param('organizationAlias') organizationAlias: string,
  ): Promise<PublicOrganizationTournamentListResponse> {
    const organization = await this.db
      .selectFrom('organizations')
      .select(['organization_id as organizationId', 'name', 'alias', 'emblem_object_id'])
      .where('alias', '=', organizationAlias)
      .executeTakeFirst();

    if (!organization) {
      throw new NotFoundException(`No organization "${organizationAlias}"`, {
        errorCode: 'public-projection-not-found',
      });
    }

    const clubs = await new EnrollmentRepository(this.db).listClubs(organization.organizationId);
    const tournamentRepo = new TournamentRepository(this.db);
    const publishedTournaments = await tournamentRepo.listPublishedByOrganization(
      organization.organizationId,
    );

    const descriptorRows = await this.db
      .selectFrom('discipline_descriptors')
      .select(['descriptor_id as descriptorId', 'document'])
      .execute();
    const descriptorMap = new Map<string, DisciplineDescriptor>();
    for (const d of descriptorRows) {
      const parsed = (
        typeof d.document === 'string' ? JSON.parse(d.document) : d.document
      ) as DisciplineDescriptor;
      descriptorMap.set(d.descriptorId, parsed);
    }

    const overviewReadModel = new PublicOverviewReadModel(this.db);
    const tournamentItems: PublicTournamentListingItemResponse[] = [];

    for (const t of publishedTournaments) {
      const matches = await overviewReadModel.matchesForTournament(t.tournamentId);
      const status = deriveTournamentStatus(t.status, matches);

      const desc = descriptorMap.get(t.disciplineRef.descriptorId);
      const discipline = {
        descriptorId: t.disciplineRef.descriptorId,
        version: t.disciplineRef.version,
        name: desc?.name ? resolveLabel(desc.name, 'en') : undefined,
      };

      const dates =
        t.startedAt || t.archivedAt
          ? {
              startedAt: t.startedAt,
              archivedAt: t.archivedAt,
            }
          : undefined;

      let winners: PublicTournamentWinnerZoneResponse[] | undefined = undefined;
      if (status === 'finished') {
        winners = await resolveTournamentWinners(this.db, t);
      }

      tournamentItems.push({
        tournamentId: t.tournamentId,
        alias: t.alias,
        name: t.name,
        status,
        discipline,
        ...(dates ? { dates } : {}),
        ...(winners && winners.length > 0 ? { winners } : {}),
        ...(t.emblemObjectId ? { emblemObjectId: t.emblemObjectId } : {}),
        featured: t.featured,
      });
    }

    return {
      organizationAlias: organization.alias,
      organizationName: organization.name,
      ...(organization.emblem_object_id
        ? { organizationEmblemObjectId: organization.emblem_object_id }
        : {}),
      tournaments: tournamentItems,
      clubs: clubs.map((club) => ({
        clubId: club.clubId,
        name: club.name,
        ...(club.alias ? { alias: club.alias } : {}),
        ...(club.emblemObjectId ? { emblemObjectId: club.emblemObjectId } : {}),
      })),
    };
  }
}

const resolveTournamentWinnersLogger = new Logger('resolveTournamentWinners');

export async function resolveTournamentWinners(
  db: Kysely<Database>,
  tournament: Tournament,
): Promise<PublicTournamentWinnerZoneResponse[]> {
  const competitionRepo = new CompetitionRepository(db);
  const enrollmentRepo = new EnrollmentRepository(db);
  const stages = await competitionRepo.listStagesOfTournament(tournament.tournamentId);
  if (stages.length === 0) return [];

  const sortedStages = [...stages].sort((a, b) => a.number - b.number);
  const terminalStage = sortedStages[sortedStages.length - 1];
  if (!terminalStage) return [];

  const zoneRows = await db
    .selectFrom('zones')
    .selectAll()
    .where('stage_id', '=', terminalStage.stageId)
    .orderBy('number')
    .execute();

  const zonesToProcess: { zoneId?: string; zoneName?: string }[] =
    zoneRows.length > 0
      ? zoneRows.map((z) => ({
          zoneId: z.zone_id,
          zoneName: z.name,
        }))
      : [{ zoneId: undefined, zoneName: undefined }];

  const results: PublicTournamentWinnerZoneResponse[] = [];

  for (const zone of zonesToProcess) {
    // Each zone is resolved independently: one zone's error or ambiguous
    // terminal round must never prevent the other zones from resolving
    // (openspec 0245 — previously an uncaught error in this loop's duel
    // branch aborted every zone's result, not just the failing one).
    try {
      const isDuel =
        terminalStage.format === 'single-elimination' ||
        terminalStage.format === 'double-elimination';

      if (isDuel) {
        const readModel = new StageReadModel(db);
        const record = await readModel.stageRecord(terminalStage.stageId, undefined, zone.zoneId);
        const fixtures = await readModel.matches(terminalStage.stageId, undefined, zone.zoneId);
        const generated = generateFixtures({
          format: terminalStage.format,
          entrants: (record?.entrantIds ?? []).map((entrantId, index) => ({
            entrantId,
            seed: index + 1,
          })),
        });
        const winnersByFixtureId = new Map(
          (record?.outcomes ?? [])
            .filter(
              (outcome) => outcome.fixtureId !== undefined && outcome.winnerEntrantId !== undefined,
            )
            .map((outcome) => [outcome.fixtureId as string, outcome.winnerEntrantId as string]),
        );
        const resolved = generated.ok
          ? reconstructChampionshipFixture({
              graph: generated.value,
              records: fixtures,
              winnerByFixtureId: winnersByFixtureId,
            })
          : undefined;

        if (resolved) {
          const podiumDetails = await enrollmentRepo.resolveEntrantPodiumDetails([
            ...resolved.championEntrantIds,
            ...(resolved.runnerUpEntrantId ? [resolved.runnerUpEntrantId] : []),
          ]);
          const champions = resolved.championEntrantIds.flatMap((entrantId) => {
            const details = podiumDetails.get(entrantId);
            return details
              ? [
                  {
                    entrantId,
                    name: details.name,
                    abbreviation: details.abbreviation,
                    clubId: details.clubId,
                    emblemObjectId: details.emblemObjectId,
                  },
                ]
              : [];
          });
          const championDetails = champions[0];
          const runnerUpEntrantId = resolved.runnerUpEntrantId;
          const runnerUpDetails = runnerUpEntrantId
            ? podiumDetails.get(runnerUpEntrantId)
            : undefined;

          if (championDetails && champions.length === resolved.championEntrantIds.length) {
            results.push({
              ...(zone.zoneId ? { zoneId: zone.zoneId } : {}),
              ...(zone.zoneName ? { zoneName: zone.zoneName } : {}),
              champion: championDetails,
              champions,
              ...(runnerUpDetails && runnerUpEntrantId
                ? {
                    runnerUp: {
                      entrantId: runnerUpEntrantId,
                      name: runnerUpDetails.name,
                      abbreviation: runnerUpDetails.abbreviation,
                      clubId: runnerUpDetails.clubId,
                      emblemObjectId: runnerUpDetails.emblemObjectId,
                    },
                  }
                : {}),
            });
          }
        } else {
          resolveTournamentWinnersLogger.warn(
            `Could not uniquely reconstruct the championship fixture for zone ${zone.zoneId ?? '(default)'} of tournament ${tournament.tournamentId}; skipping this zone's champion`,
          );
        }
      } else {
        const standings = await readStandings(db, tournament, terminalStage.number);
        if (standings.rows.length > 0) {
          const rank1 = standings.rows.find((r) => r.rank === 1) ?? standings.rows[0];
          const rank2 =
            standings.rows.find((r) => r.rank === 2) ??
            (standings.rows.length > 1 ? standings.rows[1] : undefined);
          if (rank1) {
            const entrantIds = rank2 ? [rank1.entrantId, rank2.entrantId] : [rank1.entrantId];
            const podiumDetails = await enrollmentRepo.resolveEntrantPodiumDetails(entrantIds);
            const championDetails = podiumDetails.get(rank1.entrantId);

            if (championDetails) {
              const runnerUpDetails = rank2 ? podiumDetails.get(rank2.entrantId) : undefined;
              results.push({
                ...(zone.zoneId ? { zoneId: zone.zoneId } : {}),
                ...(zone.zoneName ? { zoneName: zone.zoneName } : {}),
                champion: {
                  entrantId: rank1.entrantId,
                  name: championDetails.name,
                  abbreviation: championDetails.abbreviation,
                  clubId: championDetails.clubId,
                  emblemObjectId: championDetails.emblemObjectId,
                },
                champions: [
                  {
                    entrantId: rank1.entrantId,
                    name: championDetails.name,
                    abbreviation: championDetails.abbreviation,
                    clubId: championDetails.clubId,
                    emblemObjectId: championDetails.emblemObjectId,
                  },
                ],
                ...(runnerUpDetails && rank2
                  ? {
                      runnerUp: {
                        entrantId: rank2.entrantId,
                        name: runnerUpDetails.name,
                        abbreviation: runnerUpDetails.abbreviation,
                        clubId: runnerUpDetails.clubId,
                        emblemObjectId: runnerUpDetails.emblemObjectId,
                      },
                    }
                  : {}),
              });
            }
          }
        }
      }
    } catch (error) {
      resolveTournamentWinnersLogger.warn(
        `Failed to resolve winner for zone ${zone.zoneId ?? '(default)'} of tournament ${
          tournament.tournamentId
        }: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return results;
}

@ApiTags('Public Projections')
@Controller('organizations/:organizationAlias/tournaments/:tournamentAlias')
export class PublicProjectionsController {
  constructor(@Inject(DATABASE) private readonly db: Kysely<Database>) {}

  private async resolvePublishedTournament(organizationAlias: string, tournamentAlias: string) {
    const tournament = await new TournamentRepository(this.db).findByScopedAlias(
      organizationAlias,
      tournamentAlias,
    );
    if (!tournament || tournament.status === 'draft') {
      throw new NotFoundException(
        `No tournament "${tournamentAlias}" in organization "${organizationAlias}"`,
        { errorCode: 'public-projection-not-found' },
      );
    }
    const organization = await this.db
      .selectFrom('organizations')
      .select('name')
      .where('organization_id', '=', tournament.organizationId)
      .executeTakeFirst();
    if (!organization) throw new NotFoundException({ errorCode: 'public-projection-not-found' });

    return { tournament, organizationName: organization.name };
  }

  @Get('overview')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'Overview of a tournament' })
  @ApiOkResponse({ type: PublicOverviewResponse })
  async overview(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
  ): Promise<PublicOverviewResponse> {
    const { tournament, organizationName } = await this.resolvePublishedTournament(
      organizationAlias,
      tournamentAlias,
    );
    const season = await withTransaction(this.db, (uow) =>
      new CompetitionRepository(this.db).currentSeason(uow, {
        tournamentId: tournament.tournamentId,
        organizationId: tournament.organizationId,
        actor: 'system',
        authorizationContext: '',
      }),
    );

    const matches = await new PublicOverviewReadModel(this.db).matchesForTournament(
      tournament.tournamentId,
    );

    const entrantIds = new Set<string>();
    for (const match of matches) {
      if (match.homeEntrantId) entrantIds.add(match.homeEntrantId);
      if (match.awayEntrantId) entrantIds.add(match.awayEntrantId);
    }
    const names = await new EnrollmentRepository(this.db).resolveEntrantNames(
      Array.from(entrantIds),
    );

    const rulesetData = await new TournamentRepository(this.db).findLatestRuleset(
      tournament.tournamentId,
    );
    const descriptor = await new TournamentRepository(this.db).findDescriptor(
      tournament.disciplineRef.descriptorId,
      tournament.disciplineRef.version,
    );
    const ruleset: Record<string, string> = {};
    const rulesetLabels: Record<string, string | LocalizedLabel> = {};
    if (rulesetData) {
      // The compiled *effective* value (discipline default merged with the
      // tournament's overrides, per each field's merge strategy) — never the
      // raw override delta, which for a `merged` field is only the addition
      // (openspec 0267). Falls back to the raw delta if compilation fails or
      // the descriptor is unavailable, so the public page never breaks.
      const compiled = descriptor ? compileEffectiveRuleset(descriptor, rulesetData) : undefined;
      for (const [k, v] of Object.entries(rulesetData.overrides)) {
        ruleset[k] = compiled?.ok ? String(fieldValueAt(compiled.value.config, k)) : String(v);
        const label = descriptor?.fieldPolicies[k]?.label;
        if (label !== undefined) rulesetLabels[k] = label;
      }
    }

    const stages = await new CompetitionRepository(this.db).listStages(season.seasonId);
    let standingsPreview: PublicOverviewResponse['standingsPreview'] = undefined;
    let standingsGrain: PublicOverviewResponse['standingsGrain'] = undefined;
    if (stages.length > 0) {
      const stage = stages[0];
      if (stage) {
        const standings = await readStandings(this.db, tournament, stage.number);

        const standingsEntrantIds = standings.rows.map((r) => r.entrantId);
        const standingsNames = await new EnrollmentRepository(this.db).resolveEntrantNames(
          standingsEntrantIds,
        );

        standingsPreview = standings.rows.map((r) => ({
          rank: r.rank,
          entrantId: r.entrantId,
          name: standingsNames.get(r.entrantId)?.name ?? 'Unknown',
          abbreviation: standingsNames.get(r.entrantId)?.abbreviation,
          sharedRank: r.sharedRank,
          statistics: r.statistics,
        }));
        standingsGrain = standings.grain;
      }
    }

    const clubRows = await this.db
      .selectFrom('entrants')
      .innerJoin('teams', 'teams.team_id', 'entrants.team_id')
      .innerJoin('clubs', 'clubs.club_id', 'teams.club_id')
      .select([
        'clubs.club_id as clubId',
        'clubs.name',
        'clubs.alias',
        'clubs.emblem_object_id as emblemObjectId',
      ])
      .where('entrants.tournament_id', '=', tournament.tournamentId)
      .distinct()
      .orderBy('clubs.name')
      .execute();

    const status = deriveTournamentStatus(tournament.status, matches);
    let winners: PublicTournamentWinnerZoneResponse[] | undefined = undefined;
    if (status === 'finished') {
      winners = await resolveTournamentWinners(this.db, tournament);
    }

    return {
      organizationAlias,
      organizationName,
      tournamentAlias,
      tournamentName: tournament.name,
      seasonName: season.name,
      status,
      ...(winners && winners.length > 0 ? { winners } : {}),
      ...(tournament.emblemObjectId ? { emblemObjectId: tournament.emblemObjectId } : {}),
      ...(descriptor?.images === undefined
        ? {}
        : { disciplineImages: descriptor.images.map((reference) => ({ ...reference })) }),
      matches: matches.map((m) => ({
        matchId: m.matchId,
        matchNumber: m.matchNumber,
        stageNumber: m.stageNumber,
        round: m.round,
        status: m.status as PublicOverviewMatchResponse['status'],
        homeEntrantId: m.homeEntrantId ?? undefined,
        homeName: m.homeEntrantId ? (names.get(m.homeEntrantId)?.name ?? 'Unknown') : undefined,
        homeAbbreviation: m.homeEntrantId ? names.get(m.homeEntrantId)?.abbreviation : undefined,
        awayEntrantId: m.awayEntrantId ?? undefined,
        awayName: m.awayEntrantId ? (names.get(m.awayEntrantId)?.name ?? 'Unknown') : undefined,
        awayAbbreviation: m.awayEntrantId ? names.get(m.awayEntrantId)?.abbreviation : undefined,
        homeScore: m.scores?.[0],
        awayScore: m.scores?.[1],
        scheduledAt: m.scheduledAt,
      })),
      standingsPreview,
      standingsGrain,
      clubs: clubRows.map((c) => ({
        clubId: c.clubId,
        name: c.name,
        ...(c.alias ? { alias: c.alias } : {}),
        ...(c.emblemObjectId ? { emblemObjectId: c.emblemObjectId } : {}),
      })),
      ruleset,
      ...(Object.keys(rulesetLabels).length > 0 ? { rulesetLabels } : {}),
    };
  }

  @Get('stages/:stageNumber/matches/:matchNumber')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'Public report for one match' })
  @ApiOkResponse({ type: PublicMatchReportResponse })
  async matchReport(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber') stageNumberValue: string,
    @Param('matchNumber') matchNumberValue: string,
  ): Promise<PublicMatchReportResponse> {
    const { tournament, organizationName } = await this.resolvePublishedTournament(
      organizationAlias,
      tournamentAlias,
    );
    const stageNumber = Number(stageNumberValue);
    const matchNumber = Number(matchNumberValue);
    if (
      !Number.isSafeInteger(stageNumber) ||
      stageNumber < 1 ||
      !Number.isSafeInteger(matchNumber) ||
      matchNumber < 1
    ) {
      throw new NotFoundException({ errorCode: 'public-projection-not-found' });
    }

    const competition = new CompetitionRepository(this.db);
    const stage = (await competition.listStagesOfTournament(tournament.tournamentId)).find(
      (candidate) => candidate.number === stageNumber,
    );
    if (!stage)
      throw new NotFoundException(`No stage ${stageNumberValue} in tournament`, {
        errorCode: 'public-projection-not-found',
      });

    // `matches.number` is a per-fixture series-game index (always 1 for a
    // non-series fixture) — never stage-unique, so this resolves the target
    // match by indexing into the stage's own deterministic order instead of
    // filtering by that column (openspec 0249).
    const stageMatches = await new StageReadModel(this.db).matches(stage.stageId);
    const targetRecord = stageMatches[matchNumber - 1];
    if (!targetRecord)
      throw new NotFoundException(`No match ${matchNumberValue} in stage ${stageNumberValue}`, {
        errorCode: 'public-projection-not-found',
      });

    const match = await this.db
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select([
        'matches.match_id',
        'matches.number',
        'matches.status',
        'matches.result',
        'fixtures.fixture_id',
        'fixtures.round',
        'fixtures.home_entrant_id',
        'fixtures.away_entrant_id',
      ])
      .where('fixtures.fixture_id', '=', targetRecord.fixtureId)
      .executeTakeFirst();
    if (!match)
      throw new NotFoundException(`No match ${matchNumberValue} in stage ${stageNumberValue}`, {
        errorCode: 'public-projection-not-found',
      });

    const [schedule, officials, rosterRows, segments, events, descriptor] = await Promise.all([
      this.db
        .selectFrom('match_schedule_assignments')
        .innerJoin('schedule_slots', 'schedule_slots.slot_id', 'match_schedule_assignments.slot_id')
        .leftJoin('venues', 'venues.venue_id', 'schedule_slots.venue_id')
        .select([
          'schedule_slots.starts_at',
          'match_schedule_assignments.published',
          'venues.name as venue_name',
        ])
        .where('match_schedule_assignments.match_id', '=', match.match_id)
        .executeTakeFirst(),
      this.db
        .selectFrom('match_schedule_assignments')
        .innerJoin(
          'match_schedule_officials',
          'match_schedule_officials.match_id',
          'match_schedule_assignments.match_id',
        )
        .innerJoin('officials', 'officials.official_id', 'match_schedule_officials.official_id')
        .select(['officials.display_name', 'officials.roles'])
        .where('match_schedule_assignments.match_id', '=', match.match_id)
        .where('match_schedule_assignments.published', '=', true)
        .orderBy('officials.display_name')
        .execute(),
      this.db
        .selectFrom('match_rosters')
        .select(['entrant_id', 'roster_members'])
        .where('match_id', '=', match.match_id)
        .execute(),
      competition.listSegments(match.match_id),
      competition.listEvents(match.match_id),
      new TournamentRepository(this.db).findDescriptor(
        tournament.disciplineRef.descriptorId,
        tournament.disciplineRef.version,
      ),
    ]);
    if (!descriptor)
      throw new NotFoundException('Tournament discipline descriptor is unavailable', {
        errorCode: 'public-projection-not-found',
      });

    const entrantIds = [match.home_entrant_id, match.away_entrant_id].filter(
      (entrantId): entrantId is string => entrantId !== null,
    );
    const entrantNames = await new EnrollmentRepository(this.db).resolveEntrantNames(entrantIds);
    const rosterByEntrant = new Map(
      rosterRows.map((roster) => [roster.entrant_id, roster.roster_members]),
    );
    const segmentNumberById = new Map(
      segments.map((segment) => [segment.segmentId, segment.number]),
    );
    const definitionByCode = new Map(
      descriptor.eventDefinitions.map((definition) => [definition.code, definition]),
    );
    const result = match.result as unknown as {
      readonly sides?: readonly { readonly statistics?: Record<string, number> }[];
    } | null;
    const scores = result?.sides === undefined ? undefined : publicScores(result.sides, descriptor);

    return {
      organizationAlias,
      organizationName,
      tournamentAlias,
      tournamentName: tournament.name,
      ...(descriptor.images === undefined
        ? {}
        : { disciplineImages: descriptor.images.map((reference) => ({ ...reference })) }),
      stageNumber,
      stageFormat: stage.format,
      matchNumber,
      round: match.round,
      status: publicMatchStatus(match.status),
      ...(match.home_entrant_id === null ? {} : { homeEntrantId: match.home_entrant_id }),
      ...(match.home_entrant_id === null
        ? {}
        : { homeName: entrantNames.get(match.home_entrant_id)?.name ?? 'Unknown' }),
      ...(match.home_entrant_id === null
        ? {}
        : { homeAbbreviation: entrantNames.get(match.home_entrant_id)?.abbreviation }),
      ...(match.away_entrant_id === null ? {} : { awayEntrantId: match.away_entrant_id }),
      ...(match.away_entrant_id === null
        ? {}
        : { awayName: entrantNames.get(match.away_entrant_id)?.name ?? 'Unknown' }),
      ...(match.away_entrant_id === null
        ? {}
        : { awayAbbreviation: entrantNames.get(match.away_entrant_id)?.abbreviation }),
      ...(scores?.[0] === undefined ? {} : { homeScore: scores[0] }),
      ...(scores?.[1] === undefined ? {} : { awayScore: scores[1] }),
      ...(schedule === undefined ? {} : { scheduledAt: scheduleStartsAt(schedule.starts_at) }),
      ...(schedule?.venue_name === null || schedule?.venue_name === undefined
        ? {}
        : { venueName: schedule.venue_name }),
      schedulePublished: schedule?.published ?? false,
      officials: officials.map((official) => ({
        name: official.display_name,
        roles: [...official.roles],
      })),
      rosters: {
        home: match.home_entrant_id
          ? (rosterByEntrant.get(match.home_entrant_id) ?? []).map(({ roles, ...member }) => ({
              ...member,
              ...(roles === undefined ? {} : { roles: [...roles] }),
            }))
          : [],
        away: match.away_entrant_id
          ? (rosterByEntrant.get(match.away_entrant_id) ?? []).map(({ roles, ...member }) => ({
              ...member,
              ...(roles === undefined ? {} : { roles: [...roles] }),
            }))
          : [],
      },
      timeline: events.map((event) => {
        const definition = definitionByCode.get(event.definitionCode);
        const workflowOutcomeCodes = definition?.workflow?.options.map(
          (option) => option.definitionCode,
        );
        return {
          eventId: event.eventId,
          definitionCode: event.definitionCode,
          label: definition ? resolveLabel(definition.label, 'en') : event.definitionCode,
          ...(workflowOutcomeCodes === undefined ? {} : { workflowOutcomeCodes }),
          occurredAt: event.occurredAt,
          sequence: event.sequence,
          ...(event.segmentId === undefined
            ? {}
            : { segmentNumber: segmentNumberById.get(event.segmentId) }),
          ...(event.side === undefined ? {} : { side: event.side }),
          ...(event.personId === undefined ? {} : { personId: event.personId }),
          payload: event.payload,
        };
      }),
    };
  }

  @Get('live')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'Live matches of a tournament' })
  @ApiOkResponse({ type: PublicLiveResponse })
  async live(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
  ): Promise<PublicLiveResponse> {
    const { tournament } = await this.resolvePublishedTournament(
      organizationAlias,
      tournamentAlias,
    );
    const matches = await new PublicOverviewReadModel(this.db).matchesForTournament(
      tournament.tournamentId,
    );
    const liveMatches = matches.filter((m) => m.status === 'in-progress');

    const entrantIds = new Set<string>();
    for (const match of liveMatches) {
      if (match.homeEntrantId) entrantIds.add(match.homeEntrantId);
      if (match.awayEntrantId) entrantIds.add(match.awayEntrantId);
    }
    const names = await new EnrollmentRepository(this.db).resolveEntrantNames(
      Array.from(entrantIds),
    );

    return {
      matches: liveMatches.map((m) => ({
        matchId: m.matchId,
        stageNumber: m.stageNumber,
        matchNumber: m.matchNumber ?? m.round,
        state: 'live',
        projectionVersion: 1,
        sides: [
          ...(m.homeEntrantId
            ? [
                {
                  entrantId: m.homeEntrantId,
                  name: names.get(m.homeEntrantId)?.name ?? 'Unknown',
                  abbreviation: names.get(m.homeEntrantId)?.abbreviation,
                  score: m.scores?.[0] ?? 0,
                },
              ]
            : []),
          ...(m.awayEntrantId
            ? [
                {
                  entrantId: m.awayEntrantId,
                  name: names.get(m.awayEntrantId)?.name ?? 'Unknown',
                  abbreviation: names.get(m.awayEntrantId)?.abbreviation,
                  score: m.scores?.[1] ?? 0,
                },
              ]
            : []),
        ],
      })),
    };
  }

  @Get('stages/:stageNumber/bracket')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'Bracket for a stage' })
  @ApiOkResponse({ type: PublicBracketResponse })
  async bracket(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber') stageNumberStr: string,
  ): Promise<PublicBracketResponse> {
    const { tournament } = await this.resolvePublishedTournament(
      organizationAlias,
      tournamentAlias,
    );
    const stageNumber = parseInt(stageNumberStr, 10);

    const compRepo = new CompetitionRepository(this.db);
    const season = await withTransaction(this.db, (uow) =>
      compRepo.currentSeason(uow, {
        tournamentId: tournament.tournamentId,
        organizationId: tournament.organizationId,
        actor: 'system',
        authorizationContext: '',
      }),
    );
    const stages = await compRepo.listStages(season.seasonId);
    const stage = stages.find((s) => s.number === stageNumber);
    if (!stage) throw new NotFoundException({ errorCode: 'public-projection-not-found' });

    const readModel = new StageReadModel(this.db);
    const enrollmentRepo = new EnrollmentRepository(this.db);
    const zones = await resolveStageZones(this.db, stage.stageId);

    // Computed once, from every zone combined — a per-zone fetch below cannot
    // reconstruct this on its own, since it has no visibility into how many
    // matches other zones contribute ahead of it (openspec 0249).
    const ordinalByMatchId = stageMatchOrdinals(await readModel.matches(stage.stageId));

    const zoneResponses = await Promise.all(
      zones.map(async (zone) => {
        const stageMatchesMapped = await readModel.matches(stage.stageId, undefined, zone.zoneId);
        const record = await readModel.stageRecord(stage.stageId, undefined, zone.zoneId);

        // Seeded from this zone's own entrants, the same way the control panel's bracket is: the
        // graph's shape is a function of format plus seed order, and generating from an empty
        // entrant list produces no graph at all — which is what this endpoint used to return for
        // every stage, an empty bracket the public web then rendered as an empty page. Scoping the
        // entrant list (and every match lookup below) to this one zone is what stops a multi-zone
        // stage's zones from colliding on the same round/position (openspec 0246).
        const generated = generateFixtures({
          format: stage.format as Parameters<typeof generateFixtures>[0]['format'],
          entrants: (record?.entrantIds ?? []).map((entrantId, index) => ({
            entrantId,
            seed: index + 1,
          })),
        });
        if (!generated.ok) {
          return { ...zone, matches: [] };
        }
        const graph = generated.value;

        const ambiguous = ambiguousRoundPositions(graph.matches);

        const bracketMatches = graph.matches.map((match) =>
          toBracketMatch(match, stageMatchesMapped, {
            ambiguousPositions: ambiguous,
            matchFormat: undefined,
          }),
        );

        const entrantIds = new Set<string>();
        for (const match of bracketMatches) {
          for (const slot of match.slots) {
            if (slot.entrantId) entrantIds.add(slot.entrantId);
          }
        }
        const details = await enrollmentRepo.resolveEntrantPodiumDetails(Array.from(entrantIds));

        // Keyed by the round/position the bracket graph and the read model agree on, so a series
        // rides onto the cross it settles rather than onto a match id neither side shares — scoped
        // to this zone's own records, so a series can't ride onto another zone's identically
        // round/position-keyed cross.
        const seriesByPosition = await readStageSeriesByPosition(this.db, {
          tournamentId: tournament.tournamentId,
          stageId: stage.stageId,
          records: stageMatchesMapped,
        });

        return {
          ...zone,
          matches: bracketMatches.map((m) => {
            const series = seriesByPosition.get(`${m.round}:${m.position}`);
            return {
              matchId: m.matchId,
              bracket: m.bracket,
              round: m.round,
              position: m.position,
              status: m.status,
              format: m.format,
              ...(m.persistedMatchId === undefined
                ? {}
                : { matchNumber: ordinalByMatchId.get(m.persistedMatchId) }),
              slots: m.slots.map((s) => {
                const detail = s.entrantId ? details.get(s.entrantId) : undefined;
                return {
                  kind: s.kind,
                  entrantId: s.entrantId,
                  name: s.entrantId ? (detail?.name ?? 'Unknown') : undefined,
                  abbreviation: detail?.abbreviation,
                  clubId: detail?.clubId,
                  emblemObjectId: detail?.emblemObjectId,
                  matchId: s.matchId,
                  score: s.score,
                  resultReason: s.resultReason,
                };
              }),
              ...(series === undefined ? {} : { series: seriesResponseOf(series) }),
            };
          }),
        };
      }),
    );

    return { format: stage.format, zones: zoneResponses };
  }

  /**
   * The matches view: a flat, filterable card list — the whole tournament by
   * default, or one stage/group when named — richer than the bracket's own
   * card (venue, clock, latest event, a one-line deciding-factor summary for
   * a finalized tiebreak-decided match) but never the full internal
   * comparator trace; that stays behind `org.view-internal-standings` on the
   * control-web equivalent.
   */
  @Get('matches-view')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: "A tournament's matches, as a flat filterable list" })
  @ApiOkResponse({ type: PublicMatchesViewResponse })
  async matchesView(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Query('stageNumber') stageNumberValue: string | undefined,
    @Query('groupId') groupId: string | undefined,
    @Query('state') state: 'all' | 'live' | 'upcoming' | 'final' | undefined,
  ): Promise<PublicMatchesViewResponse> {
    const { tournament } = await this.resolvePublishedTournament(
      organizationAlias,
      tournamentAlias,
    );
    const stageNumber = stageNumberValue === undefined ? undefined : Number(stageNumberValue);
    if (stageNumber !== undefined && (!Number.isSafeInteger(stageNumber) || stageNumber < 1)) {
      throw new NotFoundException({ errorCode: 'public-projection-not-found' });
    }

    const rows = await readMatchesView(this.db, tournament, { stageNumber, groupId, state });
    return {
      matches: rows.map((row) => ({
        matchId: row.matchId,
        stageNumber: row.stageNumber,
        matchNumber: row.matchNumber,
        round: row.round,
        status: row.status,
        ...(row.homeEntrantId === undefined ? {} : { homeEntrantId: row.homeEntrantId }),
        ...(row.homeName === undefined ? {} : { homeName: row.homeName }),
        ...(row.homeAbbreviation === undefined ? {} : { homeAbbreviation: row.homeAbbreviation }),
        ...(row.awayEntrantId === undefined ? {} : { awayEntrantId: row.awayEntrantId }),
        ...(row.awayName === undefined ? {} : { awayName: row.awayName }),
        ...(row.awayAbbreviation === undefined ? {} : { awayAbbreviation: row.awayAbbreviation }),
        ...(row.homeScore === undefined ? {} : { homeScore: row.homeScore }),
        ...(row.awayScore === undefined ? {} : { awayScore: row.awayScore }),
        ...(row.clockSeconds === undefined ? {} : { clockSeconds: row.clockSeconds }),
        ...(row.venueName === undefined ? {} : { venueName: row.venueName }),
        ...(row.scheduledAt === undefined ? {} : { scheduledAt: row.scheduledAt }),
        ...(row.latestEvent === undefined ? {} : { latestEvent: row.latestEvent }),
        ...(row.zoneName === undefined ? {} : { zoneName: row.zoneName }),
        ...(row.groupName === undefined ? {} : { groupName: row.groupName }),
        ...(row.homePosition === undefined ? {} : { homePosition: row.homePosition }),
        ...(row.awayPosition === undefined ? {} : { awayPosition: row.awayPosition }),
        ...(row.series === undefined ? {} : { series: seriesResponseOf(row.series) }),
        ...(row.decidingFactor === undefined ? {} : { decidingFactor: row.decidingFactor }),
      })),
    };
  }

  // 'public/tables', not 'tables': the admin `TableProjectionsController`
  // already claims that exact path (same controller-level prefix) behind
  // `RequireOrganizationRole('admin')` — Fastify's router refuses two
  // handlers on one method+path, so the same leaf name cannot be reused
  // unauthenticated here.
  @Get('public/tables')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'Every table layout in effect for this tournament' })
  @ApiOkResponse({ type: TableLayoutListResponse })
  async tableLayouts(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
  ): Promise<TableLayoutListResponse> {
    const { tournament } = await this.resolvePublishedTournament(
      organizationAlias,
      tournamentAlias,
    );
    const layouts = await listEffectiveTableLayouts(this.db, {
      tournamentId: tournament.tournamentId,
      disciplineRef: tournament.disciplineRef,
    });
    return { layouts: layouts.map((layout) => ({ ...layout })) };
  }

  @Get('public/tables/:layoutCode')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'A tournament-wide table projection (player/team rankings)' })
  @ApiOkResponse({ type: TableProjectionResponse })
  async tournamentTable(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('layoutCode') layoutCode: string,
    @Query('clubId') clubId?: string,
  ): Promise<TableProjectionResponse> {
    const { tournament } = await this.resolvePublishedTournament(
      organizationAlias,
      tournamentAlias,
    );
    const result = await readTableProjection(
      this.db,
      {
        organizationId: tournament.organizationId,
        tournament: {
          tournamentId: tournament.tournamentId,
          disciplineRef: tournament.disciplineRef,
        },
        clubId,
      },
      layoutCode,
    );
    return tableResponse(result);
  }

  @Get('stages/:stageNumber/public/tables/:layoutCode')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'A stage-scoped table projection (group standings, schedule tables)' })
  @ApiOkResponse({ type: TableProjectionResponse })
  async stageTable(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber') stageNumberStr: string,
    @Param('layoutCode') layoutCode: string,
    @Query('clubId') clubId?: string,
  ): Promise<TableProjectionResponse> {
    const { tournament } = await this.resolvePublishedTournament(
      organizationAlias,
      tournamentAlias,
    );
    const stageNumber = parseInt(stageNumberStr, 10);
    const stages = await new CompetitionRepository(this.db).listStagesOfTournament(
      tournament.tournamentId,
    );
    const stage = stages.find((candidate) => candidate.number === stageNumber);
    if (!stage)
      throw new NotFoundException(`No stage ${stageNumberStr} in tournament`, {
        errorCode: 'public-projection-not-found',
      });

    const result = await readSegmentedTableProjection(
      this.db,
      {
        organizationId: tournament.organizationId,
        tournament: {
          tournamentId: tournament.tournamentId,
          disciplineRef: tournament.disciplineRef,
        },
        stageId: stage.stageId,
        clubId,
      },
      layoutCode,
    );
    return segmentedTableResponse(result);
  }

  @Get('persons/:personId/public/profile')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: "A person's public career and competition profile" })
  @ApiOkResponse({ type: PublicPersonProfileResponse })
  async playerProfile(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('personId') personId: string,
  ): Promise<PublicPersonProfileResponse> {
    const { tournament } = await this.resolvePublishedTournament(
      organizationAlias,
      tournamentAlias,
    );
    const people = new PersonRepository(this.db);
    const person = await people.findPerson(personId);
    if (!person || person.organizationId !== tournament.organizationId) {
      throw new NotFoundException(
        `No person "${personId}" found in organization "${organizationAlias}"`,
        { errorCode: 'public-projection-not-found' },
      );
    }

    const [history, careerDisciplineTotals] = await Promise.all([
      people.competitionHistory(tournament.organizationId, personId),
      people.careerTotals(tournament.organizationId, personId),
    ]);

    const descriptorRows = await this.db
      .selectFrom('discipline_descriptors')
      .select(['descriptor_id as descriptorId', 'document'])
      .execute();
    const descriptorMap = new Map<string, DisciplineDescriptor>();
    for (const d of descriptorRows) {
      const parsed = (
        typeof d.document === 'string' ? JSON.parse(d.document) : d.document
      ) as DisciplineDescriptor;
      descriptorMap.set(d.descriptorId, parsed);
    }

    const careerStatistics = careerDisciplineTotals.map((disc) => {
      const desc = descriptorMap.get(disc.descriptorId);
      const collectorMap = new Map<string, StatisticCollector>();
      if (desc?.collectors) {
        for (const c of desc.collectors) {
          collectorMap.set(c.code, c);
        }
      }
      return {
        disciplineDescriptorId: disc.descriptorId,
        disciplineName:
          disc.disciplineName ?? (desc?.name ? resolveLabel(desc.name, 'en') : undefined),
        statistics: disc.totals.map((tot) => {
          const colDef = collectorMap.get(tot.collectorCode);
          const label = colDef?.label ? resolveLabel(colDef.label, 'en') : tot.collectorCode;
          return {
            code: tot.collectorCode,
            label,
            value: tot.value,
            samples: tot.samples,
          };
        }),
      };
    });

    const competitionHistory = history.map((item) => {
      const desc = descriptorMap.get(item.disciplineRef.descriptorId);
      return {
        tournamentId: item.tournamentId,
        tournamentName: item.tournamentName,
        tournamentAlias: item.tournamentAlias,
        teamId: item.teamId,
        teamName: item.teamName,
        role: item.role,
        entrantId: item.entrantId,
        entrantName: item.entrantName,
        entrantAbbreviation: item.entrantAbbreviation,
        disciplineDescriptorId: item.disciplineRef.descriptorId,
        disciplineDescriptorVersion: item.disciplineRef.version,
        disciplineName: desc?.name ? resolveLabel(desc.name, 'en') : undefined,
      };
    });

    return {
      personId: person.personId,
      displayName: person.displayName,
      alias: person.alias,
      nationality: person.nationality,
      photoObjectId: person.photoObjectId,
      age: person.birthDate ? ageAt(person.birthDate) : undefined,
      competitionHistory,
      careerStatistics,
    };
  }

  @Get('persons/:personId/public/statistics')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: "A person's tournament-total and match-by-match declared statistics" })
  @ApiOkResponse({ type: PlayerStatisticsDrilldownResponse })
  async playerStatistics(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('personId') personId: string,
    @Query('layout') layoutParam?: string,
  ): Promise<PlayerStatisticsDrilldownResponse> {
    const { tournament } = await this.resolvePublishedTournament(
      organizationAlias,
      tournamentAlias,
    );

    const person = await new PersonRepository(this.db).findPerson(personId);
    if (!person || person.organizationId !== tournament.organizationId) {
      throw new NotFoundException(
        `No person "${personId}" found in organization "${organizationAlias}"`,
        { errorCode: 'public-projection-not-found' },
      );
    }

    let layoutCode = layoutParam;
    if (layoutCode === undefined) {
      const layouts = await listEffectiveTableLayouts(this.db, {
        tournamentId: tournament.tournamentId,
        disciplineRef: tournament.disciplineRef,
      });
      const defaultLayout = layouts.find(
        (one) => one.entityGranularity === 'person' || one.entityGranularity === 'player',
      );
      if (!defaultLayout) {
        throw new NotFoundException(
          `No person-granularity table layout for tournament "${tournamentAlias}"`,
          { errorCode: 'public-projection-not-found' },
        );
      }
      layoutCode = defaultLayout.code;
    }

    const result = await readPlayerStatisticsDrilldown(
      this.db,
      {
        organizationId: tournament.organizationId,
        tournament: {
          tournamentId: tournament.tournamentId,
          disciplineRef: tournament.disciplineRef,
        },
      },
      personId,
      layoutCode,
    );
    return playerStatisticsResponse(result);
  }
}

function playerStatisticsResponse(
  result: PlayerStatisticsDrilldownResult,
): PlayerStatisticsDrilldownResponse {
  const columns = result.layout.columns
    .filter((column) => column.source.kind !== 'rank')
    .map((column) => ({
      code: column.code,
      header: column.header,
      ...(column.shortHeader === undefined ? {} : { shortHeader: column.shortHeader }),
      ...(column.zeroDisplay === undefined ? {} : { zeroDisplay: column.zeroDisplay }),
      format: column.format,
    }));

  return {
    layoutCode: result.layout.code,
    label: result.layout.label,
    columns,
    ...(result.tournamentTotal === undefined ? {} : { tournamentTotal: result.tournamentTotal }),
    matches: result.matches.map((row) => ({
      stageNumber: row.match.stageNumber,
      matchNumber: row.match.matchNumber,
      cells: row.cells,
    })),
  };
}

function publicScores(
  sides: readonly { readonly statistics?: Record<string, number> }[],
  descriptor?: DisciplineDescriptor,
): readonly (number | undefined)[] {
  return sides.map((side) => primaryScoreOf(side.statistics, descriptor));
}

export { seriesResponseOf } from './stage-series.js';

function publicMatchStatus(status: string): PublicMatchReportResponse['status'] {
  if (status === 'finalized') return 'final';
  if (status === 'in-progress') return 'live';
  return 'upcoming';
}

function scheduleStartsAt(startsAt: string): string {
  return new Date(Number(startsAt)).toISOString();
}
