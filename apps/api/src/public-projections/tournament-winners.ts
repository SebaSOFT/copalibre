import { Logger } from '@nestjs/common';
import {
  CompetitionRepository,
  Database,
  EnrollmentRepository,
  StageReadModel,
} from '@copalibre/persistence';
import { PublicTournamentWinnerZoneResponse } from '../dto/public-tournament.dto.js';
import { Kysely } from 'kysely';
import { readStandings } from '../standings/read.js';
import {
  persistedChampionshipFixture,
  reconstructChampionshipFixture,
} from '../controllers/tournament-winner-resolution.js';
import { entrantVisibilityById } from '../public-person-visibility.js';
import { generateFixtures } from '@copalibre/tournament-engine';
import { type Tournament } from '@copalibre/domain';

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
