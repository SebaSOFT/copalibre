import type { Kysely } from 'kysely';
import {
  type Database,
  CompetitionRepository,
  StageReadModel,
  withTransaction,
} from '@copalibre/persistence';
import { NextRoundRequest } from '../dto/organization.dto.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { StageFixturesResponse } from '../dto/schedule.dto.js';
import { resolveTournament } from '../controllers/standings.controller.js';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '../http/error-contract.js';
import { chooseRoundZone, inZone, isDynamicRoundFormat } from '../controllers/stage-rounds.js';
import { effectiveFormat } from '@copalibre/domain';
import { fixtures as fixturesRoute } from './fixtures.js';
import { readStageSeries } from '../controllers/stage-series.js';
import {
  type GeneratedMatch,
  generateNextSwissRoundFixtures,
  isDuelMatch,
} from '@copalibre/tournament-engine';
import { actorOf, authorizationContextOf } from './context.js';

export async function nextRound(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  body: NextRoundRequest,
  request: RequestWithSubject,
): Promise<StageFixturesResponse> {
  const { tournament, organizationId } = await resolveTournament(db, {
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

  // Rounds, pairings and results are per zone, so the zone the caller targets decides the format
  // and every set read below. A stage with no zone yet is read as a whole, as it always was.
  const zones = await competition.listZonesOfStage(stage.stageId);
  const choice = chooseRoundZone(zones, stage, body?.zoneNumber);
  if (choice.kind === 'unknown') {
    throw new NotFoundException(`No zone ${choice.requested} in stage ${stageNumber}`, {
      errorCode: 'zone-not-found',
    });
  }
  if (choice.kind === 'required') {
    throw new BadRequestException(
      choice.eligible.length === 0
        ? `Stage ${stageNumber} has several zones and none plays a format with dynamic rounds`
        : `Stage ${stageNumber} has several zones: name one in zoneNumber (zones that can advance: ${choice.eligible.join(', ')})`,
      { errorCode: 'stage-zone-required' },
    );
  }
  const zone = choice.kind === 'zone' ? choice.zone : undefined;
  const format = zone === undefined ? stage.format : effectiveFormat(zone, stage);
  const fixtures = inZone(await competition.listFixturesOfStage(stage.stageId), zone);
  if (fixtures.length > 0) {
    const nodes = await db
      .selectFrom('fixtures')
      .select('node_key')
      .where(
        'fixture_id',
        'in',
        fixtures.map((fixture) => fixture.fixtureId),
      )
      .execute();
    if (nodes.every((node) => node.node_key !== null)) {
      throw new ConflictException('Later rounds already exist in the persisted fixture graph', {
        errorCode: 'stage-graph-persisted',
      });
    }
  }
  if (!isDynamicRoundFormat(format)) {
    // Refused for the zone asked about; a sibling playing a dynamic format is unaffected.
    throw new ConflictException(
      zones.length > 1 && zone !== undefined
        ? `Zone ${zone.number} plays ${format}, which does not support dynamic round generation`
        : 'Only Swiss and single-elimination stages support dynamic round generation',
      { errorCode: zones.length > 1 ? 'zone-not-dynamic' : 'stage-not-swiss' },
    );
  }

  if (fixtures.length === 0) {
    throw new ConflictException('Stage has no initial fixtures generated', {
      errorCode: 'stage-no-fixtures',
    });
  }

  const zoneFixtureIds = new Set(fixtures.map((f) => f.fixtureId));
  const matches = (await competition.listMatchesForStage(stage.stageId)).filter((m) =>
    zoneFixtureIds.has(m.fixtureId),
  );
  const currentRound = Math.max(...fixtures.map((f) => f.round));
  const currentRoundFixtures = fixtures
    .filter((f) => f.round === currentRound)
    .sort((a, b) => a.fixtureId.localeCompare(b.fixtureId));
  const currentRoundFixtureIds = new Set(currentRoundFixtures.map((f) => f.fixtureId));
  const currentRoundMatches = matches.filter((m) => currentRoundFixtureIds.has(m.fixtureId));

  if (format === 'single-elimination' && currentRoundFixtures.length <= 1) {
    throw new ConflictException('The single-elimination stage is already fully completed', {
      errorCode: 'stage-already-completed',
    });
  }

  const uncompleted = currentRoundMatches.filter(
    (m) => m.status !== 'finalized' && m.status !== 'forfeited',
  );
  if (uncompleted.length > 0) {
    throw new ConflictException(
      `Round ${currentRound} has ${uncompleted.length} match(es) that are not completed`,
      { errorCode: 'stage-round-incomplete' },
    );
  }

  const readModel = new StageReadModel(db);
  const stageRecord = await readModel.stageRecord(stage.stageId, undefined, zone?.zoneId);
  const entrantIds = stageRecord?.entrantIds ?? [];
  if (entrantIds.length < 2) {
    throw new ConflictException('Stage has fewer than 2 entrants', {
      errorCode: 'stage-insufficient-entrants',
    });
  }

  const outcomes = await readModel.outcomes(stage.stageId, undefined, zone?.zoneId);
  const nextRoundNumber = currentRound + 1;
  const declaration = await readStageSeries(db, {
    tournamentId: tournament.tournamentId,
    stageId: stage.stageId,
    zoneId: fixtures[0]?.zoneId,
  });
  const seriesSpan = declaration === undefined ? {} : { matchCount: declaration.span };

  let newFixtures: readonly {
    readonly round: number;
    readonly homeEntrantId?: string;
    readonly awayEntrantId?: string;
    readonly zoneId?: string;
    readonly groupId?: string;
  }[];

  if (format === 'single-elimination') {
    const winners: string[] = [];
    for (const f of currentRoundFixtures) {
      const fixtureMatches = currentRoundMatches.filter((m) => m.fixtureId === f.fixtureId);
      const outcome = outcomes.find((o) => o.fixtureId === f.fixtureId);
      let winnerEntrantId = outcome?.winnerEntrantId;
      if (!winnerEntrantId) {
        for (const m of fixtureMatches) {
          const res = m.result as {
            winnerEntrantId?: string;
            winner?: 'A' | 'B';
          } | null;
          if (res?.winnerEntrantId) {
            winnerEntrantId = res.winnerEntrantId;
            break;
          }
          if (res?.winner === 'A') {
            winnerEntrantId = f.homeEntrantId ?? undefined;
            break;
          }
          if (res?.winner === 'B') {
            winnerEntrantId = f.awayEntrantId ?? undefined;
            break;
          }
        }
      }
      if (!winnerEntrantId) {
        throw new ConflictException(`Fixture in round ${currentRound} has no determined winner`, {
          errorCode: 'fixture-winner-undetermined',
        });
      }
      winners.push(winnerEntrantId);
    }

    const paired: {
      round: number;
      homeEntrantId?: string;
      awayEntrantId?: string;
      zoneId?: string;
      groupId?: string;
    }[] = [];
    for (let i = 0; i < winners.length; i += 2) {
      paired.push({
        round: nextRoundNumber,
        homeEntrantId: winners[i],
        awayEntrantId: winners[i + 1],
        zoneId: currentRoundFixtures[0]?.zoneId,
        groupId: currentRoundFixtures[0]?.groupId,
      });
    }
    newFixtures = paired;
  } else {
    const previousMatches: GeneratedMatch[] = fixtures.map((f, idx) => ({
      id: `SWISS-R${f.round}-M${idx + 1}`,
      shape: 'duel' as const,
      bracket: 'winners' as const,
      round: f.round,
      position: idx + 1,
      slotA: f.homeEntrantId
        ? {
            kind: 'entrant' as const,
            entrantId: f.homeEntrantId,
            seed: entrantIds.indexOf(f.homeEntrantId) + 1,
          }
        : { kind: 'bye' as const },
      slotB: f.awayEntrantId
        ? {
            kind: 'entrant' as const,
            entrantId: f.awayEntrantId,
            seed: entrantIds.indexOf(f.awayEntrantId) + 1,
          }
        : { kind: 'bye' as const },
    }));

    const seededEntrants = entrantIds.map((entrantId, index) => ({
      entrantId,
      seed: index + 1,
    }));

    const nextMatches = generateNextSwissRoundFixtures({
      round: nextRoundNumber,
      entrants: seededEntrants,
      previousMatches,
      outcomes,
      options: declaration ? { series: declaration } : undefined,
    });

    newFixtures = nextMatches
      .filter((m) => isDuelMatch(m) && (m.matchNumber === undefined || m.matchNumber === 1))
      .map((m) => {
        if (!isDuelMatch(m)) return undefined;
        return {
          round: nextRoundNumber,
          homeEntrantId: m.slotA.kind === 'entrant' ? m.slotA.entrantId : undefined,
          awayEntrantId: m.slotB.kind === 'entrant' ? m.slotB.entrantId : undefined,
          zoneId: fixtures[0]?.zoneId,
          groupId: fixtures[0]?.groupId,
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== undefined);
  }

  await withTransaction(db, (uow) =>
    competition.createFixtures(uow, {
      stageId: stage.stageId,
      fixtures: newFixtures,
      ...seriesSpan,
      organizationId,
      actor: actorOf(request),
      authorizationContext: authorizationContextOf(request),
    }),
  );

  return fixturesRoute(db, organizationAlias, tournamentAlias, stageNumber, request);
}
