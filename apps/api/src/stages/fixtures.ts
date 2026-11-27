import type { Kysely } from 'kysely';
import { type Database, CompetitionRepository, EnrollmentRepository } from '@copalibre/persistence';
import type { RequestWithSubject } from '../auth/request-context.js';
import { StageFixturesResponse } from '../dto/schedule.dto.js';
import { resolveTournament } from '../controllers/standings.controller.js';
import { NotFoundException } from '../http/error-contract.js';
import { readFixtureSources } from '../controllers/fixture-sources.js';
import {
  readSeriesResolver,
  resolveFixtureSeries,
  guaranteedMatchCount,
} from '../controllers/stage-series.js';

export async function fixtures(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  request: RequestWithSubject,
): Promise<StageFixturesResponse> {
  const { tournament } = await resolveTournament(db, {
    organizationAlias,
    tournamentAlias,
    request,
  });

  const competition = new CompetitionRepository(db);
  const stages = await competition.listStagesOfTournament(tournament.tournamentId);
  const stage = stages.find((candidate) => candidate.number === stageNumber);
  if (!stage)
    throw new NotFoundException(`No stage ${stageNumber} in "${tournamentAlias}"`, {
      errorCode: 'stage-not-found',
    });

  const fixtures = await competition.listFixturesOfStage(stage.stageId);
  const matches = await competition.listMatchesForStage(stage.stageId);
  const fixtureSources = await readFixtureSources(db, stage.stageId);
  const entrantNames = await new EnrollmentRepository(db).resolveEntrantNames(
    [
      ...new Set(fixtures.flatMap((fixture) => [fixture.homeEntrantId, fixture.awayEntrantId])),
    ].filter((id): id is string => id !== undefined),
  );
  // Each fixture resolves against its own zone's declaration.
  const seriesOf = await readSeriesResolver(db, {
    tournamentId: tournament.tournamentId,
    stageId: stage.stageId,
  });
  // Only paid for when a series exists: a stage of single matches anulls nothing, so there is
  // no released slot to look up and no audit scan to run.
  const releasedSlots = !seriesOf.declaresAny
    ? new Map<string, string>()
    : await competition.listReleasedSlotsOfStage(stage.stageId);

  // The stream link is not a domain field of a match; every game of a fixture reads its own stored link.
  const streamUrlByMatch = new Map(
    matches.length === 0
      ? []
      : (
          await db
            .selectFrom('matches')
            .select(['match_id', 'stream_url'])
            .where(
              'match_id',
              'in',
              matches.map((match) => match.matchId),
            )
            .execute()
        ).flatMap((row) =>
          row.stream_url === null ? [] : [[row.match_id, row.stream_url] as const],
        ),
  );

  const matchesByFixture = new Map<string, typeof matches>();
  for (const match of matches) {
    matchesByFixture.set(match.fixtureId, [
      ...(matchesByFixture.get(match.fixtureId) ?? []),
      match,
    ]);
  }

  return {
    stageId: stage.stageId,
    fixtures: fixtures.map((fixture) => {
      const own = [...(matchesByFixture.get(fixture.fixtureId) ?? [])].sort(
        (a, b) => a.number - b.number,
      );
      const declaration = seriesOf.forZone(fixture.zoneId);
      const resolution =
        declaration === undefined
          ? undefined
          : resolveFixtureSeries({
              declaration,
              homeEntrantId: fixture.homeEntrantId,
              awayEntrantId: fixture.awayEntrantId,
              matches: own,
            });

      return {
        fixtureId: fixture.fixtureId,
        matchId: own[0]?.matchId ?? fixture.fixtureId,
        // Deprecated alias: the first game's link, so a client that reads the fixture level keeps working.
        ...(streamUrlByMatch.get(own[0]?.matchId ?? '') === undefined
          ? {}
          : { streamUrl: streamUrlByMatch.get(own[0]?.matchId ?? '') }),
        ...fixtureSources.get(own[0]?.matchId ?? ''),
        round: fixture.round,
        ...(fixture.homeEntrantId === undefined ? {} : { homeEntrantId: fixture.homeEntrantId }),
        ...(fixture.awayEntrantId === undefined ? {} : { awayEntrantId: fixture.awayEntrantId }),
        ...(fixture.homeEntrantId === undefined
          ? {}
          : {
              homeName: entrantNames.get(fixture.homeEntrantId)?.name,
              homeAbbreviation: entrantNames.get(fixture.homeEntrantId)?.abbreviation,
            }),
        ...(fixture.awayEntrantId === undefined
          ? {}
          : {
              awayName: entrantNames.get(fixture.awayEntrantId)?.name,
              awayAbbreviation: entrantNames.get(fixture.awayEntrantId)?.abbreviation,
            }),
        matches: own.map((match) => {
          const releasedSlotId = releasedSlots.get(match.matchId);
          const streamUrl = streamUrlByMatch.get(match.matchId);
          return {
            matchId: match.matchId,
            number: match.number,
            status: match.status,
            ...(releasedSlotId === undefined ? {} : { releasedSlotId }),
            ...(streamUrl === undefined ? {} : { streamUrl }),
          };
        }),
        ...(declaration === undefined
          ? {}
          : {
              series: {
                span: declaration.span,
                ...(declaration.resolutionClass === undefined
                  ? {}
                  : { resolutionClass: declaration.resolutionClass }),
                guaranteedMatches: guaranteedMatchCount(declaration),
                matchesPlayed: resolution?.matchesPlayed ?? 0,
                anulledMatchNumbers: [...(resolution?.anulledMatchNumbers ?? [])],
                ...(resolution === undefined ? {} : { status: resolution.status }),
                ...(resolution === undefined ? {} : { explanation: resolution.explanation }),
                ...(resolution?.winnerEntrantId === undefined
                  ? {}
                  : { winnerEntrantId: resolution.winnerEntrantId }),
              },
            }),
      };
    }),
  };
}
