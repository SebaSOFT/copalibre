import { lockRowsForMutation, type Database, type UnitOfWork } from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { ConflictException } from './http/error-contract.js';

/** A persisted placeholder can be scheduled, but cannot record play before both entrants resolve. */
export async function assertSidesDecided(
  db: Kysely<Database>,
  uow: UnitOfWork,
  matchId: string,
): Promise<void> {
  // Serialize starts and event/result writes with the resolver's fixture locks.
  const fixture = await lockRowsForMutation(
    db,
    uow.tx
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select([
        'fixtures.node_key',
        'fixtures.home_entrant_id',
        'fixtures.away_entrant_id',
        'fixtures.home_source',
        'fixtures.away_source',
      ])
      .where('matches.match_id', '=', matchId),
  ).executeTakeFirstOrThrow();
  if (fixture.node_key === null) return;
  const undecidedSides = (
    [
      ['home', fixture.home_entrant_id, fixture.home_source],
      ['away', fixture.away_entrant_id, fixture.away_source],
    ] as const
  ).flatMap(([side, entrantId, source]) =>
    entrantId === null
      ? [
          {
            side,
            source: typeof source === 'string' ? (JSON.parse(source) as unknown) : source,
          },
        ]
      : [],
  );
  if (undecidedSides.length > 0)
    throw new ConflictException(
      {
        message: 'Match sides are still undecided',
        matchId,
        undecidedSides,
      },
      { errorCode: 'match-side-undecided' },
    );
}
