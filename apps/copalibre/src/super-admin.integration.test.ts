import { IdentityPrincipalRepository, withTransaction } from '@copalibre/persistence';
import {
  createMigratedDatabase,
  type ScratchDatabase,
} from '../../../packages/persistence/src/test-support/scratch-database.js';
import { grantFirstSuperAdmin } from './super-admin.js';

describe('grant-first-super-admin', () => {
  let scratch: ScratchDatabase;

  beforeEach(async () => {
    scratch = await createMigratedDatabase('grant-first-super-admin');
  });

  afterEach(async () => {
    await scratch.drop();
  });

  async function createAccount(email: string): Promise<string> {
    const principal = await withTransaction(scratch.db, (uow) =>
      new IdentityPrincipalRepository(scratch.db).create(uow, { email }),
    );
    return principal.principalId;
  }

  async function activeSuperAdmins(): Promise<readonly string[]> {
    const rows = await scratch.db
      .selectFrom('installation_role_assignments')
      .select('principal_id')
      .where('role', '=', 'super-admin')
      .where('status', '=', 'active')
      .execute();
    return rows.map((row) => row.principal_id);
  }

  it('grants the first super-admin and records it in the audit trail', async () => {
    const principalId = await createAccount('first@example.test');

    const grant = await grantFirstSuperAdmin(scratch.db, 'first@example.test');

    expect(await activeSuperAdmins()).toEqual([principalId]);
    const audit = await scratch.db
      .selectFrom('audit_log')
      .select(['action', 'actor', 'authorization_context', 'entity_id', 'reason'])
      .where('entity_type', '=', 'installation-role-assignment')
      .execute();
    expect(audit).toEqual([
      {
        action: 'installation.super-admin-created',
        actor: 'operator:cli',
        authorization_context: 'direct-database',
        entity_id: grant.assignmentId,
        reason: null,
      },
    ]);
  });

  it('refuses when a super-admin is already active, explains where to go, and records the attempt', async () => {
    const current = await createAccount('current@example.test');
    await createAccount('taker@example.test');
    await grantFirstSuperAdmin(scratch.db, 'current@example.test');

    await expect(grantFirstSuperAdmin(scratch.db, 'taker@example.test')).rejects.toThrow(
      /already has an active super-admin.*platform screen of the control panel.*recorded in the audit trail/s,
    );

    expect(await activeSuperAdmins()).toEqual([current]);
    const refusals = await scratch.db
      .selectFrom('audit_log')
      .select(['actor', 'reason', 'resulting_state'])
      .where('entity_type', '=', 'installation-role-assignment')
      .where('reason', 'is not', null)
      .execute();
    expect(refusals).toEqual([
      {
        actor: 'operator:cli',
        reason: 'An active super-admin already exists',
        resulting_state: null,
      },
    ]);
  });

  it('refuses an email with no account, naming what has to happen first', async () => {
    await expect(grantFirstSuperAdmin(scratch.db, 'nobody@example.test')).rejects.toThrow(
      /no account has the email "nobody@example\.test".*accepts an invitation or signs in once/s,
    );

    expect(await activeSuperAdmins()).toEqual([]);
  });
});
