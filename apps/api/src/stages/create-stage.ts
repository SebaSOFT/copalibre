import type { Kysely } from 'kysely';
import {
  type Database,
  TournamentRepository,
  CompetitionRepository,
  withTransaction,
  CompetitionRecordRepository,
  InvariantViolationError,
} from '@copalibre/persistence';
import { CreateStageRequest, StageResponse } from '../dto/organization.dto.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { resolveTournament } from '../controllers/standings.controller.js';
import { BadRequestException, ConflictException } from '../http/error-contract.js';
import { resolveFormat, actorOf, authorizationContextOf } from './context.js';
import {
  validateAllocation,
  type StageAllocation,
  validateStageGroupConfiguration,
  type StageGroupConfiguration,
  type TournamentRuleset,
  isPlacementFormat,
  validateSeriesDeclaration,
  compileEffectiveRuleset,
} from '@copalibre/domain';

export async function create(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  body: CreateStageRequest,
  request: RequestWithSubject,
): Promise<StageResponse> {
  const { organizationId, tournament } = await resolveTournament(db, {
    organizationAlias,
    tournamentAlias,
    request,
  });

  const tournaments = new TournamentRepository(db);
  const descriptor = await tournaments.findDescriptor(
    tournament.disciplineRef.descriptorId,
    tournament.disciplineRef.version,
  );
  if (!descriptor) {
    throw new BadRequestException(
      `Discipline ${tournament.disciplineRef.descriptorId}@${tournament.disciplineRef.version} is not installed`,
      { errorCode: 'stage-bad-request' },
    );
  }

  const format = await resolveFormat(db, tournament.tournamentId, descriptor, body.format);

  if (body.allocation !== undefined) {
    assertAllocationRequestComplete(body.allocation);
    const validated = validateAllocation(body.allocation as StageAllocation);
    if (!validated.ok) {
      throw new BadRequestException(validated.error.message, { errorCode: 'stage-bad-request' });
    }
  }
  if (body.groupConfiguration == null && body.groupConfiguration !== undefined) {
    throw new BadRequestException('Group configuration cannot be null', {
      errorCode: 'stage-bad-request',
    });
  }
  if (body.groupConfiguration !== undefined) {
    const groupError = validateStageGroupConfiguration(
      body.groupConfiguration as StageGroupConfiguration,
    );
    if (groupError) throw new BadRequestException(groupError, { errorCode: 'stage-bad-request' });
  }

  let ruleset: TournamentRuleset | undefined;
  if (body.series !== undefined) {
    // A placement format produces an ordering, not two sides that could
    // contest a series — refused here, before anything is stored, rather
    // than only surfacing later at fixture-generation time.
    if (isPlacementFormat(format)) {
      throw new BadRequestException(
        `Stage format "${format}" produces an ordering rather than two sides, so it cannot declare a series`,
        { errorCode: 'stage-bad-request' },
      );
    }
    const validated = validateSeriesDeclaration(body.series);
    if (!validated.ok) {
      throw new BadRequestException(validated.error.message, { errorCode: 'stage-bad-request' });
    }
  }

  if (
    body.series !== undefined ||
    body.allocation !== undefined ||
    body.groupConfiguration !== undefined
  ) {
    const found = await new TournamentRepository(db).findLatestRuleset(tournament.tournamentId);
    if (!found) {
      throw new BadRequestException(
        'This tournament has no configured ruleset to attach a stage series or allocation declaration to',
        { errorCode: 'stage-bad-request' },
      );
    }
    ruleset = found;
  }

  const competition = new CompetitionRepository(db);
  const existingStages = await competition.listStagesOfTournament(tournament.tournamentId);
  const number = body.number ?? existingStages.length + 1;
  if (existingStages.some((stage) => stage.number === number)) {
    throw new ConflictException(`Stage ${number} already exists in "${tournamentAlias}"`, {
      errorCode: 'stage-conflict',
    });
  }
  const name = body.name ?? `Stage ${number}`;

  try {
    const stage = await withTransaction(db, async (uow) => {
      const created = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number,
        name,
        format,
        organizationId,
        actor: actorOf(request),
        authorizationContext: authorizationContextOf(request),
      });

      if (ruleset !== undefined) {
        const stageConfiguration = await tournaments.createStageConfiguration(uow, {
          stageId: created.stageId,
          rulesetId: ruleset.rulesetId,
          organizationId,
          overrides:
            body.series === undefined
              ? {}
              : {
                  'series.span': body.series.span,
                  ...(body.series.resolutionClass === undefined
                    ? {}
                    : { 'series.resolutionClass': body.series.resolutionClass }),
                  ...(body.series.neutralGround === undefined
                    ? {}
                    : { 'series.neutralGround': body.series.neutralGround }),
                  ...(body.series.standingsAccounting === undefined
                    ? {}
                    : { 'series.standingsAccounting': body.series.standingsAccounting }),
                },
          ...(body.allocation === undefined
            ? {}
            : { allocation: body.allocation as StageAllocation }),
          ...(body.groupConfiguration === undefined
            ? {}
            : { groupConfiguration: body.groupConfiguration as StageGroupConfiguration }),
          actor: actorOf(request),
          authorizationContext: authorizationContextOf(request),
        });

        const compiledStage = compileEffectiveRuleset(descriptor, ruleset, stageConfiguration);
        if (compiledStage.ok) {
          await new CompetitionRecordRepository(db).saveCompiledRuleset(uow, {
            tournamentId: tournament.tournamentId,
            stageId: created.stageId,
            ruleset: compiledStage.value,
            organizationId,
            actor: actorOf(request),
            authorizationContext: authorizationContextOf(request),
          });
        }
      }

      return created;
    });
    return {
      stageId: stage.stageId,
      seasonId: stage.seasonId,
      number: stage.number,
      name: stage.name,
      format: stage.format,
      ...(body.series === undefined ? {} : { series: body.series }),
      ...(body.allocation === undefined ? {} : { allocation: body.allocation }),
    };
  } catch (error) {
    if (error instanceof InvariantViolationError)
      throw new ConflictException(error.message, { errorCode: 'stage-conflict' });
    throw error;
  }
}

/**
 * `StageAllocationRequest.attributeKey`/`direction` are optional on the DTO (only `manual` and
 * `automatic` need neither), so a weighted declaration missing either would reach domain
 * `validateAllocation` with `attributeKey` `undefined` and throw a raw `TypeError` instead of the
 * intended 400 — this closes that structural gap before the domain check runs.
 */
export function assertAllocationRequestComplete(allocation: {
  readonly mode: string;
  readonly attributeKey?: string;
  readonly direction?: string;
}): void {
  if (
    allocation.mode === 'weighted' &&
    (allocation.attributeKey === undefined || allocation.direction === undefined)
  ) {
    throw new BadRequestException(
      'Weighted allocation requires both an attribute key and a direction',
      { errorCode: 'stage-bad-request' },
    );
  }
}
