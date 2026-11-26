import {
  AliasRepository,
  CompetitionRepository,
  Database,
  EnrollmentRepository,
  PublicOverviewReadModel,
  TournamentRepository,
  withTransaction,
} from '@copalibre/persistence';
import {
  PublicOverviewMatchResponse,
  PublicOverviewResponse,
  PublicTournamentWinnerZoneResponse,
} from '../dto/public-tournament.dto.js';
import { Kysely } from 'kysely';
import { readStandings, readStandingsByZone } from '../standings/read.js';
import { readPublicScheduleChanges, readPublicVenues } from '../matches-view/schedule.js';
import {
  readSegmentedTableProjection,
  stageOrdinalsOf,
  type TableProjectionRow,
} from '../table-projections/read.js';
import { readTournamentFixtureSources } from '../controllers/fixture-sources.js';
import { publicRuleset } from '../controllers/public-ruleset.js';
import { entrantVisibilityById } from '../public-person-visibility.js';
import {
  deriveTournamentStatus,
  effectiveFormat,
  isImplicitZone,
  resolveEffectiveTableLayouts,
  resolveLabel,
  type TableLayoutDefinition,
  type Tournament,
  type TournamentFormat,
} from '@copalibre/domain';
import { formerAliasesOf, isResolvedListingMatch, resolvePublishedTournament } from './context.js';
import { resolveTournamentWinners } from './tournament-winners.js';

export async function overview(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
): Promise<PublicOverviewResponse> {
  const { tournament, organizationName, organizationTimeZone } = await resolvePublishedTournament(
    db,
    organizationAlias,
    tournamentAlias,
  );
  const season = await withTransaction(db, (uow) =>
    new CompetitionRepository(db).currentSeason(uow, {
      tournamentId: tournament.tournamentId,
      organizationId: tournament.organizationId,
      actor: 'system',
      authorizationContext: '',
    }),
  );

  const matches = await new PublicOverviewReadModel(db).matchesForTournament(
    tournament.tournamentId,
  );
  const ordinalByMatchId = await stageOrdinalsOf(db, tournament.tournamentId);
  const fixtureSources = await readTournamentFixtureSources(db, tournament.tournamentId);
  const scheduleChanges = await readPublicScheduleChanges(
    db,
    matches.map((match) => match.matchId),
  );
  const venues = await readPublicVenues(
    db,
    matches.map((match) => match.matchId),
  );

  const entrantIds = new Set<string>();
  for (const match of matches) {
    if (match.homeEntrantId) entrantIds.add(match.homeEntrantId);
    if (match.awayEntrantId) entrantIds.add(match.awayEntrantId);
  }
  const entrantDetails = await new EnrollmentRepository(db).resolveEntrantPodiumDetails(
    Array.from(entrantIds),
  );
  const entrantVisibility = await entrantVisibilityById(db, tournament, [...entrantIds]);

  const rulesetData = await new TournamentRepository(db).findLatestRuleset(tournament.tournamentId);
  const descriptor = await new TournamentRepository(db).findDescriptor(
    tournament.disciplineRef.descriptorId,
    tournament.disciplineRef.version,
  );
  const { ruleset, labels: rulesetLabels } = publicRuleset(
    descriptor ?? undefined,
    rulesetData ?? undefined,
  );

  const competition = new CompetitionRepository(db);
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
        db,
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
        db,
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
      const byZone = await readStandingsByZone(db, tournament, selectedStage.number);
      const standings = byZone
        ? {
            rows: byZone.zones.flatMap((zone) =>
              zone.result.rows.map((row) => ({ ...row, zoneName: zone.zoneName })),
            ),
            grain: byZone.zones.find((zone) => 'grain' in zone.result)?.result.grain,
          }
        : await readStandings(db, tournament, selectedStage.number);

      standingsPreview = await formatOverviewStandingsRows(
        db,
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

  const clubRows = await db
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
  // Former aliases ride on the overview because every page that names a club by alias already
  // reads it: an old link is redirected without a second request.
  const formerClubAliases =
    clubRows.length > 0
      ? await new AliasRepository(db).clubFormerAliases(tournament.organizationId)
      : new Map<string, readonly string[]>();

  const status = deriveTournamentStatus(tournament.status, matches);
  let winners: PublicTournamentWinnerZoneResponse[] | undefined = undefined;
  if (status === 'finished') {
    winners = await resolveTournamentWinners(db, tournament);
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
      alias: c.alias,
      ...(c.emblemObjectId ? { emblemObjectId: c.emblemObjectId } : {}),
      ...formerAliasesOf(c.alias, formerClubAliases),
    })),
    ruleset,
    ...(Object.keys(rulesetLabels).length > 0 ? { rulesetLabels } : {}),
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
