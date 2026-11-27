import {
  AuditReader,
  IdentityPrincipalRepository,
  InstallationRoleRepository,
  InvariantViolationError,
  isRefusal,
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

  describe('granting the first super-admin', () => {
    const attempt = { actor: 'operator:cli', authorizationContext: 'direct-database' } as const;

    async function grant(email: string) {
      return withTransaction(scratch.db, (uow) =>
        new InstallationRoleRepository(scratch.db).grantFirstSuperAdmin(uow, { email, ...attempt }),
      );
    }

    async function systemAudit() {
      const { records } = await new AuditReader(scratch.db).forOrganization(
        '00000000-0000-0000-0000-000000000000',
        { limit: 50, offset: 0 },
      );
      return records.filter((record) => record.entityType === 'installation-role-assignment');
    }

    it('grants an account that exists, and audits it as the operator who ran it', async () => {
      scratch = await createMigratedDatabase('first-super-admin-1');
      const principalId = await createPrincipal('first@example.test');

      const outcome = await grant('first@example.test');

      expect(outcome.kind).toBe('granted');
      const active = await new InstallationRoleRepository(scratch.db).listActiveSuperAdmins();
      expect(active.map((row) => row.principalId)).toEqual([principalId]);
      const audit = await systemAudit();
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        action: 'installation.super-admin-created',
        actor: 'operator:cli',
        authorizationContext: 'direct-database',
      });
      expect(audit.some(isRefusal)).toBe(false);
    });

    it('finds the account the way sign-in does, whatever the case of the email', async () => {
      scratch = await createMigratedDatabase('first-super-admin-2');
      const principalId = await createPrincipal('Mixed.Case@Example.Test');

      const outcome = await grant('  MIXED.case@example.TEST ');

      expect(outcome.kind).toBe('granted');
      const active = await new InstallationRoleRepository(scratch.db).listActiveSuperAdmins();
      expect(active.map((row) => row.principalId)).toEqual([principalId]);
    });

    it('refuses an email with no account, and leaves nothing behind', async () => {
      scratch = await createMigratedDatabase('first-super-admin-3');

      const outcome = await grant('nobody@example.test');

      expect(outcome).toEqual({ kind: 'refused', reason: 'no-account' });
      expect(await new InstallationRoleRepository(scratch.db).listActiveSuperAdmins()).toEqual([]);
      expect(await systemAudit()).toEqual([]);
    });

    it('refuses while a super-admin is active, and records the attempt as a refusal', async () => {
      scratch = await createMigratedDatabase('first-super-admin-4');
      const current = await createPrincipal('current@example.test');
      await createPrincipal('taker@example.test');
      await grant('current@example.test');

      const outcome = await grant('taker@example.test');

      expect(outcome).toEqual({ kind: 'refused', reason: 'super-admin-exists' });
      const active = await new InstallationRoleRepository(scratch.db).listActiveSuperAdmins();
      expect(active.map((row) => row.principalId)).toEqual([current]);
      const audit = await systemAudit();
      expect(audit).toHaveLength(2);
      const refusal = audit.find(isRefusal);
      expect(refusal).toMatchObject({
        actor: 'operator:cli',
        reason: 'An active super-admin already exists',
      });
    });

    it('grants again when the only super-admin has been deactivated', async () => {
      scratch = await createMigratedDatabase('first-super-admin-5');
      const principalId = await createPrincipal('returning@example.test');
      await grant('returning@example.test');
      // The floor invariant stops this through the API; a database edit is how none is left active.
      await scratch.db
        .updateTable('installation_role_assignments')
        .set({ status: 'inactive' })
        .execute();
      expect(await new InstallationRoleRepository(scratch.db).listActiveSuperAdmins()).toEqual([]);

      const outcome = await grant('returning@example.test');

      expect(outcome.kind).toBe('granted');
      const active = await new InstallationRoleRepository(scratch.db).listActiveSuperAdmins();
      expect(active.map((row) => row.principalId)).toEqual([principalId]);
    });

    it('lets exactly one of two concurrent operators win, the second waiting for the first', async () => {
      scratch = await createMigratedDatabase('first-super-admin-6');
      await createPrincipal('one@example.test');
      await createPrincipal('two@example.test');
      const repo = new InstallationRoleRepository(scratch.db);

      // The first transaction has granted but not committed: it holds the lock, and to every other
      // connection the installation still has no super-admin.
      let firstHasGranted!: () => void;
      const granted = new Promise<void>((resolve) => (firstHasGranted = resolve));
      let commitFirst!: () => void;
      const commit = new Promise<void>((resolve) => (commitFirst = resolve));
      const first = withTransaction(scratch.db, async (uow) => {
        const outcome = await repo.grantFirstSuperAdmin(uow, {
          email: 'one@example.test',
          ...attempt,
        });
        firstHasGranted();
        await commit;
        return outcome;
      });
      await granted;
      const second = grant('two@example.test');
      // Without the lock the second finds none and grants at once; with it, it waits.
      await new Promise((resolve) => setTimeout(resolve, 300));
      commitFirst();

      const outcomes = await Promise.all([first, second]);

      expect(outcomes.map((outcome) => outcome.kind)).toEqual(['granted', 'refused']);
      expect(await repo.listActiveSuperAdmins()).toHaveLength(1);
    });
  });
});
