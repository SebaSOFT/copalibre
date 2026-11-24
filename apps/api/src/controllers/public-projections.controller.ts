import { Controller, Get, Header, Param, Query, Inject, Logger, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { QualificationError } from '@copalibre/tournament-engine';
import { NotFoundException } from '../http/error-contract.js';
import { ApiTags, ApiOperation, ApiOkResponse, ApiProduces, ApiQuery } from '@nestjs/swagger';
import { escapeCsvFormulaCell, stringifyCsv } from '@copalibre/domain/import-export';
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
  PublicOrganizationLiveMatchResponse,
  PublicTournamentListingItemResponse,
  PublicTournamentWinnerZoneResponse,
} from '../dto/public-tournament.dto.js';
import { TableLayoutListResponse, TableProjectionResponse } from '../dto/table-projections.dto.js';
import { Kysely } from 'kysely';
import { DATABASE } from '../database.token.js';
import { readStandings, readStandingsByZone } from '../standings/read.js';
import { readMatchesView } from '../matches-view/read.js';
import { readPublicScheduleChanges, readPublicVenues } from '../matches-view/schedule.js';
import {
  latestFinalizedShirtNumbers,
  listEffectiveTableLayouts,
  readPlayerStatisticsDrilldown,
  readSegmentedTableProjection,
  readTableProjection,
  stageOrdinalsOf,
  type PlayerStatisticsDrilldownResult,
  type SegmentedTableProjectionResult,
  type TableProjectionResult,
  type TableProjectionRow,
} from '../table-projections/read.js';

import { toBracketMatch, ambiguousRoundPositions } from './seeding.controller.js';
import {
  orderZonesByPromotionBands,
  overallPlaceOffsetsForZones,
  resolveStageZones,
} from './bracket-zones.js';
import { stageQualifierPlans } from './stage-qualifiers.js';
import { bracketLinks, graphRecordsOf, placementMatchOf } from './bracket-placements.js';
import { persistedBracketMatches } from './persisted-bracket.js';
import {
  qualifierLabelsForRecords,
  readFixtureSources,
  readTournamentFixtureSources,
} from './fixture-sources.js';
import { readStageSeriesByPosition, seriesResponseOf } from './stage-series.js';
import {
  persistedChampionshipFixture,
  reconstructChampionshipFixture,
} from './tournament-winner-resolution.js';
import { segmentedTableResponse, tableResponse } from './table-projections.controller.js';
import { evaluateStoredPromotion, promotionPlanFromStored } from './promotion-plans.js';
import { eventLabelFields, rosterRolesOf } from './public-match-labels.js';
import { segmentSummariesOf } from './public-segments.js';
import { publicClockOf } from './segment-clock.js';
import { publicRuleset } from './public-ruleset.js';
import {
  entrantVisibilityById,
  personVisibility,
  personVisibilityById,
} from '../public-person-visibility.js';
import { generateFixtures } from '@copalibre/tournament-engine';
import {
  resolveLabel,
  resolveEffectiveTableLayouts,
  ageAt,
  primaryScoreOf,
  effectiveFormat,
  isImplicitGroup,
  isImplicitZone,
  readableAt,
  type DisciplineDescriptor,
  type StatisticCollector,
  type TableLayoutDefinition,
  type Tournament,
  type TournamentFormat,
  deriveTournamentStatus,
  runningTimers,
} from '@copalibre/domain';
import {
  withPublicPromotionBands,
  type PublicPromotionBand,
} from '../table-projections/public-promotion-bands.js';

function publicTableCsv(projection: TableProjectionResponse): string {
  const columnCodes = projection.columns.map((column) => column.code);
  const hasPromotionBands = (projection.promotionBands?.length ?? 0) > 0;
  const outputColumns = hasPromotionBands
    ? [...columnCodes, 'promotion_band', 'promotion_seed']
    : columnCodes;
  const rows = projection.rows.map((row) => ({
    ...Object.fromEntries(
      columnCodes.map((code) => [code, escapeCsvFormulaCell(row.cells[code]?.formatted ?? '')]),
    ),
    ...(hasPromotionBands
      ? {
          promotion_band: escapeCsvFormulaCell(row.promotionBandLabel ?? ''),
          promotion_seed: row.promotionSeed === undefined ? '' : String(row.promotionSeed),
        }
      : {}),
  }));
  return stringifyCsv(outputColumns, rows);
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
    const inProgressTournaments: InProgressTournamentEntry[] = [];

    for (const [index, t] of publishedTournaments.entries()) {
      const matches = await overviewReadModel.matchesForTournament(t.tournamentId);
      const status = deriveTournamentStatus(t.status, matches);

      const desc = descriptorMap.get(t.disciplineRef.descriptorId);
      const discipline = {
        descriptorId: t.disciplineRef.descriptorId,
        version: t.disciplineRef.version,
        name: desc?.name ? resolveLabel(desc.name, 'en') : undefined,
        ...(desc?.name !== undefined && typeof desc.name !== 'string'
          ? { localizedName: desc.name }
          : {}),
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
      const liveMatches =
        status === 'live' ? await liveMatchesForTournamentListing(this.db, t, matches) : [];
      const { progress, schedule } = listingProgressAndSchedule(matches);
      const venues = await readPublicVenues(
        this.db,
        matches.map((m) => m.matchId),
      );

      if (status === 'live') {
        inProgressTournaments.push({
          tournamentId: t.tournamentId,
          alias: t.alias,
          startedAt: t.startedAt,
          firstKickoffAt: schedule?.firstKickoffAt,
          createdOrderAsc: publishedTournaments.length - 1 - index,
        });
      }

      tournamentItems.push({
        tournamentId: t.tournamentId,
        alias: t.alias,
        name: t.name,
        status,
        discipline,
        ...(dates ? { dates } : {}),
        ...(progress ? { progress } : {}),
        ...(schedule ? { schedule } : {}),
        ...(venues.length > 0 ? { venueCount: venues.length } : {}),
        ...(winners && winners.length > 0 ? { winners } : {}),
        ...(t.emblemObjectId ? { emblemObjectId: t.emblemObjectId } : {}),
        featured: t.featured,
        liveMatches,
      });
    }

    const clubTournamentAlias =
      clubs.length > 0 && inProgressTournaments.length > 0
        ? await firstInProgressTournamentAliasByClub(this.db, inProgressTournaments)
        : new Map<string, string>();

    return {
      organizationAlias: organization.alias,
      organizationName: organization.name,
      ...(organization.emblem_object_id
        ? { organizationEmblemObjectId: organization.emblem_object_id }
        : {}),
      tournaments: tournamentItems,
      clubs: clubs.map((club) => {
        const tournamentAlias = clubTournamentAlias.get(club.clubId);
        return {
          clubId: club.clubId,
          name: club.name,
          ...(club.alias ? { alias: club.alias } : {}),
          ...(club.emblemObjectId ? { emblemObjectId: club.emblemObjectId } : {}),
          ...(tournamentAlias ? { tournamentAlias } : {}),
        };
      }),
    };
  }
}

interface InProgressTournamentEntry {
  readonly tournamentId: string;
  readonly alias: string;
  readonly startedAt?: string;
  readonly firstKickoffAt?: string;
  readonly createdOrderAsc: number;
}

function startTimestampOf(
  startedAt: string | undefined,
  firstKickoffAt: string | undefined,
): number {
  const raw = startedAt ?? firstKickoffAt;
  if (raw === undefined) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

async function firstInProgressTournamentAliasByClub(
  db: Kysely<Database>,
  entries: readonly InProgressTournamentEntry[],
): Promise<ReadonlyMap<string, string>> {
  const sorted = [...entries].sort((a, b) => {
    const aTime = startTimestampOf(a.startedAt, a.firstKickoffAt);
    const bTime = startTimestampOf(b.startedAt, b.firstKickoffAt);
    if (aTime !== bTime) return aTime - bTime;
    if (a.createdOrderAsc !== b.createdOrderAsc) return a.createdOrderAsc - b.createdOrderAsc;
    return a.alias.localeCompare(b.alias);
  });

  const tournamentIds = sorted.map((entry) => entry.tournamentId);
  const [teamEntrants, personEntrants] = await Promise.all([
    db
      .selectFrom('entrants')
      .innerJoin('teams', 'teams.team_id', 'entrants.team_id')
      .select(['entrants.tournament_id as tournament_id', 'teams.club_id as club_id'])
      .where('entrants.tournament_id', 'in', tournamentIds)
      .where('teams.club_id', 'is not', null)
      .execute(),
    db
      .selectFrom('entrants')
      .innerJoin('players', 'players.person_id', 'entrants.person_id')
      .innerJoin('teams', 'teams.team_id', 'players.team_id')
      .select(['entrants.tournament_id as tournament_id', 'teams.club_id as club_id'])
      .where('entrants.tournament_id', 'in', tournamentIds)
      .where('teams.club_id', 'is not', null)
      .execute(),
  ]);

  const clubsByTournament = new Map<string, Set<string>>();
  for (const row of [...teamEntrants, ...personEntrants]) {
    if (row.club_id === null) continue;
    let clubSet = clubsByTournament.get(row.tournament_id);
    if (!clubSet) {
      clubSet = new Set<string>();
      clubsByTournament.set(row.tournament_id, clubSet);
    }
    clubSet.add(row.club_id);
  }

  const firstAliasByClub = new Map<string, string>();
  for (const entry of sorted) {
    const clubIds = clubsByTournament.get(entry.tournamentId);
    if (!clubIds) continue;
    for (const clubId of clubIds) {
      if (!firstAliasByClub.has(clubId)) {
        firstAliasByClub.set(clubId, entry.alias);
      }
    }
  }
  return firstAliasByClub;
}

const resolveTournamentWinnersLogger = new Logger('resolveTournamentWinners');

async function liveMatchesForTournamentListing(
  db: Kysely<Database>,
  tournament: Tournament,
  matches: Awaited<ReturnType<PublicOverviewReadModel['matchesForTournament']>>,
): Promise<PublicOrganizationLiveMatchResponse[]> {
  const inProgress = matches.filter((m) => m.status === 'in-progress');
  if (inProgress.length === 0) return [];

  const entrantIds = [
    ...new Set(
      inProgress.flatMap((m) =>
        [m.homeEntrantId, m.awayEntrantId].filter((id): id is string => id !== undefined),
      ),
    ),
  ];
  const [entrantDetails, entrantVisibility, ordinalByMatchId] = await Promise.all([
    new EnrollmentRepository(db).resolveEntrantPodiumDetails(entrantIds),
    entrantVisibilityById(db, tournament, entrantIds),
    stageOrdinalsOf(db, tournament.tournamentId),
  ]);

  const sideName = (entrantId: string | undefined, hidden: boolean | undefined): string => {
    if (!entrantId || hidden) return '';
    return entrantDetails.get(entrantId)?.name ?? 'Unknown';
  };

  return inProgress.map((m) => {
    const homeHidden = m.homeEntrantId
      ? entrantVisibility.get(m.homeEntrantId)?.hiddenAtRequest
      : undefined;
    const awayHidden = m.awayEntrantId
      ? entrantVisibility.get(m.awayEntrantId)?.hiddenAtRequest
      : undefined;
    return {
      matchId: m.matchId,
      stageNumber: m.stageNumber,
      ...(m.stageName === undefined ? {} : { stageName: m.stageName }),
      matchNumber: ordinalByMatchId.get(m.matchId) ?? m.matchNumber ?? m.round,
      home: sideName(m.homeEntrantId, homeHidden),
      away: sideName(m.awayEntrantId, awayHidden),
      ...(homeHidden ? { homeHiddenAtRequest: true } : {}),
      ...(awayHidden ? { awayHiddenAtRequest: true } : {}),
      homeScore: m.scores?.[0] ?? 0,
      awayScore: m.scores?.[1] ?? 0,
    };
  });
}

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

  const zonesToProcess: { zoneId?: string; zoneName?: string; format?: string }[] =
    zoneRows.length > 0
      ? zoneRows.map((z) => ({
          zoneId: z.zone_id,
          zoneName: z.name,
          ...(z.format === null ? {} : { format: z.format }),
        }))
      : [{ zoneId: undefined, zoneName: undefined }];

  const results: PublicTournamentWinnerZoneResponse[] = [];

  for (const zone of zonesToProcess) {
    // Each zone is resolved independently: one zone's error or ambiguous
    // terminal round must never prevent the other zones from resolving
    // (previously an uncaught error in this loop's duel
    // branch aborted every zone's result, not just the failing one).
    try {
      // A zone playing its own format is judged by that format, not by its stage's.
      const zoneFormat = zone.format ?? terminalStage.format;
      const isDuel = zoneFormat === 'single-elimination' || zoneFormat === 'double-elimination';

      if (isDuel) {
        const readModel = new StageReadModel(db);
        const record = await readModel.stageRecord(terminalStage.stageId, undefined, zone.zoneId);
        const fixtures = await readModel.matches(terminalStage.stageId, undefined, zone.zoneId);
        const persisted =
          fixtures.length > 0 && fixtures.every((fixture) => fixture.node !== undefined);
        const generated = persisted
          ? undefined
          : generateFixtures({
              format: zoneFormat as Parameters<typeof generateFixtures>[0]['format'],
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
        const resolved = persisted
          ? persistedChampionshipFixture(zoneFormat, fixtures, winnersByFixtureId)
          : generated?.ok
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
        const standings = await readStandings(
          db,
          tournament,
          terminalStage.number,
          undefined,
          zone.zoneId,
        );
        if (standings.rows.length > 0) {
          const rankOneRows = standings.rows.filter((row) => row.rank === 1);
          const rankTwoRows = standings.rows.filter((row) => row.rank === 2);
          const rank2 = rankTwoRows.length === 1 ? rankTwoRows[0] : undefined;
          const rankThreeRows = standings.fullyResolved
            ? standings.rows.filter((row) => row.rank === 3)
            : [];
          const rank3 = rankThreeRows.length === 1 ? rankThreeRows[0] : undefined;
          if (rankOneRows.length > 0) {
            const entrantIds = [
              ...rankOneRows.map((row) => row.entrantId),
              rank2?.entrantId,
              rank3?.entrantId,
            ].filter((entrantId): entrantId is string => entrantId !== undefined);
            const podiumDetails = await enrollmentRepo.resolveEntrantPodiumDetails(entrantIds);
            const champions = rankOneRows.flatMap((row) => {
              const details = podiumDetails.get(row.entrantId);
              return details
                ? [
                    {
                      entrantId: row.entrantId,
                      name: details.name,
                      abbreviation: details.abbreviation,
                      clubId: details.clubId,
                      emblemObjectId: details.emblemObjectId,
                    },
                  ]
                : [];
            });

            const primaryChampion = champions[0];
            if (primaryChampion && champions.length === rankOneRows.length) {
              const runnerUpDetails = rank2 ? podiumDetails.get(rank2.entrantId) : undefined;
              const thirdPlaceDetails = rank3 ? podiumDetails.get(rank3.entrantId) : undefined;
              results.push({
                ...(zone.zoneId ? { zoneId: zone.zoneId } : {}),
                ...(zone.zoneName ? { zoneName: zone.zoneName } : {}),
                champion: primaryChampion,
                champions,
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
                ...(thirdPlaceDetails && rank3
                  ? {
                      thirdPlace: {
                        entrantId: rank3.entrantId,
                        name: thirdPlaceDetails.name,
                        abbreviation: thirdPlaceDetails.abbreviation,
                        clubId: thirdPlaceDetails.clubId,
                        emblemObjectId: thirdPlaceDetails.emblemObjectId,
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

  const podiumEntrantIds = results.flatMap((zone) => [
    zone.champion.entrantId,
    ...(zone.champions ?? []).map((entrant) => entrant.entrantId),
    ...(zone.runnerUp === undefined ? [] : [zone.runnerUp.entrantId]),
    ...(zone.thirdPlace === undefined ? [] : [zone.thirdPlace.entrantId]),
  ]);
  const visibilityByEntrant = await entrantVisibilityById(db, tournament, podiumEntrantIds);
  const protectPodiumEntrant = (
    entrant: PublicTournamentWinnerZoneResponse['champion'],
  ): PublicTournamentWinnerZoneResponse['champion'] => {
    const visibility = visibilityByEntrant.get(entrant.entrantId);
    if (visibility === undefined) return entrant;
    const { name, abbreviation, clubId, emblemObjectId, ...identity } = entrant;
    return {
      ...identity,
      ...(visibility.hiddenAtRequest ? { hiddenAtRequest: true } : { name }),
      publicProfileAvailable: visibility.publicProfileAvailable,
      ...(visibility.publicProfileAvailable ? { abbreviation, clubId, emblemObjectId } : {}),
    };
  };
  return results.map((zone) => ({
    ...zone,
    champion: protectPodiumEntrant(zone.champion),
    champions: zone.champions?.map(protectPodiumEntrant),
    runnerUp: zone.runnerUp && protectPodiumEntrant(zone.runnerUp),
    thirdPlace: zone.thirdPlace && protectPodiumEntrant(zone.thirdPlace),
  }));
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

  /**
   * The stage ordinal of every match of a tournament, keyed by match id: the same 1-based position
   * the public match route and the matches view address a match by, taken from each stage's full,
   * unscoped match list. `matches.number` cannot stand in for it, being a per-fixture series index.
   */
  private async stageOrdinalsOf(tournamentId: string): Promise<ReadonlyMap<string, number>> {
    return stageOrdinalsOf(this.db, tournamentId);
  }

  @Get('overview')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'Overview of a tournament' })
  @ApiOkResponse({ type: PublicOverviewResponse })
  async overview(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
  ): Promise<PublicOverviewResponse> {
    const { tournament, organizationName, organizationTimeZone } =
      await this.resolvePublishedTournament(organizationAlias, tournamentAlias);
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
    const ordinalByMatchId = await this.stageOrdinalsOf(tournament.tournamentId);
    const fixtureSources = await readTournamentFixtureSources(this.db, tournament.tournamentId);
    const scheduleChanges = await readPublicScheduleChanges(
      this.db,
      matches.map((match) => match.matchId),
    );
    const venues = await readPublicVenues(
      this.db,
      matches.map((match) => match.matchId),
    );

    const entrantIds = new Set<string>();
    for (const match of matches) {
      if (match.homeEntrantId) entrantIds.add(match.homeEntrantId);
      if (match.awayEntrantId) entrantIds.add(match.awayEntrantId);
    }
    const entrantDetails = await new EnrollmentRepository(this.db).resolveEntrantPodiumDetails(
      Array.from(entrantIds),
    );
    const entrantVisibility = await entrantVisibilityById(this.db, tournament, [...entrantIds]);

    const rulesetData = await new TournamentRepository(this.db).findLatestRuleset(
      tournament.tournamentId,
    );
    const descriptor = await new TournamentRepository(this.db).findDescriptor(
      tournament.disciplineRef.descriptorId,
      tournament.disciplineRef.version,
    );
    const { ruleset, labels: rulesetLabels } = publicRuleset(
      descriptor ?? undefined,
      rulesetData ?? undefined,
    );

    const competition = new CompetitionRepository(this.db);
    const stages = [...(await competition.listStages(season.seasonId))].sort(
      (a, b) => a.number - b.number,
    );
    const zonesByStage = await Promise.all(
      stages.map(async (stage) => ({
        stage,
        zones: await competition.listZonesOfStage(stage.stageId),
      })),
    );
    const overviewStages = zonesByStage.map(({ stage, zones }) => {
      const stageName = stage.name.trim();
      const declaredZones = zones.filter((zone) => !isImplicitZone(zone));
      return {
        stageNumber: stage.number,
        ...(stageName.length > 0 ? { stageName } : {}),
        format: stage.format,
        ...(declaredZones.length > 0
          ? {
              zones: declaredZones.map((zone) => ({
                zoneName: zone.name,
                format: effectiveFormat(zone, stage),
              })),
            }
          : {}),
      };
    });

    const selectedEntry = selectOverviewStandingsStage(zonesByStage, matches);
    let standingsPreview: PublicOverviewResponse['standingsPreview'] = undefined;
    let standingsGrain: PublicOverviewResponse['standingsGrain'] = undefined;
    let standingsStageNumber: PublicOverviewResponse['standingsStageNumber'] = undefined;
    let standingsSource: PublicOverviewResponse['standingsSource'] = undefined;

    if (selectedEntry) {
      const selectedStage = selectedEntry.stage;
      standingsStageNumber = selectedStage.number;
      const effectiveLayouts = descriptor
        ? resolveEffectiveTableLayouts(descriptor, rulesetData?.overrides)
        : [];
      const groupPhaseLayout = effectiveLayouts.find(
        (layout) =>
          layout.target === 'group-phase' &&
          (layout.entityGranularity === 'team' || layout.entityGranularity === 'club'),
      );

      if (groupPhaseLayout) {
        const projection = await readSegmentedTableProjection(
          this.db,
          {
            organizationId: tournament.organizationId,
            tournament: {
              tournamentId: tournament.tournamentId,
              disciplineRef: tournament.disciplineRef,
            },
            stageId: selectedStage.stageId,
          },
          groupPhaseLayout.code,
        );
        const segments =
          projection.segments.length > 0 ? projection.segments : [{ rows: projection.rows }];
        standingsPreview = await formatOverviewStandingsRows(
          this.db,
          tournament,
          segments.flatMap((segment) =>
            segment.rows.map((row) => ({
              rank: row.rank,
              entrantId: row.entrantId ?? row.actorId,
              sharedRank: row.sharedRank,
              statistics: tableRowStatistics(row, projection.layout),
              ...(segment.zoneName === undefined ? {} : { zoneName: segment.zoneName }),
              ...(segment.groupName === undefined ? {} : { groupName: segment.groupName }),
              fallbackName: row.entrantName ?? row.actorName,
              fallbackAbbreviation: row.entrantAbbreviation,
              fallbackClubId: row.clubId,
              fallbackEmblemObjectId: row.emblemObjectId,
            })),
          ),
        );
        standingsGrain = projection.grain;
        standingsSource = 'table-projection';
      } else {
        // A stage mixing formats ranks each of its table zones on its own; its rows say which zone
        // they belong to so a client does not present them as one table.
        const byZone = await readStandingsByZone(this.db, tournament, selectedStage.number);
        const standings = byZone
          ? {
              rows: byZone.zones.flatMap((zone) =>
                zone.result.rows.map((row) => ({ ...row, zoneName: zone.zoneName })),
              ),
              grain: byZone.zones.find((zone) => 'grain' in zone.result)?.result.grain,
            }
          : await readStandings(this.db, tournament, selectedStage.number);

        standingsPreview = await formatOverviewStandingsRows(
          this.db,
          tournament,
          standings.rows.map((r) => ({
            rank: r.rank,
            entrantId: r.entrantId,
            sharedRank: r.sharedRank,
            statistics: r.statistics,
            ...('zoneName' in r && typeof r.zoneName === 'string' ? { zoneName: r.zoneName } : {}),
            ...('groupName' in r && typeof r.groupName === 'string'
              ? { groupName: r.groupName }
              : {}),
          })),
        );
        standingsGrain = standings.grain;
        standingsSource = 'engine';
      }
    }

    const clubRows = await this.db
      .selectFrom('entrants')
      .innerJoin('teams', 'teams.team_id', 'entrants.team_id')
      .innerJoin('clubs', 'clubs.club_id', 'teams.club_id')
      .select([
        'clubs.club_id as clubId',
        'clubs.name',
        'clubs.abbreviation',
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
      organizationTimeZone,
      tournamentAlias,
      tournamentName: tournament.name,
      seasonName: season.name,
      status,
      ...(winners && winners.length > 0 ? { winners } : {}),
      ...(tournament.emblemObjectId ? { emblemObjectId: tournament.emblemObjectId } : {}),
      ...(descriptor?.images === undefined
        ? {}
        : { disciplineImages: descriptor.images.map((reference) => ({ ...reference })) }),
      ...(descriptor?.name ? { disciplineName: resolveLabel(descriptor.name, 'en') } : {}),
      ...(descriptor?.name !== undefined && typeof descriptor.name !== 'string'
        ? { localizedDisciplineName: descriptor.name }
        : {}),
      ...(venues.length > 0 ? { venues: venues.map((venue) => ({ ...venue })) } : {}),
      matches: matches.map((m) => {
        const homeVisibility = m.homeEntrantId ? entrantVisibility.get(m.homeEntrantId) : undefined;
        const awayVisibility = m.awayEntrantId ? entrantVisibility.get(m.awayEntrantId) : undefined;
        return {
          matchId: m.matchId,
          ...fixtureSources.get(m.matchId),
          ...scheduleChanges.get(m.matchId),
          matchNumber: m.matchNumber,
          ...(ordinalByMatchId.has(m.matchId)
            ? { stageOrdinal: ordinalByMatchId.get(m.matchId) }
            : {}),
          stageNumber: m.stageNumber,
          ...(m.stageName === undefined ? {} : { stageName: m.stageName }),
          round: m.round,
          ...(m.zoneName === undefined ? {} : { zoneName: m.zoneName }),
          ...(m.groupName === undefined ? {} : { groupName: m.groupName }),
          status: m.status as PublicOverviewMatchResponse['status'],
          homeEntrantId: m.homeEntrantId ?? undefined,
          ...(m.homeEntrantId && !homeVisibility?.hiddenAtRequest
            ? { homeName: entrantDetails.get(m.homeEntrantId)?.name ?? 'Unknown' }
            : {}),
          ...(homeVisibility?.hiddenAtRequest ? { homeHiddenAtRequest: true } : {}),
          ...(homeVisibility === undefined
            ? {}
            : { homePublicProfileAvailable: homeVisibility.publicProfileAvailable }),
          ...(m.homeEntrantId && homeVisibility?.publicProfileAvailable !== false
            ? { homeAbbreviation: entrantDetails.get(m.homeEntrantId)?.abbreviation }
            : {}),
          ...(m.homeEntrantId && homeVisibility?.publicProfileAvailable !== false
            ? { homeClubId: entrantDetails.get(m.homeEntrantId)?.clubId }
            : {}),
          ...(m.homeEntrantId && homeVisibility?.publicProfileAvailable !== false
            ? { homeEmblemObjectId: entrantDetails.get(m.homeEntrantId)?.emblemObjectId }
            : {}),
          awayEntrantId: m.awayEntrantId ?? undefined,
          ...(m.awayEntrantId && !awayVisibility?.hiddenAtRequest
            ? { awayName: entrantDetails.get(m.awayEntrantId)?.name ?? 'Unknown' }
            : {}),
          ...(awayVisibility?.hiddenAtRequest ? { awayHiddenAtRequest: true } : {}),
          ...(awayVisibility === undefined
            ? {}
            : { awayPublicProfileAvailable: awayVisibility.publicProfileAvailable }),
          ...(m.awayEntrantId && awayVisibility?.publicProfileAvailable !== false
            ? { awayAbbreviation: entrantDetails.get(m.awayEntrantId)?.abbreviation }
            : {}),
          ...(m.awayEntrantId && awayVisibility?.publicProfileAvailable !== false
            ? { awayClubId: entrantDetails.get(m.awayEntrantId)?.clubId }
            : {}),
          ...(m.awayEntrantId && awayVisibility?.publicProfileAvailable !== false
            ? { awayEmblemObjectId: entrantDetails.get(m.awayEntrantId)?.emblemObjectId }
            : {}),
          homeScore: m.scores?.[0],
          awayScore: m.scores?.[1],
          scheduledAt: scheduleChanges.get(m.matchId)?.scheduledAt,
        };
      }),
      stages: overviewStages,
      ...(standingsStageNumber === undefined ? {} : { standingsStageNumber }),
      ...(standingsSource === undefined ? {} : { standingsSource }),
      standingsPreview,
      standingsGrain,
      clubs: clubRows.map((c) => ({
        clubId: c.clubId,
        name: c.name,
        abbreviation: c.abbreviation ?? undefined,
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
    const { tournament, organizationName, organizationTimeZone } =
      await this.resolvePublishedTournament(organizationAlias, tournamentAlias);
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
    // match via the stage's shared ordinal map instead of filtering by that column.
    const stageMatches = await new StageReadModel(this.db).matches(stage.stageId);
    const ordinals = stageMatchOrdinals(stageMatches);
    const targetRecord = stageMatches.find(
      (record) => ordinals.get(record.matchId) === matchNumber,
    );
    if (!targetRecord)
      throw new NotFoundException(`No match ${matchNumberValue} in stage ${stageNumberValue}`, {
        errorCode: 'public-projection-not-found',
      });

    const fixtureSources = await readFixtureSources(this.db, stage.stageId);

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

    // The match is shown in the layout of the format its zone plays, which is the stage's unless the
    // zone declares its own.
    const fixtureScope = await resolveFixtureScopeContext(this.db, targetRecord.fixtureId);
    const zoneFormatOfMatch = fixtureScope.zoneFormat;

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
    const entrantDetails = await new EnrollmentRepository(this.db).resolveEntrantPodiumDetails(
      entrantIds,
    );
    const entrantVisibility = await entrantVisibilityById(this.db, tournament, entrantIds);
    const personIds = [
      ...rosterRows.flatMap((roster) => roster.roster_members.map((member) => member.personId)),
      ...events.flatMap((event) => (event.personId === undefined ? [] : [event.personId])),
    ];
    const visibilityByPersonId = await personVisibilityById(this.db, tournament, personIds);
    const rosterByEntrant = new Map(
      rosterRows.map((roster) => [
        roster.entrant_id,
        roster.roster_members.map((member) => {
          const visibility =
            visibilityByPersonId.get(member.personId) ?? personVisibility(tournament);
          const { personId, name, nationality, ...details } = member;
          return {
            ...details,
            ...(visibility.hiddenAtRequest ? { hiddenAtRequest: true } : { personId, name }),
            publicProfileAvailable: visibility.publicProfileAvailable,
            ...(visibility.nationalityVisible && nationality !== undefined ? { nationality } : {}),
          };
        }),
      ]),
    );
    const segmentNumberById = new Map(
      segments.map((segment) => [segment.segmentId, segment.number]),
    );
    const definitionByCode = new Map(
      descriptor.eventDefinitions.map((definition) => [definition.code, definition]),
    );
    const result = match.result as unknown as {
      readonly winnerEntrantId?: unknown;
      readonly sides?: readonly { readonly statistics?: Record<string, number> }[];
    } | null;
    const rosterRoles = rosterRolesOf(descriptor);
    const scores = result?.sides === undefined ? undefined : publicScores(result.sides, descriptor);
    const clock =
      match.status === 'in-progress' ? publicClockOf(segments, descriptor, Date.now()) : undefined;
    const status = publicMatchStatus(match.status);
    const stageName = stage.name.trim();
    const winnerEntrantId =
      status === 'final' &&
      typeof result?.winnerEntrantId === 'string' &&
      result.winnerEntrantId.length > 0
        ? result.winnerEntrantId
        : undefined;

    return {
      organizationAlias,
      organizationName,
      organizationTimeZone,
      tournamentAlias,
      tournamentName: tournament.name,
      ...(descriptor.images === undefined
        ? {}
        : { disciplineImages: descriptor.images.map((reference) => ({ ...reference })) }),
      stageNumber,
      ...(stageName.length > 0 ? { stageName } : {}),
      ...(fixtureScope.zoneName === undefined ? {} : { zoneName: fixtureScope.zoneName }),
      ...(fixtureScope.groupName === undefined ? {} : { groupName: fixtureScope.groupName }),
      stageFormat: zoneFormatOfMatch ?? stage.format,
      matchNumber,
      round: match.round,
      status,
      ...(winnerEntrantId === undefined ? {} : { winnerEntrantId }),
      ...(match.home_entrant_id === null ? {} : { homeEntrantId: match.home_entrant_id }),
      ...(match.home_entrant_id === null ||
      entrantVisibility.get(match.home_entrant_id)?.hiddenAtRequest === true
        ? {}
        : { homeName: entrantDetails.get(match.home_entrant_id)?.name ?? 'Unknown' }),
      ...(match.home_entrant_id !== null &&
      entrantVisibility.get(match.home_entrant_id)?.hiddenAtRequest === true
        ? { homeHiddenAtRequest: true }
        : {}),
      ...(match.home_entrant_id === null ||
      entrantVisibility.get(match.home_entrant_id) === undefined
        ? {}
        : {
            homePublicProfileAvailable: entrantVisibility.get(match.home_entrant_id)
              ?.publicProfileAvailable,
          }),
      ...(match.home_entrant_id === null ||
      entrantVisibility.get(match.home_entrant_id)?.publicProfileAvailable === false
        ? {}
        : { homeAbbreviation: entrantDetails.get(match.home_entrant_id)?.abbreviation }),
      ...(match.home_entrant_id === null ||
      entrantVisibility.get(match.home_entrant_id)?.publicProfileAvailable === false ||
      !entrantDetails.get(match.home_entrant_id)?.clubAlias
        ? {}
        : { homeClubAlias: entrantDetails.get(match.home_entrant_id)?.clubAlias }),
      ...(match.away_entrant_id === null ? {} : { awayEntrantId: match.away_entrant_id }),
      ...(match.away_entrant_id === null ||
      entrantVisibility.get(match.away_entrant_id)?.hiddenAtRequest === true
        ? {}
        : { awayName: entrantDetails.get(match.away_entrant_id)?.name ?? 'Unknown' }),
      ...(match.away_entrant_id !== null &&
      entrantVisibility.get(match.away_entrant_id)?.hiddenAtRequest === true
        ? { awayHiddenAtRequest: true }
        : {}),
      ...(match.away_entrant_id === null ||
      entrantVisibility.get(match.away_entrant_id) === undefined
        ? {}
        : {
            awayPublicProfileAvailable: entrantVisibility.get(match.away_entrant_id)
              ?.publicProfileAvailable,
          }),
      ...(match.away_entrant_id === null ||
      entrantVisibility.get(match.away_entrant_id)?.publicProfileAvailable === false
        ? {}
        : { awayAbbreviation: entrantDetails.get(match.away_entrant_id)?.abbreviation }),
      ...(match.away_entrant_id === null ||
      entrantVisibility.get(match.away_entrant_id)?.publicProfileAvailable === false ||
      !entrantDetails.get(match.away_entrant_id)?.clubAlias
        ? {}
        : { awayClubAlias: entrantDetails.get(match.away_entrant_id)?.clubAlias }),
      ...(scores?.[0] === undefined ? {} : { homeScore: scores[0] }),
      ...(scores?.[1] === undefined ? {} : { awayScore: scores[1] }),
      ...(schedule === undefined ? {} : { scheduledAt: scheduleStartsAt(schedule.starts_at) }),
      ...(schedule?.venue_name === null || schedule?.venue_name === undefined
        ? {}
        : { venueName: schedule.venue_name }),
      ...(await readPublicScheduleChanges(this.db, [match.match_id])).get(match.match_id),
      ...fixtureSources.get(match.match_id),
      schedulePublished: schedule?.published ?? false,
      officials: officials.map((official) => ({
        name: official.display_name,
        roles: [...official.roles],
      })),
      ...(rosterRoles === undefined ? {} : { rosterRoles }),
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
          ...eventLabelFields(definition, event.definitionCode),
          ...(workflowOutcomeCodes === undefined ? {} : { workflowOutcomeCodes }),
          occurredAt: event.occurredAt,
          sequence: event.sequence,
          ...(event.segmentId === undefined
            ? {}
            : { segmentNumber: segmentNumberById.get(event.segmentId) }),
          ...(event.side === undefined ? {} : { side: event.side }),
          ...(event.personId === undefined ||
          visibilityByPersonId.get(event.personId)?.hiddenAtRequest === true
            ? {}
            : { personId: event.personId }),
          ...(event.personId !== undefined &&
          visibilityByPersonId.get(event.personId)?.hiddenAtRequest === true
            ? { hiddenAtRequest: true }
            : {}),
          payload: event.payload,
        };
      }),
      ...(segments.length === 0
        ? {}
        : {
            segments: segmentSummariesOf(descriptor, segments, events, [
              match.home_entrant_id ?? undefined,
              match.away_entrant_id ?? undefined,
            ]),
          }),
      ...(clock === undefined ? {} : { clock }),
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
    const fixtureSources = await readTournamentFixtureSources(this.db, tournament.tournamentId);
    const ordinalByMatchId = await this.stageOrdinalsOf(tournament.tournamentId);
    const scheduleChanges = await readPublicScheduleChanges(
      this.db,
      matches.map((match) => match.matchId),
    );

    const entrantIds = new Set<string>();
    for (const match of liveMatches) {
      if (match.homeEntrantId) entrantIds.add(match.homeEntrantId);
      if (match.awayEntrantId) entrantIds.add(match.awayEntrantId);
    }
    const entrantDetails = await new EnrollmentRepository(this.db).resolveEntrantPodiumDetails(
      Array.from(entrantIds),
    );
    const entrantVisibility = await entrantVisibilityById(this.db, tournament, [...entrantIds]);
    const descriptor = await new TournamentRepository(this.db).findDescriptor(
      tournament.disciplineRef.descriptorId,
      tournament.disciplineRef.version,
    );
    const timerStarts = Object.fromEntries(
      (descriptor?.eventDefinitions ?? []).flatMap((definition) =>
        (definition.effects ?? [])
          .filter((effect) => effect.kind === 'timed-penalty')
          .map((effect) => [definition.code, effect.durationSeconds]),
      ),
    );
    const competition = new CompetitionRepository(this.db);
    const now = Date.now();
    const detailByMatch = await Promise.all(
      liveMatches.map(async (match) => {
        const [events, resolvedTimerIds, segments] = await Promise.all([
          competition.listEvents(match.matchId),
          competition.resolvedTimerIds(match.matchId),
          competition.listSegments(match.matchId),
        ]);
        const participants = new Set(
          [match.homeEntrantId, match.awayEntrantId].filter((id): id is string => !!id),
        );
        const penalties = runningTimers(
          events,
          { starts: timerStarts, stops: [] },
          now,
          resolvedTimerIds,
        ).flatMap((timer) => {
          if (timer.side === undefined || !participants.has(timer.side)) return [];
          return [
            {
              timerId: timer.timerId,
              entrantId: timer.side,
              remainingSeconds: timer.remainingSeconds,
            },
          ];
        });
        return {
          penalties,
          clock: publicClockOf(segments, descriptor, now),
          segments:
            descriptor === null || descriptor === undefined || segments.length === 0
              ? []
              : segmentSummariesOf(descriptor, segments, events, [
                  match.homeEntrantId,
                  match.awayEntrantId,
                ]),
        };
      }),
    );
    const penaltiesByMatch = detailByMatch.map((detail) => detail.penalties);

    return {
      matches: liveMatches.map((m, index) => ({
        matchId: m.matchId,
        ...fixtureSources.get(m.matchId),
        ...scheduleChanges.get(m.matchId),
        stageNumber: m.stageNumber,
        ...(m.stageName === undefined ? {} : { stageName: m.stageName }),
        ...(m.zoneName === undefined ? {} : { zoneName: m.zoneName }),
        ...(m.groupName === undefined ? {} : { groupName: m.groupName }),
        round: m.round,
        matchNumber: m.matchNumber ?? m.round,
        ...(ordinalByMatchId.has(m.matchId)
          ? { stageOrdinal: ordinalByMatchId.get(m.matchId) }
          : {}),
        state: 'live',
        projectionVersion: 1,
        sides: [
          ...(m.homeEntrantId
            ? [
                {
                  entrantId: m.homeEntrantId,
                  ...(entrantVisibility.get(m.homeEntrantId)?.hiddenAtRequest
                    ? {}
                    : { name: entrantDetails.get(m.homeEntrantId)?.name ?? 'Unknown' }),
                  ...(entrantVisibility.get(m.homeEntrantId)?.hiddenAtRequest
                    ? { hiddenAtRequest: true }
                    : {}),
                  ...(entrantVisibility.get(m.homeEntrantId) === undefined
                    ? {}
                    : {
                        publicProfileAvailable: entrantVisibility.get(m.homeEntrantId)
                          ?.publicProfileAvailable,
                      }),
                  ...(entrantVisibility.get(m.homeEntrantId)?.publicProfileAvailable === false
                    ? {}
                    : {
                        abbreviation: entrantDetails.get(m.homeEntrantId)?.abbreviation,
                        clubId: entrantDetails.get(m.homeEntrantId)?.clubId,
                        emblemObjectId: entrantDetails.get(m.homeEntrantId)?.emblemObjectId,
                      }),
                  score: m.scores?.[0] ?? 0,
                },
              ]
            : []),
          ...(m.awayEntrantId
            ? [
                {
                  entrantId: m.awayEntrantId,
                  ...(entrantVisibility.get(m.awayEntrantId)?.hiddenAtRequest
                    ? {}
                    : { name: entrantDetails.get(m.awayEntrantId)?.name ?? 'Unknown' }),
                  ...(entrantVisibility.get(m.awayEntrantId)?.hiddenAtRequest
                    ? { hiddenAtRequest: true }
                    : {}),
                  ...(entrantVisibility.get(m.awayEntrantId) === undefined
                    ? {}
                    : {
                        publicProfileAvailable: entrantVisibility.get(m.awayEntrantId)
                          ?.publicProfileAvailable,
                      }),
                  ...(entrantVisibility.get(m.awayEntrantId)?.publicProfileAvailable === false
                    ? {}
                    : {
                        abbreviation: entrantDetails.get(m.awayEntrantId)?.abbreviation,
                        clubId: entrantDetails.get(m.awayEntrantId)?.clubId,
                        emblemObjectId: entrantDetails.get(m.awayEntrantId)?.emblemObjectId,
                      }),
                  score: m.scores?.[1] ?? 0,
                },
              ]
            : []),
        ],
        ...(penaltiesByMatch[index]?.length ? { activePenalties: penaltiesByMatch[index] } : {}),
        ...(detailByMatch[index]?.segments.length
          ? { segments: detailByMatch[index]?.segments }
          : {}),
        ...(detailByMatch[index]?.clock === undefined
          ? {}
          : { clock: detailByMatch[index]?.clock }),
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
    const [declaredZones, promotionPlans] = await Promise.all([
      resolveStageZones(this.db, stage.stageId),
      stageQualifierPlans(this.db, stage.stageId),
    ]);
    const zones = orderZonesByPromotionBands(
      declaredZones,
      promotionPlans.map(({ plan }) => plan),
    );
    const overallOffsets = overallPlaceOffsetsForZones(
      zones,
      promotionPlans.map(({ plan }) => plan),
    );

    // Computed once, from every zone combined — a per-zone fetch below cannot
    // reconstruct this on its own, since it has no visibility into how many
    // matches other zones contribute ahead of it.
    const ordinalByMatchId = stageMatchOrdinals(await readModel.matches(stage.stageId));

    const zoneResponses = await Promise.all(
      zones.map(async (zone) => {
        const overallPlaceOffset =
          zone.zoneName === undefined ? undefined : overallOffsets.get(zone.zoneName);
        const zoneRecords = await readModel.matches(stage.stageId, undefined, zone.zoneId);
        if (zoneRecords.length > 0 && zoneRecords.every((record) => record.node !== undefined)) {
          const series = await readStageSeriesByPosition(this.db, {
            tournamentId: tournament.tournamentId,
            stageId: stage.stageId,
            zoneId: zone.zoneId,
            records: zoneRecords,
          });
          const details = await enrollmentRepo.resolveEntrantPodiumDetails(
            zoneRecords.flatMap((record) =>
              [record.homeEntrantId, record.awayEntrantId].filter(
                (id): id is string => id !== undefined,
              ),
            ),
          );
          const visibilityByEntrant = await entrantVisibilityById(
            this.db,
            tournament,
            zoneRecords.flatMap((record) =>
              [record.homeEntrantId, record.awayEntrantId].filter(
                (id): id is string => id !== undefined,
              ),
            ),
          );
          return {
            ...zone,
            format: effectiveFormat(zone, stage),
            ...(overallPlaceOffset === undefined ? {} : { overallPlaceOffset }),
            matches: persistedBracketMatches(
              zoneRecords,
              (record) => {
                const state = series.get(record.fixtureId);
                return state === undefined ? undefined : seriesResponseOf(state);
              },
              undefined,
              await qualifierLabelsForRecords(this.db, zoneRecords),
            ).map(({ persistedMatchId, ...match }) => ({
              ...match,
              matchNumber: ordinalByMatchId.get(persistedMatchId ?? ''),
              slots: match.slots.map((slot) => {
                const identity =
                  slot.entrantId === undefined ? undefined : details.get(slot.entrantId);
                const visibility =
                  slot.entrantId === undefined
                    ? undefined
                    : visibilityByEntrant.get(slot.entrantId);
                return {
                  ...slot,
                  ...(identity === undefined
                    ? {}
                    : {
                        ...(visibility?.hiddenAtRequest
                          ? { name: undefined, hiddenAtRequest: true }
                          : { name: identity.name }),
                        ...(visibility === undefined
                          ? {}
                          : { publicProfileAvailable: visibility.publicProfileAvailable }),
                        ...(visibility?.publicProfileAvailable === false
                          ? {}
                          : {
                              abbreviation: identity.abbreviation,
                              clubId: identity.clubId,
                              emblemObjectId: identity.emblemObjectId,
                            }),
                      }),
                };
              }),
            })),
          };
        }
        // Placement games sit beside the generated graph, not on it.
        const stageMatchesMapped = graphRecordsOf(zoneRecords);
        const record = await readModel.stageRecord(stage.stageId, undefined, zone.zoneId);

        // Seeded from this zone's own entrants, the same way the control panel's bracket is: the
        // graph's shape is a function of format plus seed order, and generating from an empty
        // entrant list produces no graph at all — which is what this endpoint used to return for
        // every stage, an empty bracket the public web then rendered as an empty page. Scoping the
        // entrant list (and every match lookup below) to this one zone is what stops a multi-zone
        // stage's zones from colliding on the same round/position.
        const format = effectiveFormat(zone, stage);
        const generated = generateFixtures({
          format: format as Parameters<typeof generateFixtures>[0]['format'],
          entrants: (record?.entrantIds ?? []).map((entrantId, index) => ({
            entrantId,
            seed: index + 1,
          })),
        });
        if (!generated.ok) {
          return {
            ...zone,
            format,
            ...(overallPlaceOffset === undefined ? {} : { overallPlaceOffset }),
            matches: [],
          };
        }
        const graph = generated.value;

        const ambiguous = ambiguousRoundPositions(graph.matches);

        const bracketMatches = graph.matches.map((match) =>
          toBracketMatch(match, stageMatchesMapped, {
            ambiguousPositions: ambiguous,
            matchFormat: undefined,
          }),
        );

        const { placements, sourcesOf } = bracketLinks(
          bracketMatches,
          zoneRecords,
          stageMatchesMapped,
        );

        const entrantIds = new Set<string>();
        for (const match of bracketMatches) {
          for (const slot of match.slots) {
            if (slot.entrantId) entrantIds.add(slot.entrantId);
          }
        }
        for (const node of placements) {
          for (const id of [node.record.homeEntrantId, node.record.awayEntrantId]) {
            if (id) entrantIds.add(id);
          }
        }
        const details = await enrollmentRepo.resolveEntrantPodiumDetails(Array.from(entrantIds));
        const visibilityByEntrant = await entrantVisibilityById(this.db, tournament, [
          ...entrantIds,
        ]);

        // Keyed by the round/position the bracket graph and the read model agree on, so a series
        // rides onto the cross it settles rather than onto a match id neither side shares — scoped
        // to this zone's own records, so a series can't ride onto another zone's identically
        // round/position-keyed cross.
        const seriesByPosition = await readStageSeriesByPosition(this.db, {
          tournamentId: tournament.tournamentId,
          stageId: stage.stageId,
          zoneId: zone.zoneId,
          records: stageMatchesMapped,
        });

        return {
          ...zone,
          format,
          ...(overallPlaceOffset === undefined ? {} : { overallPlaceOffset }),
          matches: [
            ...bracketMatches.map((m) => {
              const series = seriesByPosition.get(`${m.round}:${m.position}`);
              return {
                matchId: m.matchId,
                bracket: m.bracket,
                round: m.round,
                position: m.position,
                status: m.status,
                ...(m.winnerEntrantId === undefined ? {} : { winnerEntrantId: m.winnerEntrantId }),
                format: m.format,
                ...(m.persistedMatchId === undefined
                  ? {}
                  : { matchNumber: ordinalByMatchId.get(m.persistedMatchId) }),
                slots: m.slots.map((s, slotIndex) => {
                  const detail = s.entrantId ? details.get(s.entrantId) : undefined;
                  const visibility = s.entrantId ? visibilityByEntrant.get(s.entrantId) : undefined;
                  const from = s.kind === 'entrant' ? sourcesOf(m)[slotIndex] : undefined;
                  return {
                    kind: s.kind,
                    entrantId: s.entrantId,
                    ...(s.entrantId && !visibility?.hiddenAtRequest
                      ? { name: detail?.name ?? 'Unknown' }
                      : {}),
                    ...(visibility?.hiddenAtRequest ? { hiddenAtRequest: true } : {}),
                    ...(visibility === undefined
                      ? {}
                      : { publicProfileAvailable: visibility.publicProfileAvailable }),
                    ...(visibility?.publicProfileAvailable === false
                      ? {}
                      : {
                          abbreviation: detail?.abbreviation,
                          clubId: detail?.clubId,
                          emblemObjectId: detail?.emblemObjectId,
                        }),
                    matchId: s.matchId,
                    ...(from === undefined ? {} : { from }),
                    score: s.score,
                    resultReason: s.resultReason,
                  };
                }),
                ...(series === undefined ? {} : { series: seriesResponseOf(series) }),
              };
            }),
            ...placements.map((node) => ({
              ...placementMatchOf(node),
              matchNumber: ordinalByMatchId.get(node.record.matchId),
              slots: [node.record.homeEntrantId, node.record.awayEntrantId].map(
                (entrantId, index) => {
                  const detail = entrantId ? details.get(entrantId) : undefined;
                  const source = node.sources[index];
                  return {
                    kind: 'entrant' as const,
                    entrantId,
                    ...(entrantId && !visibilityByEntrant.get(entrantId)?.hiddenAtRequest
                      ? { name: detail?.name ?? 'Unknown' }
                      : {}),
                    ...(visibilityByEntrant.get(entrantId ?? '')?.hiddenAtRequest
                      ? { hiddenAtRequest: true }
                      : {}),
                    ...(entrantId && visibilityByEntrant.has(entrantId)
                      ? {
                          publicProfileAvailable:
                            visibilityByEntrant.get(entrantId)?.publicProfileAvailable,
                        }
                      : {}),
                    ...(visibilityByEntrant.get(entrantId ?? '')?.publicProfileAvailable === false
                      ? {}
                      : {
                          abbreviation: detail?.abbreviation,
                          clubId: detail?.clubId,
                          emblemObjectId: detail?.emblemObjectId,
                        }),
                    ...(source === undefined ? {} : { from: source }),
                    score: node.record.scores?.[index],
                    resultReason: node.record.resultReasons?.[index],
                  };
                },
              ),
            })),
          ],
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
    const entrantIds = rows.flatMap((row) =>
      [row.homeEntrantId, row.awayEntrantId].filter(
        (entrantId): entrantId is string => entrantId !== undefined,
      ),
    );
    const entrantVisibility = await entrantVisibilityById(this.db, tournament, entrantIds);
    return {
      matches: rows.map((row) => {
        const homeVisibility = row.homeEntrantId
          ? entrantVisibility.get(row.homeEntrantId)
          : undefined;
        const awayVisibility = row.awayEntrantId
          ? entrantVisibility.get(row.awayEntrantId)
          : undefined;
        return {
          matchId: row.matchId,
          nodeKey: row.nodeKey,
          homeSource: row.homeSource,
          awaySource: row.awaySource,
          scheduleVersion: row.scheduleVersion,
          rescheduledFrom: row.rescheduledFrom,
          stageNumber: row.stageNumber,
          ...(row.stageName === undefined ? {} : { stageName: row.stageName }),
          matchNumber: row.matchNumber,
          round: row.round,
          status: row.status,
          ...(row.homeEntrantId === undefined ? {} : { homeEntrantId: row.homeEntrantId }),
          ...(row.homeName === undefined || homeVisibility?.hiddenAtRequest
            ? {}
            : { homeName: row.homeName }),
          ...(homeVisibility?.hiddenAtRequest ? { homeHiddenAtRequest: true } : {}),
          ...(homeVisibility === undefined
            ? {}
            : { homePublicProfileAvailable: homeVisibility.publicProfileAvailable }),
          ...(row.homeAbbreviation === undefined || homeVisibility?.publicProfileAvailable === false
            ? {}
            : { homeAbbreviation: row.homeAbbreviation }),
          ...(homeVisibility?.publicProfileAvailable === false
            ? {}
            : row.homeClubId === undefined
              ? {}
              : { homeClubId: row.homeClubId }),
          ...(homeVisibility?.publicProfileAvailable === false ||
          row.homeClubAlias === undefined ||
          row.homeClubAlias === ''
            ? {}
            : { homeClubAlias: row.homeClubAlias }),
          ...(homeVisibility?.publicProfileAvailable === false
            ? {}
            : row.homeEmblemObjectId === undefined
              ? {}
              : { homeEmblemObjectId: row.homeEmblemObjectId }),
          ...(row.awayEntrantId === undefined ? {} : { awayEntrantId: row.awayEntrantId }),
          ...(row.awayName === undefined || awayVisibility?.hiddenAtRequest
            ? {}
            : { awayName: row.awayName }),
          ...(awayVisibility?.hiddenAtRequest ? { awayHiddenAtRequest: true } : {}),
          ...(awayVisibility === undefined
            ? {}
            : { awayPublicProfileAvailable: awayVisibility.publicProfileAvailable }),
          ...(row.awayAbbreviation === undefined || awayVisibility?.publicProfileAvailable === false
            ? {}
            : { awayAbbreviation: row.awayAbbreviation }),
          ...(awayVisibility?.publicProfileAvailable === false
            ? {}
            : row.awayClubId === undefined
              ? {}
              : { awayClubId: row.awayClubId }),
          ...(awayVisibility?.publicProfileAvailable === false ||
          row.awayClubAlias === undefined ||
          row.awayClubAlias === ''
            ? {}
            : { awayClubAlias: row.awayClubAlias }),
          ...(awayVisibility?.publicProfileAvailable === false
            ? {}
            : row.awayEmblemObjectId === undefined
              ? {}
              : { awayEmblemObjectId: row.awayEmblemObjectId }),
          ...(row.homeScore === undefined ? {} : { homeScore: row.homeScore }),
          ...(row.awayScore === undefined ? {} : { awayScore: row.awayScore }),
          ...(row.clockSeconds === undefined ? {} : { clockSeconds: row.clockSeconds }),
          ...(row.clock === undefined ? {} : { clock: row.clock }),
          ...(row.segments === undefined ? {} : { segments: [...row.segments] }),
          ...(row.venueName === undefined ? {} : { venueName: row.venueName }),
          ...(row.scheduledAt === undefined ? {} : { scheduledAt: row.scheduledAt }),
          ...(row.latestEvent === undefined ? {} : { latestEvent: row.latestEvent }),
          ...(row.zoneName === undefined ? {} : { zoneName: row.zoneName }),
          ...(row.groupName === undefined ? {} : { groupName: row.groupName }),
          ...(row.homePosition === undefined ? {} : { homePosition: row.homePosition }),
          ...(row.awayPosition === undefined ? {} : { awayPosition: row.awayPosition }),
          ...(row.series === undefined ? {} : { series: seriesResponseOf(row.series) }),
          ...(row.decidingFactor === undefined ? {} : { decidingFactor: row.decidingFactor }),
          ...(row.decidingFactorCode === undefined
            ? {}
            : { decidingFactorCode: row.decidingFactorCode }),
          ...(row.decidingFactorRule === undefined
            ? {}
            : { decidingFactorRule: row.decidingFactorRule }),
        };
      }),
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
  @ApiQuery({
    name: 'club',
    required: false,
    type: String,
    description: 'Filter rows to entrants of this club alias',
  })
  @ApiQuery({
    name: 'clubId',
    required: false,
    type: String,
    description: 'Legacy filter: entrants of this club id',
  })
  @ApiOkResponse({ type: TableProjectionResponse })
  async tournamentTable(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('layoutCode') layoutCode: string,
    @Query('club') club?: string,
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
        clubAlias: normalizeClubAliasQuery(club),
        clubId,
      },
      layoutCode,
    );
    return tableResponse(await this.protectPublicPersonRows(tournament, result));
  }

  @Get('public/tables/:layoutCode/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="standings.csv"')
  @SecurityPlaneTag('public-read')
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Download a tournament-wide public table as CSV' })
  @ApiQuery({
    name: 'club',
    required: false,
    type: String,
    description: 'Filter rows to entrants of this club alias',
  })
  @ApiQuery({
    name: 'clubId',
    required: false,
    type: String,
    description: 'Legacy filter: entrants of this club id',
  })
  @ApiOkResponse({ description: 'CSV table export', schema: { type: 'string', format: 'binary' } })
  async tournamentTableCsv(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('layoutCode') layoutCode: string,
    @Query('club') club?: string,
    @Query('clubId') clubId?: string,
  ): Promise<string> {
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
        clubAlias: normalizeClubAliasQuery(club),
        clubId,
      },
      layoutCode,
    );
    return publicTableCsv(tableResponse(await this.protectPublicPersonRows(tournament, result)));
  }

  @Get('stages/:stageNumber/public/tables/:layoutCode')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: 'A stage-scoped table projection (group standings, schedule tables)' })
  @ApiQuery({
    name: 'club',
    required: false,
    type: String,
    description: 'Filter rows to entrants of this club alias',
  })
  @ApiQuery({
    name: 'clubId',
    required: false,
    type: String,
    description: 'Legacy filter: entrants of this club id',
  })
  @ApiOkResponse({ type: TableProjectionResponse })
  async stageTable(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber') stageNumberStr: string,
    @Param('layoutCode') layoutCode: string,
    @Query('club') club?: string,
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
        clubAlias: normalizeClubAliasQuery(club),
        clubId,
      },
      layoutCode,
    );
    const protectedResult = await this.protectPublicPersonRows(tournament, result);
    const response = segmentedTableResponse(protectedResult);
    if (
      result.layout.target !== 'group-phase' ||
      (result.layout.entityGranularity !== 'team' && result.layout.entityGranularity !== 'club')
    ) {
      return response;
    }
    return withPublicPromotionBands(
      response,
      await this.publicPromotionBandsForStage(tournament, stage),
    );
  }

  @Get('stages/:stageNumber/public/tables/:layoutCode/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="standings.csv"')
  @SecurityPlaneTag('public-read')
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Download a stage-scoped public table as CSV' })
  @ApiQuery({
    name: 'club',
    required: false,
    type: String,
    description: 'Filter rows to entrants of this club alias',
  })
  @ApiQuery({
    name: 'clubId',
    required: false,
    type: String,
    description: 'Legacy filter: entrants of this club id',
  })
  @ApiOkResponse({ description: 'CSV table export', schema: { type: 'string', format: 'binary' } })
  async stageTableCsv(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('stageNumber') stageNumberStr: string,
    @Param('layoutCode') layoutCode: string,
    @Query('club') club?: string,
    @Query('clubId') clubId?: string,
  ): Promise<string> {
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
        clubAlias: normalizeClubAliasQuery(club),
        clubId,
      },
      layoutCode,
    );
    const protectedResult = await this.protectPublicPersonRows(tournament, result);
    let response = segmentedTableResponse(protectedResult);
    if (
      result.layout.target === 'group-phase' &&
      (result.layout.entityGranularity === 'team' || result.layout.entityGranularity === 'club')
    ) {
      response = withPublicPromotionBands(
        response,
        await this.publicPromotionBandsForStage(tournament, stage),
      );
    }
    return publicTableCsv(response);
  }

  private async publicPromotionBandsForStage(
    tournament: Pick<Tournament, 'tournamentId' | 'disciplineRef'>,
    stage: { readonly stageId: string; readonly number: number },
  ): Promise<readonly PublicPromotionBand[]> {
    const competition = new CompetitionRepository(this.db);
    const zones = await competition.listZonesOfStage(stage.stageId);
    const result: PublicPromotionBand[] = [];

    for (const zone of zones) {
      const saved = await competition.findPromotionPlan(zone.zoneId);
      if (!saved) continue;
      const plan = promotionPlanFromStored(zone.zoneId, saved.nextStageId, saved.plan);
      if (plan.bands === undefined) continue;

      let outcome;
      try {
        outcome = await evaluateStoredPromotion(this.db, {
          tournamentId: tournament.tournamentId,
          tournament,
          sourceStageId: stage.stageId,
          zone,
          saved,
        });
      } catch (error) {
        // A tied or unfinished qualification cut has no stable public seed order yet. Keep the
        // configured legend, but do not mark rows as though that order were resolved.
        if (!(error instanceof QualificationError)) throw error;
      }

      const seedByEntrant = new Map(
        outcome?.combined.map((entrant, index) => [entrant.entrantId, index + 1]) ?? [],
      );
      let firstSeed = 1;
      for (const band of plan.bands) {
        const bandIndex = result.length;
        const seeds = (outcome?.bands?.[band.zoneRef] ?? []).flatMap((entrant) => {
          const seed = seedByEntrant.get(entrant.entrantId);
          return seed === undefined ? [] : [{ entrantId: entrant.entrantId, seed }];
        });
        result.push({
          label: band.zoneRef,
          ...(isImplicitZone(zone) ? {} : { sourceZoneName: zone.name }),
          index: bandIndex,
          firstSeed,
          lastSeed: firstSeed + band.count - 1,
          seeds,
        });
        firstSeed += band.count;
      }
    }
    return result;
  }

  @Get('persons/:personId/public/profile')
  @SecurityPlaneTag('public-read')
  @ApiOperation({ summary: "A person's public career and competition profile" })
  @ApiOkResponse({ type: PublicPersonProfileResponse })
  async playerProfile(
    @Param('organizationAlias') organizationAlias: string,
    @Param('tournamentAlias') tournamentAlias: string,
    @Param('personId') personId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<PublicPersonProfileResponse> {
    const { tournament } = await this.resolvePublishedTournament(
      organizationAlias,
      tournamentAlias,
    );
    const people = new PersonRepository(this.db);
    const person = await people.findPerson(personId);
    if (
      !person ||
      person.organizationId !== tournament.organizationId ||
      !canShowPublicPlayerProfile(tournament, person.hiddenFromPublic)
    ) {
      throw new NotFoundException(
        `No person "${personId}" found in organization "${organizationAlias}"`,
        { errorCode: 'public-projection-not-found' },
      );
    }

    const [history, careerDisciplineTotals, descriptorRows] = await Promise.all([
      people.competitionHistory(tournament.organizationId, personId),
      people.careerTotals(tournament.organizationId, personId),
      this.db
        .selectFrom('discipline_descriptors')
        .select(['descriptor_id as descriptorId', 'version', 'document'])
        .execute(),
    ]);

    const descriptorMap = new Map<string, DisciplineDescriptor>();
    const descriptorVersionMap = new Map<string, DisciplineDescriptor>();
    for (const d of descriptorRows) {
      const parsed = (
        typeof d.document === 'string' ? JSON.parse(d.document) : d.document
      ) as DisciplineDescriptor;
      descriptorMap.set(d.descriptorId, parsed);
      descriptorVersionMap.set(`${d.descriptorId}@${d.version}`, parsed);
    }

    const uniqueTournamentIds = [...new Set(history.map((item) => item.tournamentId))];
    const shirtNumbersByTournament = new Map(
      await Promise.all(
        uniqueTournamentIds.map(async (tid) => {
          const numbers = await latestFinalizedShirtNumbers(this.db, {
            organizationId: tournament.organizationId,
            tournamentId: tid,
            personIds: [personId],
          });
          return [tid, numbers.get(personId)] as const;
        }),
      ),
    );

    const careerStatistics = buildCareerStatistics({
      careerDisciplineTotals,
      history,
      descriptorMap,
      descriptorVersionMap,
    });

    const competitionHistory = history.map((item) => {
      const desc =
        descriptorVersionMap.get(
          `${item.disciplineRef.descriptorId}@${item.disciplineRef.version}`,
        ) ?? descriptorMap.get(item.disciplineRef.descriptorId);
      const localizedDisciplineName =
        desc?.name !== undefined && typeof desc.name !== 'string' ? desc.name : undefined;
      const shirtNumber = shirtNumbersByTournament.get(item.tournamentId);
      return {
        tournamentId: item.tournamentId,
        tournamentName: item.tournamentName,
        tournamentAlias: item.tournamentAlias,
        teamId: item.teamId,
        teamName: item.teamName,
        ...(item.clubAlias === undefined ? {} : { clubAlias: item.clubAlias }),
        ...(shirtNumber === undefined ? {} : { shirtNumber }),
        role: item.role,
        entrantId: item.entrantId,
        entrantName: item.entrantName,
        entrantAbbreviation: item.entrantAbbreviation,
        disciplineDescriptorId: item.disciplineRef.descriptorId,
        disciplineDescriptorVersion: item.disciplineRef.version,
        disciplineName: desc?.name ? resolveLabel(desc.name, 'en') : undefined,
        ...(localizedDisciplineName === undefined ? {} : { localizedDisciplineName }),
      };
    });

    // Set here, not with @Header: Nest applies that before the handler, so a 404 would carry it.
    reply.header('Cache-Control', 'public, max-age=60');
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
    if (
      !person ||
      person.organizationId !== tournament.organizationId ||
      !canShowPublicPlayerProfile(tournament, person.hiddenFromPublic)
    ) {
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
          includesMinors: tournament.includesMinors,
          showYouthProfiles: tournament.showYouthProfiles,
        },
      },
      personId,
      layoutCode,
    );
    return playerStatisticsResponse(result);
  }

  private async protectPublicPersonRows<T extends TableProjectionResult>(
    tournament: Tournament,
    result: T,
  ): Promise<T> {
    if (result.layout.entityGranularity !== 'person') return result;
    const segmentedResult =
      'segments' in result ? (result as T & SegmentedTableProjectionResult) : undefined;
    const rows = [
      ...result.rows,
      ...(segmentedResult?.segments.flatMap((segment) => segment.rows) ?? []),
    ];
    const visibilityById = await personVisibilityById(
      this.db,
      tournament,
      rows.map((row) => row.actorId),
    );
    const actorNameCodes = new Set(
      result.layout.columns
        .filter((column) => column.source.kind === 'actor-name')
        .map((column) => column.code),
    );
    const entrantNameCodes = new Set(
      result.layout.columns
        .filter(
          (column) => column.source.kind === 'entrant-name' || column.source.kind === 'team-name',
        )
        .map((column) => column.code),
    );
    const protectRows = (source: readonly TableProjectionRow[]): TableProjectionRow[] =>
      source.map((row) => {
        const visibility = visibilityById.get(row.actorId) ?? personVisibility(tournament);
        const { nationality, shirtNumber, ...withoutProtected } = row;
        const suppressedCodes = new Set([
          ...(visibility.hiddenAtRequest ? actorNameCodes : []),
          ...(!visibility.publicProfileAvailable ? entrantNameCodes : []),
        ]);
        const cells =
          suppressedCodes.size > 0
            ? Object.fromEntries(
                Object.entries(row.cells).map(([code, cell]) =>
                  suppressedCodes.has(code)
                    ? [code, { ...cell, formatted: '', raw: undefined }]
                    : [code, cell],
                ),
              )
            : row.cells;
        return {
          ...withoutProtected,
          ...(!visibility.publicProfileAvailable
            ? {
                entrantName: undefined,
                entrantAbbreviation: undefined,
                clubId: undefined,
                clubAlias: undefined,
                emblemObjectId: undefined,
              }
            : {}),
          ...(visibility.hiddenAtRequest ? { actorName: '', hiddenAtRequest: true } : {}),
          publicProfileAvailable: visibility.publicProfileAvailable,
          ...(visibility.nationalityVisible && nationality !== undefined ? { nationality } : {}),
          ...(visibility.hiddenAtRequest || shirtNumber === undefined ? {} : { shirtNumber }),
          cells,
        };
      });

    if (segmentedResult !== undefined) {
      return {
        ...segmentedResult,
        rows: protectRows(result.rows),
        segments: segmentedResult.segments.map((segment) => ({
          ...segment,
          rows: protectRows(segment.rows),
        })),
      } as T;
    }
    return { ...result, rows: protectRows(result.rows) } as T;
  }
}

function normalizeClubAliasQuery(club: string | undefined): string | undefined {
  const trimmed = club?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function canShowPublicPlayerProfile(tournament: Tournament, hiddenFromPublic?: boolean): boolean {
  return (
    hiddenFromPublic !== true &&
    !(tournament.includesMinors === true && tournament.showYouthProfiles !== true)
  );
}

function buildCareerStatistics(input: {
  readonly careerDisciplineTotals: Awaited<ReturnType<PersonRepository['careerTotals']>>;
  readonly history: Awaited<ReturnType<PersonRepository['competitionHistory']>>;
  readonly descriptorMap: ReadonlyMap<string, DisciplineDescriptor>;
  readonly descriptorVersionMap: ReadonlyMap<string, DisciplineDescriptor>;
}): PublicPersonProfileResponse['careerStatistics'] {
  const totalsByDescriptor = new Map(
    input.careerDisciplineTotals
      .filter((disc) => disc.descriptorId !== 'default')
      .map((disc) => [disc.descriptorId, disc]),
  );
  const versionByDescriptor = new Map<string, string>();
  const orderedDescriptorIds: string[] = [];
  const addDescriptorId = (descriptorId: string, version?: string) => {
    if (version !== undefined && !versionByDescriptor.has(descriptorId)) {
      versionByDescriptor.set(descriptorId, version);
    }
    if (!orderedDescriptorIds.includes(descriptorId)) orderedDescriptorIds.push(descriptorId);
  };
  for (const disc of input.careerDisciplineTotals) {
    if (disc.descriptorId !== 'default') addDescriptorId(disc.descriptorId);
  }
  for (const item of input.history) {
    addDescriptorId(item.disciplineRef.descriptorId, item.disciplineRef.version);
  }

  const result: PublicPersonProfileResponse['careerStatistics'] = [];
  for (const descriptorId of orderedDescriptorIds) {
    const version = versionByDescriptor.get(descriptorId);
    const desc =
      (version !== undefined
        ? input.descriptorVersionMap.get(`${descriptorId}@${version}`)
        : undefined) ?? input.descriptorMap.get(descriptorId);
    const existing = totalsByDescriptor.get(descriptorId);
    const statistics = mergeCareerDisciplineCollectors(desc, existing?.totals ?? []);
    if (statistics.length === 0) continue;

    const localizedDisciplineName =
      desc?.name !== undefined && typeof desc.name !== 'string' ? desc.name : undefined;
    result.push({
      disciplineDescriptorId: descriptorId,
      disciplineName:
        existing?.disciplineName ?? (desc?.name ? resolveLabel(desc.name, 'en') : undefined),
      ...(localizedDisciplineName === undefined ? {} : { localizedDisciplineName }),
      statistics,
    });
  }

  const unclaimed = input.careerDisciplineTotals.find((disc) => disc.descriptorId === 'default');
  if (unclaimed && unclaimed.totals.length > 0) {
    result.push({
      disciplineDescriptorId: unclaimed.descriptorId,
      disciplineName: unclaimed.disciplineName,
      statistics: unclaimed.totals.map((tot) => ({
        code: tot.collectorCode,
        label: tot.collectorCode,
        value: tot.value,
        samples: tot.samples,
      })),
    });
  }
  return result;
}

function mergeCareerDisciplineCollectors(
  desc: DisciplineDescriptor | undefined,
  recordedTotals: readonly {
    readonly collectorCode: string;
    readonly value: number;
    readonly samples: number;
  }[],
): PublicPersonProfileResponse['careerStatistics'][number]['statistics'] {
  const recordedByCode = new Map(recordedTotals.map((tot) => [tot.collectorCode, tot]));
  const collectorMap = new Map<string, StatisticCollector>();
  const emitted = new Set<string>();
  const statistics: PublicPersonProfileResponse['careerStatistics'][number]['statistics'] = [];

  for (const collector of desc?.collectors ?? []) {
    collectorMap.set(collector.code, collector);
    if (!readableAt(collector, { actor: 'person', competition: 'organization' })) continue;
    const recorded = recordedByCode.get(collector.code);
    statistics.push(careerStatisticItem(collector.code, collector, recorded));
    emitted.add(collector.code);
  }

  for (const tot of recordedTotals) {
    if (emitted.has(tot.collectorCode)) continue;
    statistics.push(
      careerStatisticItem(tot.collectorCode, collectorMap.get(tot.collectorCode), tot),
    );
  }
  return statistics;
}

function careerStatisticItem(
  code: string,
  colDef: StatisticCollector | undefined,
  recorded: { readonly value: number; readonly samples: number } | undefined,
): PublicPersonProfileResponse['careerStatistics'][number]['statistics'][number] {
  const localizedLabel =
    colDef?.label !== undefined && typeof colDef.label !== 'string' ? colDef.label : undefined;
  const label = colDef?.label ? resolveLabel(colDef.label, 'en') : code;
  return {
    code,
    label,
    ...(localizedLabel === undefined ? {} : { localizedLabel }),
    value: recorded?.value ?? 0,
    samples: recorded?.samples ?? 0,
  };
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
      ...(row.scheduledAt === undefined ? {} : { scheduledAt: row.scheduledAt }),
      side: row.side,
      opponentName: row.opponentName,
      ...(row.opponentAbbreviation === undefined
        ? {}
        : { opponentAbbreviation: row.opponentAbbreviation }),
      ...(row.opponentClubAlias === undefined ? {} : { opponentClubAlias: row.opponentClubAlias }),
      ...(row.ownScore === undefined ? {} : { ownScore: row.ownScore }),
      ...(row.opponentScore === undefined ? {} : { opponentScore: row.opponentScore }),
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

async function resolveFixtureScopeContext(
  db: Kysely<Database>,
  fixtureId: string,
): Promise<{
  readonly zoneFormat?: string;
  readonly zoneName?: string;
  readonly groupName?: string;
}> {
  const row = await db
    .selectFrom('fixtures')
    .leftJoin('groups', (join) =>
      join.onRef('groups.group_id', '=', 'fixtures.group_id').on('groups.deleted_at', 'is', null),
    )
    .leftJoin('zones as fixture_zones', (join) =>
      join
        .onRef('fixture_zones.zone_id', '=', 'fixtures.zone_id')
        .on('fixture_zones.deleted_at', 'is', null),
    )
    .leftJoin('zones as group_zones', (join) =>
      join
        .onRef('group_zones.zone_id', '=', 'groups.zone_id')
        .on('group_zones.deleted_at', 'is', null),
    )
    .select([
      'fixture_zones.format as fixture_zone_format',
      'fixture_zones.name as fixture_zone_name',
      'fixture_zones.number as fixture_zone_number',
      'group_zones.format as group_zone_format',
      'group_zones.name as group_zone_name',
      'group_zones.number as group_zone_number',
      'groups.name as group_name',
      'groups.number as group_number',
    ])
    .where('fixtures.fixture_id', '=', fixtureId)
    .executeTakeFirst();
  if (!row) return {};

  const zoneFormat = row.fixture_zone_format ?? row.group_zone_format ?? undefined;
  const zoneNameRaw = row.fixture_zone_name ?? row.group_zone_name;
  const zoneNumberRaw = row.fixture_zone_number ?? row.group_zone_number;
  const zone =
    zoneNameRaw === null || zoneNumberRaw === null
      ? undefined
      : { name: zoneNameRaw, number: zoneNumberRaw };
  const group =
    row.group_name === null || row.group_number === null
      ? undefined
      : { name: row.group_name, number: row.group_number };
  return {
    ...(zoneFormat === undefined ? {} : { zoneFormat }),
    ...(zone === undefined || isImplicitZone(zone) ? {} : { zoneName: zone.name }),
    ...(group === undefined || isImplicitGroup(group) ? {} : { groupName: group.name }),
  };
}

const BRACKET_FORMATS: ReadonlySet<string> = new Set([
  'single-elimination',
  'double-elimination',
  'gauntlet',
  'bracket-groups',
  'custom-bracket',
  'ffa-bracket',
  'ffa-bracket-groups',
]);

function isResolvedListingMatch(status: string): boolean {
  return status === 'finalized' || status === 'finished' || status === 'forfeited';
}

function listingProgressAndSchedule(
  matches: readonly {
    readonly stageNumber: number;
    readonly stageName?: string;
    readonly status: string;
    readonly scheduledAt?: string;
  }[],
): {
  readonly progress?: PublicTournamentListingItemResponse['progress'];
  readonly schedule?: PublicTournamentListingItemResponse['schedule'];
} {
  if (matches.length === 0) return {};

  const resolvable = matches.filter((m) => m.status !== 'not-required');
  const totalMatches = resolvable.length;
  const resolvedMatches = resolvable.filter((m) => isResolvedListingMatch(m.status)).length;
  const firstUnresolved = resolvable
    .filter((m) => !isResolvedListingMatch(m.status))
    .reduce<(typeof resolvable)[number] | undefined>(
      (earliest, candidate) =>
        earliest === undefined || candidate.stageNumber < earliest.stageNumber
          ? candidate
          : earliest,
      undefined,
    );

  const progress: PublicTournamentListingItemResponse['progress'] = {
    ...(resolvedMatches < totalMatches && firstUnresolved !== undefined
      ? {
          currentStageNumber: firstUnresolved.stageNumber,
          ...(firstUnresolved.stageName ? { currentStageName: firstUnresolved.stageName } : {}),
        }
      : {}),
    resolvedMatches,
    totalMatches,
  };

  let firstMs = Number.POSITIVE_INFINITY;
  let lastMs = Number.NEGATIVE_INFINITY;
  let firstKickoffAt: string | undefined;
  let lastKickoffAt: string | undefined;
  for (const match of matches) {
    if (match.scheduledAt === undefined) continue;
    const ms = Date.parse(match.scheduledAt);
    if (!Number.isFinite(ms)) continue;
    if (ms < firstMs) {
      firstMs = ms;
      firstKickoffAt = match.scheduledAt;
    }
    if (ms > lastMs) {
      lastMs = ms;
      lastKickoffAt = match.scheduledAt;
    }
  }

  return {
    progress,
    ...(firstKickoffAt !== undefined && lastKickoffAt !== undefined
      ? { schedule: { firstKickoffAt, lastKickoffAt } }
      : {}),
  };
}

function selectOverviewStandingsStage<
  StageEntry extends {
    readonly stage: { readonly number: number; readonly format: TournamentFormat };
    readonly zones: readonly { readonly format?: TournamentFormat }[];
  },
>(
  zonesByStage: readonly StageEntry[],
  matches: readonly { readonly stageNumber: number; readonly status: string }[],
): StageEntry | undefined {
  const nonBracket = zonesByStage.filter(({ stage, zones }) =>
    zones.length === 0
      ? !BRACKET_FORMATS.has(stage.format)
      : zones.some((zone) => !BRACKET_FORMATS.has(effectiveFormat(zone, stage))),
  );
  const withResolved = [...nonBracket]
    .reverse()
    .find(({ stage }) =>
      matches.some((m) => m.stageNumber === stage.number && isResolvedListingMatch(m.status)),
    );
  return withResolved ?? nonBracket[0] ?? zonesByStage[0];
}

function tableRowStatistics(
  row: TableProjectionRow,
  layout: TableLayoutDefinition,
): Record<string, number> {
  const statistics: Record<string, number> = {};
  for (const column of layout.columns) {
    if (column.source.kind === 'rank') continue;
    const cell = row.cells[column.code];
    if (cell && typeof cell.raw === 'number' && Number.isFinite(cell.raw)) {
      statistics[column.code] = cell.raw;
    }
  }
  return statistics;
}

async function formatOverviewStandingsRows(
  db: Kysely<Database>,
  tournament: Tournament,
  rows: readonly {
    readonly rank: number;
    readonly entrantId: string;
    readonly sharedRank: boolean;
    readonly statistics: Record<string, number>;
    readonly zoneName?: string;
    readonly groupName?: string;
    readonly fallbackName?: string;
    readonly fallbackAbbreviation?: string;
    readonly fallbackClubId?: string;
    readonly fallbackEmblemObjectId?: string;
  }[],
): Promise<PublicOverviewResponse['standingsPreview']> {
  const entrantIds = rows.map((row) => row.entrantId);
  const [standingsDetails, standingsVisibility] = await Promise.all([
    new EnrollmentRepository(db).resolveEntrantPodiumDetails(entrantIds),
    entrantVisibilityById(db, tournament, entrantIds),
  ]);
  return rows.map((row) => {
    const visibility = standingsVisibility.get(row.entrantId);
    const details = standingsDetails.get(row.entrantId);
    const abbreviation = details?.abbreviation ?? row.fallbackAbbreviation;
    const clubId = details?.clubId ?? row.fallbackClubId;
    const emblemObjectId = details?.emblemObjectId ?? row.fallbackEmblemObjectId;
    return {
      rank: row.rank,
      entrantId: row.entrantId,
      ...(visibility?.hiddenAtRequest
        ? { hiddenAtRequest: true }
        : { name: details?.name ?? row.fallbackName ?? 'Unknown' }),
      ...(visibility === undefined
        ? {}
        : { publicProfileAvailable: visibility.publicProfileAvailable }),
      ...(visibility?.publicProfileAvailable === false || abbreviation === undefined
        ? {}
        : { abbreviation }),
      ...(visibility?.publicProfileAvailable === false || clubId === undefined ? {} : { clubId }),
      ...(visibility?.publicProfileAvailable === false || emblemObjectId === undefined
        ? {}
        : { emblemObjectId }),
      sharedRank: row.sharedRank,
      statistics: row.statistics,
      ...(row.zoneName === undefined ? {} : { zoneName: row.zoneName }),
      ...(row.groupName === undefined ? {} : { groupName: row.groupName }),
    };
  });
}
