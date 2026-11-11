import { sql, type Kysely } from 'kysely';
import type { Database } from '../schema.js';

/** The role every request-serving process connects as in an installation. */
export const RUNTIME_ROLE = 'copalibre_app';

/** Tables only migrations write; the runtime reads them to check the schema version. */
export const MIGRATION_BOOKKEEPING_TABLES = [
  'kysely_migration',
  'kysely_migration_lock',
  'schema_version',
] as const;

/** Rows the runtime appends and reads but never changes: the audit trail. */
export const APPEND_ONLY_TABLES = ['audit_log'] as const;

/**
 * Gives the runtime role exactly the access it needs on every table and
 * sequence in `public`, after each migration run. Default privileges already
 * reach tables the owner creates, but they grant full row access and they miss
 * anything a restore or a hand-made change left behind; this narrows and
 * completes them. Does nothing where the role does not exist (development,
 * tests and SQLite run with one credential).
 */
export async function applyRuntimeGrants(
  db: Kysely<Database>,
  role: string = RUNTIME_ROLE,
): Promise<boolean> {
  if (!(await roleExists(db, role))) return false;

  const tables = await sql<{ name: string }>`
    select c.relname as name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  `.execute(db);
  const readOnly = new Set<string>(MIGRATION_BOOKKEEPING_TABLES);
  const appendOnly = new Set<string>(APPEND_ONLY_TABLES);
  const grantee = sql.id(role);

  await sql`grant usage on schema public to ${grantee}`.execute(db);
  for (const { name } of tables.rows) {
    const table = sql.id('public', name);
    await sql`revoke all on table ${table} from ${grantee}`.execute(db);
    if (readOnly.has(name)) {
      await sql`grant select on table ${table} to ${grantee}`.execute(db);
    } else if (appendOnly.has(name)) {
      await sql`grant select, insert on table ${table} to ${grantee}`.execute(db);
    } else {
      await sql`grant select, insert, update, delete on table ${table} to ${grantee}`.execute(db);
    }
  }
  await sql`grant usage, select on all sequences in schema public to ${grantee}`.execute(db);
  return true;
}

async function roleExists(db: Kysely<Database>, role: string): Promise<boolean> {
  if (!(await isPostgres(db))) return false;
  const result = await sql<{ exists: boolean }>`
    select exists (select from pg_roles where rolname = ${role}) as exists
  `.execute(db);
  return result.rows[0]?.exists === true;
}

async function isPostgres(db: Kysely<Database>): Promise<boolean> {
  try {
    await sql`select 1 from pg_catalog.pg_roles limit 1`.execute(db);
    return true;
  } catch {
    return false;
  }
}
