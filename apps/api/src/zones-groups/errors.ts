import { InvariantViolationError } from '@copalibre/persistence';
import { ConflictException, BadRequestException } from '../http/error-contract.js';
import { QualificationError } from '@copalibre/tournament-engine';

export function throwConflict(error: unknown): never {
  if (error instanceof InvariantViolationError)
    throw new ConflictException(error.message, { errorCode: 'zone-group-conflict' });
  throw error;
}

export function throwPromotionPlanError(error: unknown): never {
  if (error instanceof QualificationError)
    throw new BadRequestException(error.message, { errorCode: 'zone-group-bad-request' });
  throwConflict(error);
}
