import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';
import type { Database } from '../schema.js';

/**
 * Backfills an explicit `resultReason: 'played'` onto every side of every
 * already-recorded result.
 *
 * `matches.result` is a `jsonb` blob, so Postgres never enforces its shape —
 * nothing forces an old row to gain a field a later release started writing.
 * The application now always writes `resultReason` explicitly going forward
 * (never relying on "absent means played"), and this migration brings every
 * existing row in line with that, the same way `0004-roster-terminology`
 * rewrote already-persisted `match_assignments` rows rather than leaving old
 * ones to be read differently from new ones forever.
 */
export const resultReasonBackfill: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    const typedDb = db as unknown as Kysely<Database>;
    await rewriteResults(typedDb, (side) => ({
      ...side,
      resultReason: side.resultReason ?? 'played',
    }));
  },

  async down(db: Kysely<unknown>): Promise<void> {
    const typedDb = db as unknown as Kysely<Database>;
    // Only strips a reason equal to what this migration itself would have
    // written — a real reason recorded after `up` ran (including a fresh
    // `'played'` an operator explicitly chose) is left exactly as it is.
    await rewriteResults(typedDb, (side) => {
      if (side.resultReason !== 'played') return side;
      const rest: Record<string, unknown> = { ...side };
      delete rest.resultReason;
      return rest as StoredSide;
    });
  },
};

interface StoredSide {
  readonly entrantId: string;
  readonly statistics?: Record<string, number>;
  readonly placement?: number;
  readonly resultReason?: string;
  readonly [key: string]: unknown;
}

interface StoredResult {
  readonly sides: readonly StoredSide[];
  readonly [key: string]: unknown;
}

async function rewriteResults(
  db: Kysely<Database>,
  transformSide: (side: StoredSide) => StoredSide,
): Promise<void> {
  const rows = await db
    .selectFrom('matches')
    .select(['match_id', 'result'])
    .where('result', 'is not', null)
    .execute();

  for (const row of rows) {
    const result = row.result as unknown as StoredResult | null;
    if (!result?.sides) continue;

    const sides = result.sides.map(transformSide);
    const changed = sides.some(
      (side, index) => side.resultReason !== result.sides[index]?.resultReason,
    );
    if (!changed) continue;

    await db
      .updateTable('matches')
      .set({ result: JSON.stringify({ ...result, sides }) })
      .where('match_id', '=', row.match_id)
      .execute();
  }
}
