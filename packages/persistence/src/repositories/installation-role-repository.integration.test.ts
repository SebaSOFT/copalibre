import {
  IdentityPrincipalRepository,
  InstallationRoleRepository,
  InvariantViolationError,
  withTransaction,
} from '../index.js';
import { createMigratedDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';

/**
 * `installation_role_assignments` has no organization scoping — it is
 * genuinely installation-wide — so each test gets its own scratch database
 * rather than sharing one across the suite: a super-admin row left active by
 * an earlier test would otherwise make a later "last active super-admin"
 * floor-invariant check pass for the wrong reason.
 */
describe('installation role repository (integration)', () => {
  let scratch: ScratchDatabase;

  afterEach(async () => scratch.drop());

  async function createPrincipal(email: string): Promise<string> {
    const principal = await withTransaction(scratch.db, (uow) =>
      new IdentityPrincipalRepository(scratch.db).create(uow, { email }),
    );
    return principal.principalId;
  }

  it('grants and lists an active super-admin', async () => {
    scratch = await createMigratedDatabase('installation-role-1');
    const repo = new InstallationRoleRepository(scratch.db);
    const principalId = await createPrincipal('super1@example.test');

    const assignment = await withTransaction(scratch.db, (uow) =>
      repo.createSuperAdmin(uow, {
        principalId,
        actor: 'user:seed',
        authorizationContext: 'copalibre.super-admin',
      }),
    );

    expect(assignment.role).toBe('super-admin');
    expect(assignment.status).toBe('active');

    const listed = await repo.listActiveSuperAdmins();
    expect(listed.map((row) => row.principalId)).toContain(principalId);
    expect(await repo.findActiveByPrincipal(principalId)).toBeDefined();
  });

  it('refuses to deactivate the last active super-admin', async () => {
    scratch = await createMigratedDatabase('installation-role-2');
    const repo = new InstallationRoleRepository(scratch.db);
    const principalId = await createPrincipal('super2@example.test');
    const assignment = await withTransaction(scratch.db, (uow) =>
      repo.createSuperAdmin(uow, {
        principalId,
        actor: 'user:seed',
        authorizationContext: 'copalibre.super-admin',
      }),
    );

    await expect(
      withTransaction(scratch.db, (uow) =>
        repo.changeStatus(uow, {
          assignmentId: assignment.assignmentId,
          status: 'inactive',
          actor: 'user:seed',
          authorizationContext: 'copalibre.super-admin',
        }),
      ),
    ).rejects.toThrow(InvariantViolationError);
  });

  it('allows deactivating one of two active super-admins, then refuses the last one', async () => {
    scratch = await createMigratedDatabase('installation-role-3');
    const repo = new InstallationRoleRepository(scratch.db);
    const principalA = await createPrincipal('super3a@example.test');
    const principalB = await createPrincipal('super3b@example.test');
    const assignmentA = await withTransaction(scratch.db, (uow) =>
      repo.createSuperAdmin(uow, {
        principalId: principalA,
        actor: 'user:seed',
        authorizationContext: 'copalibre.super-admin',
      }),
    );
    const assignmentB = await withTransaction(scratch.db, (uow) =>
      repo.createSuperAdmin(uow, {
        principalId: principalB,
        actor: 'user:seed',
        authorizationContext: 'copalibre.super-admin',
      }),
    );

    const deactivated = await withTransaction(scratch.db, (uow) =>
      repo.changeStatus(uow, {
        assignmentId: assignmentA.assignmentId,
        status: 'inactive',
        actor: 'user:seed',
        authorizationContext: 'copalibre.super-admin',
      }),
    );
    expect(deactivated.status).toBe('inactive');

    await expect(
      withTransaction(scratch.db, (uow) =>
        repo.deleteAssignment(uow, {
          assignmentId: assignmentB.assignmentId,
          actor: 'user:seed',
          authorizationContext: 'copalibre.super-admin',
        }),
      ),
    ).rejects.toThrow(InvariantViolationError);
  });
});
