import type { Kysely } from 'kysely';
import {
  type Database,
  CompetitionRepository,
  withTransaction,
  InvariantViolationError,
} from '@copalibre/persistence';
import { DeleteStageRequest, StageDeletionResponse } from '../dto/organization.dto.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { BadRequestException, ConflictException } from '../http/error-contract.js';
import { resolveTournament } from '../controllers/standings.controller.js';
import { findStage, actorOf, authorizationContextOf } from './context.js';

export async function remove(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  dryRun: string | undefined,
  body: DeleteStageRequest,
  request: RequestWithSubject,
): Promise<StageDeletionResponse> {
  if (dryRun !== undefined && dryRun !== 'true' && dryRun !== 'false') {
    throw new BadRequestException('dryRun must be true or false', {
      errorCode: 'bad-request',
    });
  }
  const { tournament } = await resolveTournament(db, {
    organizationAlias,
    tournamentAlias,
    request,
  });

  const competition = new CompetitionRepository(db);
  const stage = await findStage(competition, tournament.tournamentId, stageNumber);
  if (dryRun === 'true') {
    return {
      ...(await competition.previewDeleteStage(stage.stageId)),
      dryRun: true,
      success: false,
    };
  }

  try {
    const deleted = await withTransaction(db, (uow) =>
      competition.deleteStage(uow, {
        stageId: stage.stageId,
        confirmationName: body.confirmationName ?? '',
        organizationId: tournament.organizationId,
        actor: actorOf(request),
        authorizationContext: authorizationContextOf(request),
      }),
    );
    return {
      ...deleted.consequences,
      dryRun: false,
      success: true,
    };
  } catch (error) {
    if (error instanceof InvariantViolationError) {
      throw new ConflictException(error.message, { errorCode: 'stage-conflict' });
    }
    throw error;
  }
}
