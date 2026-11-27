import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool } from 'pg';
import { createDatabase } from './database.js';
import { applyDatabaseRoles } from './database-roles.js';
import { migrateToLatest } from './migrations/index.js';
import { applyRuntimeGrants, RUNTIME_ROLE } from './migrations/runtime-grants.js';
import { OrganizationRepository } from './repositories/organization-repository.js';
import { runtimePrivilegeProblems } from './runtime-privileges.js';
import type { Database } from './schema.js';
import { withTransaction } from './transaction.js';
import {
  createMigratedDatabase,
  createScratchDatabase,
  type ScratchDatabase,
} from './test-support/scratch-database.js';
import { testDialectFromEnv } from './test-support/test-dialect.js';

/**
 * The three database roles of an installation, built the way the Compose
 * install builds them: `deploy/postgres/roles.sql` run by the superuser,
 * migrations run by the owner, and every request-serving process connected as
 * the runtime role. PostgreSQL only: roles and grants are what is under test.
 *
 * Roles belong to the whole server, not to one database, so the suite creates
 * them on the test server and drops them at the end.
 */

const ROLES_SQL = fileURLToPath(new URL('../../../deploy/postgres/roles.sql', import.meta.url));
const OWNER_PASSWORD = 'owner-integration-password';
const APP_PASSWORD = 'app-integration-password';

const describePostgres = testDialectFromEnv() === 'sqlite' ? describe.skip : describe;

async function runRolesScript(db: Kysely<Database>): Promise<void> {
  await applyDatabaseRoles(db, ROLES_SQL, {
    ownerPassword: OWNER_PASSWORD,
    appPassword: APP_PASSWORD,
  });
}

function connectAs(scratch: ScratchDatabase, user: string, password: string): Kysely<Database> {
  const url = new URL(scratch.connectionString);
  url.username = user;
  url.password = password;
  return createDatabase({ connectionString: url.toString(), maxConnections: 2 });
}

/** Owner and grants of every table and sequence in public, as a comparable snapshot. */
async function privilegeSnapshot(db: Kysely<Database>): Promise<string[]> {
  const result = await sql<{ entry: string }>`
    select c.relname || ' ' || pg_get_userbyid(c.relowner) || ' ' || coalesce(c.relacl::text, '') as entry
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'S', 'v')
    order by c.relname
  `.execute(db);
  return result.rows.map((row) => row.entry);
}

async function objectsNotOwnedByOwner(db: Kysely<Database>): Promise<string[]> {
  const result = await sql<{ name: string }>`
    select c.relname as name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and pg_get_userbyid(c.relowner) <> 'copalibre_owner'
    order by c.relname
  `.execute(db);
  return result.rows.map((row) => row.name);
}

async function dropRoles(): Promise<void> {
  const admin = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: process.env.DATABASE_URL, max: 1 }),
    }),
  });
  for (const role of ['copalibre_app', 'copalibre_owner']) {
    // Fails harmlessly when the role still holds rights in some other database.
    await sql
      .raw(`drop role if exists ${role}`)
      .execute(admin)
      .catch(() => undefined);
  }
  await admin.destroy();
}

describePostgres('database roles: a fresh installation', () => {
  let scratch: ScratchDatabase;
  let owner: Kysely<Database>;
  let app: Kysely<Database>;

  beforeAll(async () => {
    scratch = await createScratchDatabase('runtime-roles-fresh');
    await runRolesScript(scratch.db);
    owner = connectAs(scratch, 'copalibre_owner', OWNER_PASSWORD);
    const { error } = await migrateToLatest(owner);
    if (error) throw error;
    await applyRuntimeGrants(owner);
    app = connectAs(scratch, RUNTIME_ROLE, APP_PASSWORD);
  });

  afterAll(async () => {
    await app?.destroy();
    await owner?.destroy();
    await scratch?.drop();
    await dropRoles();
  });

  it('lets the runtime role write through a repository, audit row included', async () => {
    const created = await withTransaction(app, (uow) =>
      new OrganizationRepository(app).create(uow, {
        alias: 'liga-roles',
        name: 'Liga Roles',
        actor: 'user:integration',
        authorizationContext: 'integration',
      }),
    );
    const audit = await app
      .selectFrom('audit_log')
      .select('action')
      .where('entity_id', '=', created.organizationId)
      .execute();
    expect(audit.length).toBeGreaterThan(0);
  });

  it.each([
    ['create a table', 'create table intruder (id int)'],
    ['alter a table', 'alter table organizations add column intruder int'],
    ['drop a table', 'drop table organizations'],
    ['truncate a table', 'truncate organizations cascade'],
    ['run a program on the server', "copy (select 1) to program 'true'"],
    ['change the audit trail', "update audit_log set action = 'forged'"],
    ['erase the audit trail', 'delete from audit_log'],
    ['write the migration bookkeeping', "delete from kysely_migration where name like '0046%'"],
    ['create a schema', 'create schema intruder'],
    ['create a temporary table', 'create temporary table intruder (id int)'],
  ])('refuses the runtime role to %s', async (_label, statement) => {
    await expect(sql.raw(statement).execute(app)).rejects.toThrow(
      /permission denied|must be owner|must be superuser|pg_execute_server_program/i,
    );
  });

  it('reads the schema version, which readiness needs', async () => {
    const version = await app.selectFrom('schema_version').select('version').execute();
    expect(version.length).toBeGreaterThan(0);
  });

  it('finds no problem with the runtime role, and names the others', async () => {
    expect(await runtimePrivilegeProblems(app)).toEqual([]);
    expect(await runtimePrivilegeProblems(owner)).toEqual(
      expect.arrayContaining([expect.stringMatching(/can create objects in schema public/)]),
    );
    expect(await runtimePrivilegeProblems(scratch.db)).toEqual(
      expect.arrayContaining([expect.stringMatching(/is a superuser/)]),
    );
  });

  it('gives a revoked grant back on the next migrate run', async () => {
    await sql`revoke all on table organizations from copalibre_app`.execute(owner);
    await expect(app.selectFrom('organizations').select('alias').execute()).rejects.toThrow(
      /permission denied/,
    );
    await applyRuntimeGrants(owner);
    await expect(app.selectFrom('organizations').select('alias').execute()).resolves.toEqual(
      expect.any(Array),
    );
  });

  it('changes nothing when the script and the grants run again', async () => {
    const before = await privilegeSnapshot(scratch.db);
    await runRolesScript(scratch.db);
    await applyRuntimeGrants(owner);
    expect(await privilegeSnapshot(scratch.db)).toEqual(before);
  });
});

describePostgres('database roles: an installation that ran as the superuser', () => {
  let scratch: ScratchDatabase;
  let owner: Kysely<Database>;

  beforeAll(async () => {
    // Migrated as the superuser, as every Compose install was before the roles.
    scratch = await createMigratedDatabase('runtime-roles-existing');
    await runRolesScript(scratch.db);
    owner = connectAs(scratch, 'copalibre_owner', OWNER_PASSWORD);
  });

  afterAll(async () => {
    await owner?.destroy();
    await scratch?.drop();
    await dropRoles();
  });

  it('moves every object in public to the owner', async () => {
    expect(await objectsNotOwnedByOwner(scratch.db)).toEqual([]);
  });

  it('lets the owner migrate and grant afterwards', async () => {
    const { error } = await migrateToLatest(owner);
    expect(error).toBeUndefined();
    expect(await applyRuntimeGrants(owner)).toBe(true);
  });
});
