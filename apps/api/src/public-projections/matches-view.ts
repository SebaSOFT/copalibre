import { NotFoundException } from '../http/error-contract.js';
import { Database } from '@copalibre/persistence';
import { PublicMatchesViewResponse } from '../dto/public-tournament.dto.js';
import { Kysely } from 'kysely';
import { readMatchesView } from '../matches-view/read.js';
import { seriesResponseOf } from '../controllers/stage-series.js';
import { entrantVisibilityById } from '../public-person-visibility.js';
import { resolvePublishedTournament } from './context.js';

export async function matchesView(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumberValue: string | undefined,
  groupId: string | undefined,
  state: 'all' | 'live' | 'upcoming' | 'final' | undefined,
): Promise<PublicMatchesViewResponse> {
  const { tournament } = await resolvePublishedTournament(db, organizationAlias, tournamentAlias);
  const stageNumber = stageNumberValue === undefined ? undefined : Number(stageNumberValue);
  if (stageNumber !== undefined && (!Number.isSafeInteger(stageNumber) || stageNumber < 1)) {
    throw new NotFoundException({ errorCode: 'public-projection-not-found' });
  }

  const rows = await readMatchesView(db, tournament, { stageNumber, groupId, state });
  const entrantIds = rows.flatMap((row) =>
    [row.homeEntrantId, row.awayEntrantId].filter(
      (entrantId): entrantId is string => entrantId !== undefined,
    ),
  );
  const entrantVisibility = await entrantVisibilityById(db, tournament, entrantIds);
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
