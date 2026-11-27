import type { Match } from '@copalibre/domain';
import type { Kysely, Transaction } from 'kysely';
import { InvariantViolationError } from '../../errors.js';
import { toMatch } from '../../mapping.js';
import type { Database } from '../../schema.js';
import type { UnitOfWork } from '../../transaction.js';

/** Public: also guards `TournamentRepository.updateStageConfiguration`, one layer over. */
export async function assertStageHasNoFixtures(uow: UnitOfWork, stageId: string): Promise<void> {
  const fixture = await uow.tx
    .selectFrom('fixtures')
    .select('fixture_id')
    .where('stage_id', '=', stageId)
    .executeTakeFirst();
  if (fixture) {
    throw new InvariantViolationError(
      'Cannot change this stage — its zones, groups, format or removal — after fixtures already exist',
      { stageId },
    );
  }
}

export async function findMatchIn(
  executor: Kysely<Database> | Transaction<Database>,
  matchId: string,
): Promise<Match | undefined> {
  const row = await executor
    .selectFrom('matches')
    .selectAll()
    .where('match_id', '=', matchId)
    .executeTakeFirst();
  return row ? toMatch(row) : undefined;
}
