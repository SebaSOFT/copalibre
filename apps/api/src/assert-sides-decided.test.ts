import type { Kysely } from 'kysely';
import { vi } from 'vitest';
import type { Database, UnitOfWork } from '@copalibre/persistence';
import { assertSidesDecided } from './assert-sides-decided.js';

function unitOfWork(fixture: Record<string, unknown>): UnitOfWork {
  const query = {
    forUpdate: vi.fn(),
    innerJoin: vi.fn(),
    select: vi.fn(),
    where: vi.fn(),
    executeTakeFirstOrThrow: vi.fn().mockResolvedValue(fixture),
  };
  query.forUpdate.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.where.mockReturnValue(query);
  return { tx: { selectFrom: () => query } } as unknown as UnitOfWork;
}

describe('assertSidesDecided', () => {
  it.each([null, 'WB-R1-M1'])('accepts decided entrants for node %s', async (node_key) => {
    await expect(
      assertSidesDecided(
        {} as Kysely<Database>,
        unitOfWork({ node_key, home_entrant_id: 'home', away_entrant_id: 'away' }),
        'match',
      ),
    ).resolves.toBeUndefined();
  });
  it('preserves legacy missing-side behavior', async () => {
    await expect(
      assertSidesDecided(
        {} as Kysely<Database>,
        unitOfWork({ node_key: null, home_entrant_id: null, away_entrant_id: null }),
        'match',
      ),
    ).resolves.toBeUndefined();
  });
  it.each([false, true])(
    'names only the undecided side with parsed source (JSON text: %s)',
    async (text) => {
      const source = { kind: 'winner-of', matchId: 'WB-R1-M1' };
      await expect(
        assertSidesDecided(
          {} as Kysely<Database>,
          unitOfWork({
            node_key: 'WB-R2-M1',
            home_entrant_id: 'home',
            away_entrant_id: null,
            away_source: text ? JSON.stringify(source) : source,
          }),
          'match',
        ),
      ).rejects.toMatchObject({
        response: { matchId: 'match', undecidedSides: [{ side: 'away', source }] },
      });
    },
  );
});
