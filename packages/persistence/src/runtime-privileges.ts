import { sql, type Kysely } from 'kysely';
import { createDatabase, databaseConfigFromEnv } from './database.js';
import type { Database } from './schema.js';

/**
 * What a request-serving process should never be able to do with its database
 * credential: change the schema, create roles or databases, or reach the
 * server's files and programs. Each entry is one plain-English problem; an
 * empty list means the credential has row access only.
 */
export async function runtimePrivilegeProblems(db: Kysely<Database>): Promise<string[]> {
  const result = await sql<{
    role: string;
    superuser: boolean;
    create_role: boolean;
    create_db: boolean;
    server_program: boolean;
    server_read: boolean;
    server_write: boolean;
    create_in_public: boolean;
    owned_in_public: number;
  }>`
    select
      current_user as role,
      r.rolsuper as superuser,
      r.rolcreaterole as create_role,
      r.rolcreatedb as create_db,
      pg_has_role(current_user, 'pg_execute_server_program', 'member') as server_program,
      pg_has_role(current_user, 'pg_read_server_files', 'member') as server_read,
      pg_has_role(current_user, 'pg_write_server_files', 'member') as server_write,
      has_schema_privilege(current_user, 'public', 'CREATE') as create_in_public,
      (
        select count(*)::int
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relowner = r.oid
      ) as owned_in_public
    from pg_roles r
    where r.rolname = current_user
  `.execute(db);

  const row = result.rows[0];
  if (!row) return ['the connected role is not listed in pg_roles'];

  const problems: string[] = [];
  const role = `role "${row.role}"`;
  if (row.superuser) problems.push(`${role} is a superuser`);
  if (row.create_role) problems.push(`${role} can create roles`);
  if (row.create_db) problems.push(`${role} can create databases`);
  if (row.server_program) problems.push(`${role} can run programs on the database server`);
  if (row.server_read) problems.push(`${role} can read files on the database server`);
  if (row.server_write) problems.push(`${role} can write files on the database server`);
  if (row.create_in_public) problems.push(`${role} can create objects in schema public`);
  if (row.owned_in_public > 0) {
    problems.push(`${role} owns ${row.owned_in_public} object(s) in schema public`);
  }
  return problems;
}

export const RUNTIME_PRIVILEGE_WARNING =
  'database credential has more privileges than the runtime needs; see docs/self-hosting.md#database-roles';

/**
 * Logs one warning when this process's credential can do more than read and
 * write rows. It never stops the process: development runs as the superuser on
 * purpose. It never logs the connection string, and a failed check is silent,
 * because startup must not depend on it.
 */
export async function warnWhenRuntimeCredentialIsPrivileged(
  db: Kysely<Database>,
  warn: (message: string) => void,
): Promise<void> {
  try {
    const problems = await runtimePrivilegeProblems(db);
    if (problems.length > 0) warn(`${RUNTIME_PRIVILEGE_WARNING}: ${problems.join('; ')}`);
  } catch {
    // The check is advice; doctor reports the same conditions as a failure.
  }
}

/**
 * The database handle of a request-serving process (api, events, worker,
 * scheduler): `DATABASE_URL`, checked once in the background for privileges it
 * should not have.
 */
export function createRuntimeDatabase(
  warn: (message: string) => void,
  env: NodeJS.ProcessEnv = process.env,
): Kysely<Database> {
  const db = createDatabase(databaseConfigFromEnv(env));
  void warnWhenRuntimeCredentialIsPrivileged(db, warn);
  return db;
}
