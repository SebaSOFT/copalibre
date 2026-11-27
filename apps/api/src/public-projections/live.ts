import {
  CompetitionRepository,
  Database,
  EnrollmentRepository,
  PublicOverviewReadModel,
  TournamentRepository,
} from '@copalibre/persistence';
import { PublicLiveResponse } from '../dto/public-tournament.dto.js';
import { Kysely } from 'kysely';
import { readPublicScheduleChanges } from '../matches-view/schedule.js';
import { stageOrdinalsOf } from '../table-projections/read.js';
import { readTournamentFixtureSources } from '../controllers/fixture-sources.js';
import { segmentSummariesOf } from '../controllers/public-segments.js';
import { publicClockOf } from '../controllers/segment-clock.js';
import { entrantVisibilityById } from '../public-person-visibility.js';
import { livePenaltiesOf, publicMatchCountersOf, resolvePublishedTournament } from './context.js';

export async function live(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
): Promise<PublicLiveResponse> {
  const { tournament } = await resolvePublishedTournament(db, organizationAlias, tournamentAlias);
  const matches = await new PublicOverviewReadModel(db).matchesForTournament(
    tournament.tournamentId,
  );
  const liveMatches = matches.filter((m) => m.status === 'in-progress');
  const fixtureSources = await readTournamentFixtureSources(db, tournament.tournamentId);
  const ordinalByMatchId = await stageOrdinalsOf(db, tournament.tournamentId);
  const scheduleChanges = await readPublicScheduleChanges(
    db,
    matches.map((match) => match.matchId),
  );

  const entrantIds = new Set<string>();
  for (const match of liveMatches) {
    if (match.homeEntrantId) entrantIds.add(match.homeEntrantId);
    if (match.awayEntrantId) entrantIds.add(match.awayEntrantId);
  }
  const entrantDetails = await new EnrollmentRepository(db).resolveEntrantPodiumDetails(
    Array.from(entrantIds),
  );
  const entrantVisibility = await entrantVisibilityById(db, tournament, [...entrantIds]);
  const descriptor = await new TournamentRepository(db).findDescriptor(
    tournament.disciplineRef.descriptorId,
    tournament.disciplineRef.version,
  );
  const rulesetData = await new TournamentRepository(db).findLatestRuleset(tournament.tournamentId);
  const competition = new CompetitionRepository(db);
  const now = Date.now();
  const detailByMatch = await Promise.all(
    liveMatches.map(async (match) => {
      const [events, resolvedTimerIds, segments, rosters] = await Promise.all([
        competition.listEvents(match.matchId),
        competition.resolvedTimerIds(match.matchId),
        competition.listSegments(match.matchId),
        competition.matchRoster(match.matchId),
      ]);
      const penalties = livePenaltiesOf(
        descriptor,
        events,
        resolvedTimerIds,
        [match.homeEntrantId, match.awayEntrantId],
        now,
      );
      return {
        penalties,
        counters: publicMatchCountersOf({
          descriptor,
          overrides: rulesetData?.overrides,
          finished: false,
          segments,
          events,
          rosters,
          entrantIds: [match.homeEntrantId, match.awayEntrantId],
        }),
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
      ...(ordinalByMatchId.has(m.matchId) ? { stageOrdinal: ordinalByMatchId.get(m.matchId) } : {}),
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
      ...(detailByMatch[index]?.counters === undefined
        ? {}
        : { counters: detailByMatch[index]?.counters }),
      ...(detailByMatch[index]?.clock === undefined ? {} : { clock: detailByMatch[index]?.clock }),
    })),
  };
}
