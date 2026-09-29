import {
  newId,
  withTransaction,
  AuditReader,
  OrganizationRepository,
} from '@copalibre/persistence';
import {
  createMigratedDatabase,
  type ScratchDatabase,
} from '../../../packages/persistence/src/test-support/scratch-database.js';
import { repairTournamentStatus } from './doctor-data-repair.js';

const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' } as const;

/**
 * `repairTournamentStatus` against a real, migrated PostgreSQL database:
 * the status column is corrected transactionally and an `audit_log` entry
 * records what changed and why (design.md Decision 3, task 3.2).
 */
describe('repairTournamentStatus (integration)', () => {
  let scratch: ScratchDatabase;
  let organizationId: string;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('doctor-data-repair');
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-repair',
        name: 'Liga Repair',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  it('corrects the status column and writes an audit entry', async () => {
    const tournamentId = newId();
    await scratch.db
      .insertInto('tournaments')
      .values({
        tournament_id: tournamentId,
        organization_id: organizationId,
        alias: `torneo-${tournamentId}`,
        name: 'Torneo a Reparar',
        descriptor_id: newId(),
        descriptor_version: '1.0.0',
        ruleset_id: null,
        status: 'completed',
        started_at: null,
        profile_id: null,
        profile_version: null,
        created_at: new Date(),
      })
      .execute();

    const result = await repairTournamentStatus(
      scratch.db,
      { tournamentId, organizationId, name: 'Torneo a Reparar', status: 'completed' },
      'finished',
    );

    expect(result).toEqual({
      kind: 'tournament-status',
      entityId: tournamentId,
      auditId: expect.any(String),
    });

    const row = await scratch.db
      .selectFrom('tournaments')
      .select('status')
      .where('tournament_id', '=', tournamentId)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('finished');

    const [audit] = await new AuditReader(scratch.db).historyFor('tournament', tournamentId);
    expect(audit).toMatchObject({
      action: 'data-integrity.repaired',
      actor: 'operator:copalibre-doctor',
      authorizationContext: 'doctor-repair',
      previousState: { status: 'completed' },
      resultingState: { status: 'finished' },
    });
    expect(audit?.reason).toContain('completed');
    expect(audit?.reason).toContain('finished');
  });
});
