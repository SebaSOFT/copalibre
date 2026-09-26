import { newId, withTransaction, OrganizationRepository } from '@copalibre/persistence';
import {
  createMigratedDatabase,
  type ScratchDatabase,
} from '../../../packages/persistence/src/test-support/scratch-database.js';
import { probeDataIntegrity } from './doctor-data-probe.js';

const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;

/**
 * `probeDataIntegrity` against a real, migrated PostgreSQL database — the
 * only place `evaluateDataIntegrity`'s pure logic meets real Kysely typing
 * and a real `status not in (...)` query (openspec 0296, task 3.1).
 */
describe('probeDataIntegrity (integration)', () => {
  let scratch: ScratchDatabase;
  let organizationId: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('doctor-data');
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-doctor',
        name: 'Liga Doctor',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  async function insertTournament(status: string, name: string): Promise<string> {
    const tournamentId = newId();
    await scratch.db
      .insertInto('tournaments')
      .values({
        tournament_id: tournamentId,
        organization_id: organizationId,
        alias: `torneo-${tournamentId}`,
        name,
        descriptor_id: newId(),
        descriptor_version: '1.0.0',
        ruleset_id: null,
        status,
        started_at: null,
        profile_id: null,
        profile_version: null,
        created_at: new Date(),
      })
      .execute();
    return tournamentId;
  }

  it('reports no anomaly when every tournament holds a canonical status', async () => {
    await insertTournament('draft', 'Torneo Limpio');
    const snapshot = await probeDataIntegrity(scratch.db);
    expect(snapshot.invalidStatusTournaments.some((t) => t.name === 'Torneo Limpio')).toBe(false);
  });

  it('finds a tournament with a legacy non-canonical status', async () => {
    const tournamentId = await insertTournament('completed', 'Torneo Legado');
    const snapshot = await probeDataIntegrity(scratch.db);
    expect(snapshot.invalidStatusTournaments).toContainEqual({
      tournamentId,
      organizationId,
      name: 'Torneo Legado',
      status: 'completed',
    });
  });
});
