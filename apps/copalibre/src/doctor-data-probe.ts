import type { Kysely } from 'kysely';
import { RESERVED_ORGANIZATION_ALIASES } from '@copalibre/domain';
import type { Database } from '@copalibre/persistence';
import { VALID_TOURNAMENT_STATUSES, type DataIntegritySnapshot } from './doctor-data.js';

/** Gathers `doctor-data.ts`'s inputs from the real database — the impure counterpart to `evaluateDataIntegrity`. */
export async function probeDataIntegrity(db: Kysely<Database>): Promise<DataIntegritySnapshot> {
  const rows = await db
    .selectFrom('tournaments')
    .select(['tournament_id', 'organization_id', 'name', 'status'])
    .where('status', 'not in', [...VALID_TOURNAMENT_STATUSES])
    .execute();
  const reserved = await db
    .selectFrom('organizations')
    .select(['organization_id', 'alias', 'name'])
    .where('alias', 'in', Object.values(RESERVED_ORGANIZATION_ALIASES).flat())
    .orderBy('alias')
    .execute();
  return {
    reservedAliasOrganizations: reserved.map((row) => ({
      organizationId: row.organization_id,
      alias: row.alias,
      name: row.name,
    })),
    invalidStatusTournaments: rows.map((row) => ({
      tournamentId: row.tournament_id,
      organizationId: row.organization_id,
      name: row.name,
      status: row.status,
    })),
  };
}
