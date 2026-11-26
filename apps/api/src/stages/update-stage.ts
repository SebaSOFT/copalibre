import type { Kysely } from 'kysely';
import {
  type Database,
  CompetitionRepository,
  TournamentRepository,
  withTransaction,
  InvariantViolationError,
} from '@copalibre/persistence';
import { UpdateStageRequest, StageResponse } from '../dto/organization.dto.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { resolveTournament } from '../controllers/standings.controller.js';
import { findStage, resolveFormat, actorOf, authorizationContextOf } from './context.js';
import { BadRequestException, ConflictException } from '../http/error-contract.js';
import { assertAllocationRequestComplete } from './create-stage.js';
import { validateAllocation, type StageAllocation } from '@copalibre/domain';

export async function update(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  body: UpdateStageRequest,
  request: RequestWithSubject,
): Promise<StageResponse> {
  const { tournament } = await resolveTournament(db, {
    organizationAlias,
    tournamentAlias,
    request,
  });

  const competition = new CompetitionRepository(db);
  const stage = await findStage(competition, tournament.tournamentId, stageNumber);

  let format = stage.format;
  if (body.format !== undefined) {
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
    format = await resolveFormat(db, tournament.tournamentId, descriptor, body.format);
  }

  if (body.allocation !== undefined) {
    assertAllocationRequestComplete(body.allocation);
    const validated = validateAllocation(body.allocation as StageAllocation);
    if (!validated.ok) {
      throw new BadRequestException(validated.error.message, { errorCode: 'stage-bad-request' });
    }
  }

  try {
    return await withTransaction(db, async (uow) => {
      let updated = stage;
      if (body.name !== undefined) {
        updated = await competition.renameStage(uow, {
          stageId: stage.stageId,
          name: body.name,
          organizationId: tournament.organizationId,
          actor: actorOf(request),
          authorizationContext: authorizationContextOf(request),
        });
      }
      if (body.format !== undefined) {
        updated = await competition.changeStageFormat(uow, {
          stageId: stage.stageId,
          format,
          organizationId: tournament.organizationId,
          actor: actorOf(request),
          authorizationContext: authorizationContextOf(request),
        });
      }
      if (body.allocation !== undefined) {
        const tournaments = new TournamentRepository(db);
        const existing = await tournaments.findLatestStageConfiguration(stage.stageId);
        if (existing) {
          await tournaments.updateStageConfiguration(uow, {
            stageId: stage.stageId,
            organizationId: tournament.organizationId,
            changedOverrides: {},
            allocation: body.allocation as StageAllocation,
            actor: actorOf(request),
            authorizationContext: authorizationContextOf(request),
          });
        } else {
          const found = await tournaments.findLatestRuleset(tournament.tournamentId);
          if (!found) {
            throw new BadRequestException(
              'This tournament has no configured ruleset to attach a stage allocation declaration to',
              { errorCode: 'stage-bad-request' },
            );
          }
          await tournaments.createStageConfiguration(uow, {
            stageId: stage.stageId,
            rulesetId: found.rulesetId,
            organizationId: tournament.organizationId,
            overrides: {},
            allocation: body.allocation as StageAllocation,
            actor: actorOf(request),
            authorizationContext: authorizationContextOf(request),
          });
        }
      }
      return {
        stageId: updated.stageId,
        seasonId: updated.seasonId,
        number: updated.number,
        name: updated.name,
        format: updated.format,
        ...(body.allocation === undefined ? {} : { allocation: body.allocation }),
      };
    });
  } catch (error) {
    if (error instanceof InvariantViolationError) {
      throw new ConflictException(error.message, { errorCode: 'stage-conflict' });
    }
    throw error;
  }
}
