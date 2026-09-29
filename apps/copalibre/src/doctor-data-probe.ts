import type { Kysely } from 'kysely';
import type { Database } from '@copalibre/persistence';
import { VALID_TOURNAMENT_STATUSES, type DataIntegritySnapshot } from './doctor-data.js';

/** Gathers `doctor-data.ts`'s inputs from the real database — the impure counterpart to `evaluateDataIntegrity`. */
export async function probeDataIntegrity(db: Kysely<Database>): Promise<DataIntegritySnapshot> {
  const rows = await db
    .selectFrom('tournaments')
    .select(['tournament_id', 'organization_id', 'name', 'status'])
    .where('status', 'not in', [...VALID_TOURNAMENT_STATUSES])
    .execute();
  return {
    invalidStatusTournaments: rows.map((row) => ({
      tournamentId: row.tournament_id,
      organizationId: row.organization_id,
      name: row.name,
      status: row.status,
    })),
  };
}
