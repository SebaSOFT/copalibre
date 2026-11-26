import { NotFoundException } from '../http/error-contract.js';
import {
  Database,
  EnrollmentRepository,
  PublicOverviewReadModel,
  TournamentRepository,
} from '@copalibre/persistence';
import {
  PublicOrganizationLiveMatchResponse,
  PublicOrganizationTournamentListResponse,
  PublicTournamentListingItemResponse,
  PublicTournamentWinnerZoneResponse,
} from '../dto/public-tournament.dto.js';
import { Kysely } from 'kysely';
import {
  disciplineSummaryOf,
  loadDescriptorsById,
} from '../organization-club/discipline-summary.js';
import { readPublicVenues } from '../matches-view/schedule.js';
import { stageOrdinalsOf } from '../table-projections/read.js';
import { entrantVisibilityById } from '../public-person-visibility.js';
import { deriveTournamentStatus, type Tournament } from '@copalibre/domain';
import { isResolvedListingMatch } from './context.js';
import { resolveTournamentWinners } from './tournament-winners.js';

export async function listTournaments(
  db: Kysely<Database>,
  organizationAlias: string,
): Promise<PublicOrganizationTournamentListResponse> {
  const organization = await db
    .selectFrom('organizations')
    .select(['organization_id as organizationId', 'name', 'alias', 'emblem_object_id'])
    .where('alias', '=', organizationAlias)
    .executeTakeFirst();

  if (!organization) {
    throw new NotFoundException(`No organization "${organizationAlias}"`, {
      errorCode: 'public-projection-not-found',
    });
  }

  const clubs = await new EnrollmentRepository(db).listClubs(organization.organizationId);
  const tournamentRepo = new TournamentRepository(db);
  const publishedTournaments = await tournamentRepo.listPublishedByOrganization(
    organization.organizationId,
  );

  const descriptorMap = await loadDescriptorsById(db);

  const overviewReadModel = new PublicOverviewReadModel(db);
  const tournamentItems: PublicTournamentListingItemResponse[] = [];
  const inProgressTournaments: InProgressTournamentEntry[] = [];

  for (const [index, t] of publishedTournaments.entries()) {
    const matches = await overviewReadModel.matchesForTournament(t.tournamentId);
    const status = deriveTournamentStatus(t.status, matches);

    const discipline = disciplineSummaryOf(
      t.disciplineRef,
      descriptorMap.get(t.disciplineRef.descriptorId),
    );

    const dates =
      t.startedAt || t.archivedAt
        ? {
            startedAt: t.startedAt,
            archivedAt: t.archivedAt,
          }
        : undefined;

    let winners: PublicTournamentWinnerZoneResponse[] | undefined = undefined;
    if (status === 'finished') {
      winners = await resolveTournamentWinners(db, t);
    }
    const liveMatches =
      status === 'live' ? await liveMatchesForTournamentListing(db, t, matches) : [];
    const { progress, schedule } = listingProgressAndSchedule(matches);
    const venues = await readPublicVenues(
      db,
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
      ? await firstInProgressTournamentAliasByClub(db, inProgressTournaments)
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
        alias: club.alias,
        ...(club.emblemObjectId ? { emblemObjectId: club.emblemObjectId } : {}),
        ...(tournamentAlias ? { tournamentAlias } : {}),
      };
    }),
  };
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
  // Team entrants only: the same rule as the overview's club rows, so a club card never links to a
  // club page that the tournament does not serve.
  const teamEntrants = await db
    .selectFrom('entrants')
    .innerJoin('teams', 'teams.team_id', 'entrants.team_id')
    .select(['entrants.tournament_id as tournament_id', 'teams.club_id as club_id'])
    .where('entrants.tournament_id', 'in', tournamentIds)
    .where('teams.club_id', 'is not', null)
    .execute();

  const clubsByTournament = new Map<string, Set<string>>();
  for (const row of teamEntrants) {
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
