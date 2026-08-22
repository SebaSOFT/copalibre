import { Controller, Get, Param, Query, Inject } from '@nestjs/common';
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
  PublicOverviewReadModel,
} from '@copalibre/persistence';
import {
  PublicOverviewResponse,
  PublicLiveResponse,
  PublicBracketResponse,
  PublicOverviewMatchResponse,
  PublicMatchReportResponse,
  PublicPersonProfileResponse,
  PublicOrganizationTournamentListResponse,
  PublicTournamentListingItemResponse,
  PublicTournamentWinnerZoneResponse,
} from '../dto/public-tournament.dto.js';
import { TableLayoutListResponse, TableProjectionResponse } from '../dto/table-projections.dto.js';
import { Kysely } from 'kysely';
import { DATABASE } from '../database.token.js';
import { readStandings } from '../standings/read.js';
import { listEffectiveTableLayouts, readTableProjection } from '../table-projections/read.js';

import { toBracketMatch, ambiguousRoundPositions } from './seeding.controller.js';
import { tableResponse } from './table-projections.controller.js';
import { generateFixtures } from '@copalibre/tournament-engine';
import {
  resolveLabel,
  ageAt,
  type DisciplineDescriptor,
  type StatisticCollector,
  type Tournament,
  type MatchResult,
} from '@copalibre/domain';

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
      let status: 'upcoming' | 'live' | 'finished';
      if (t.status === 'finished' || t.status === 'archived') {
        status = 'finished';
      } else if (t.status === 'started') {
        status = 'live';
      } else {
        const matches = await overviewReadModel.matchesForTournament(t.tournamentId);
        const isLive = matches.some((m) => m.status === 'in-progress' || m.status === 'finalized');
        status = isLive ? 'live' : 'upcoming';
      }

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
        winners = await this.resolveTournamentWinners(t);
      }

      tournamentItems.push({
        tournamentId: t.tournamentId,
        alias: t.alias,
        name: t.name,
        status,
        discipline,
        ...(dates ? { dates } : {}),
        ...(winners && winners.length > 0 ? { winners } : {}),
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

  private async resolveTournamentWinners(
    tournament: Tournament,
  ): Promise<PublicTournamentWinnerZoneResponse[]> {
    const competitionRepo = new CompetitionRepository(this.db);
    const enrollmentRepo = new EnrollmentRepository(this.db);
    const stages = await competitionRepo.listStagesOfTournament(tournament.tournamentId);
    if (stages.length === 0) return [];

    const sortedStages = [...stages].sort((a, b) => a.number - b.number);
    const terminalStage = sortedStages[sortedStages.length - 1];
    if (!terminalStage) return [];

    const zoneRows = await this.db
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
      const isDuel =
        terminalStage.format === 'single-elimination' ||
        terminalStage.format === 'double-elimination';

      if (isDuel) {
        let matchQuery = this.db
          .selectFrom('matches')
          .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
          .selectAll('matches')
          .where('fixtures.stage_id', '=', terminalStage.stageId)
          .where('matches.status', '=', 'finalized');

        if (zone.zoneId) {
          matchQuery = matchQuery.where('fixtures.zone_id', '=', zone.zoneId);
        }

        const matches = await matchQuery
          .orderBy('fixtures.round', 'desc')
          .orderBy('matches.number', 'desc')
          .execute();

        if (matches.length > 0 && matches[0]) {
          const finalMatch = matches[0];
          const result = (
            typeof finalMatch.result === 'string'
              ? JSON.parse(finalMatch.result)
              : finalMatch.result
          ) as MatchResult | null;

          if (result?.winnerEntrantId) {
            const championId = result.winnerEntrantId;
            const runnerUpId = result.sides.find((s) => s.entrantId !== championId)?.entrantId;
            const entrantIds = runnerUpId ? [championId, runnerUpId] : [championId];
            const podiumDetails = await enrollmentRepo.resolveEntrantPodiumDetails(entrantIds);
            const championDetails = podiumDetails.get(championId);

            if (championDetails) {
              const runnerUpDetails = runnerUpId ? podiumDetails.get(runnerUpId) : undefined;
              results.push({
                ...(zone.zoneId ? { zoneId: zone.zoneId } : {}),
                ...(zone.zoneName ? { zoneName: zone.zoneName } : {}),
                champion: {
                  entrantId: championId,
                  name: championDetails.name,
                  abbreviation: championDetails.abbreviation,
                  clubId: championDetails.clubId,
                  emblemObjectId: championDetails.emblemObjectId,
                },
                ...(runnerUpDetails && runnerUpId
                  ? {
                      runnerUp: {
                        entrantId: runnerUpId,
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
      } else {
        try {
          const standings = await readStandings(this.db, tournament, terminalStage.number);
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
        } catch {
          // Fallback if standings cannot be computed
        }
      }
    }

    return results;
  }
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
    if (rulesetData) {
      for (const [k, v] of Object.entries(rulesetData.overrides)) {
        ruleset[k] = String(v);
      }
    }

    const stages = await new CompetitionRepository(this.db).listStages(season.seasonId);
    let standingsPreview: PublicOverviewResponse['standingsPreview'] = undefined;
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

    return {
      organizationAlias,
      organizationName,
      tournamentAlias,
      tournamentName: tournament.name,
      seasonName: season.name,
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
      clubs: clubRows.map((c) => ({
        clubId: c.clubId,
        name: c.name,
        ...(c.alias ? { alias: c.alias } : {}),
        ...(c.emblemObjectId ? { emblemObjectId: c.emblemObjectId } : {}),
      })),
      ruleset,
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
      .where('fixtures.stage_id', '=', stage.stageId)
      .where('matches.number', '=', matchNumber)
      .executeTakeFirst();
    if (!match)
      throw new NotFoundException(`No match ${matchNumberValue} in stage ${stageNumberValue}`, {
        errorCode: 'public-projection-not-found',
      });

    const [schedule, officials, rosterRows, segments, events, descriptor] = await Promise.all([
      this.db
        .selectFrom('fixture_schedules')
        .leftJoin('venues', 'venues.venue_id', 'fixture_schedules.venue_id')
        .select([
          'fixture_schedules.starts_at',
          'fixture_schedules.published',
          'venues.name as venue_name',
        ])
        .where('fixture_schedules.fixture_id', '=', match.fixture_id)
        .executeTakeFirst(),
      this.db
        .selectFrom('fixture_schedules')
        .innerJoin(
          'fixture_schedule_officials',
          'fixture_schedule_officials.fixture_schedule_id',
          'fixture_schedules.fixture_schedule_id',
        )
        .innerJoin('officials', 'officials.official_id', 'fixture_schedule_officials.official_id')
        .select(['officials.display_name', 'officials.roles'])
        .where('fixture_schedules.fixture_id', '=', match.fixture_id)
        .where('fixture_schedules.published', '=', true)
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
    const scores = result?.sides === undefined ? undefined : publicScores(result.sides);

    return {
      organizationAlias,
      organizationName,
      tournamentAlias,
      tournamentName: tournament.name,
      ...(descriptor.images === undefined
        ? {}
        : { disciplineImages: descriptor.images.map((reference) => ({ ...reference })) }),
      stageNumber,
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
    const liveMatches = matches.filter((m) => m.status === 'in_progress');

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
        state: 'in_progress',
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

    const stageMatchesMapped = await new StageReadModel(this.db).matches(stage.stageId);

    const generated = generateFixtures({
      format: stage.format as Parameters<typeof generateFixtures>[0]['format'],
      entrants: [],
    });
    if (!generated.ok) {
      return { matches: [] };
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
    const names = await new EnrollmentRepository(this.db).resolveEntrantNames(
      Array.from(entrantIds),
    );

    return {
      matches: bracketMatches.map((m) => ({
        matchId: m.matchId,
        bracket: m.bracket,
        round: m.round,
        position: m.position,
        status: m.status,
        format: m.format,
        slots: m.slots.map((s) => ({
          kind: s.kind,
          entrantId: s.entrantId,
          name: s.entrantId ? (names.get(s.entrantId)?.name ?? 'Unknown') : undefined,
          abbreviation: s.entrantId ? names.get(s.entrantId)?.abbreviation : undefined,
          matchId: s.matchId,
          score: s.score,
          resultReason: s.resultReason,
        })),
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

    const result = await readTableProjection(
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
    return tableResponse(result);
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
}

function publicScores(
  sides: readonly { readonly statistics?: Record<string, number> }[],
): readonly (number | undefined)[] {
  return sides.map((side) => Object.values(side.statistics ?? {})[0]);
}

function publicMatchStatus(status: string): PublicMatchReportResponse['status'] {
  if (status === 'finalized') return 'final';
  if (status === 'in-progress') return 'live';
  return 'upcoming';
}

function scheduleStartsAt(startsAt: string): string {
  return new Date(Number(startsAt)).toISOString();
}
