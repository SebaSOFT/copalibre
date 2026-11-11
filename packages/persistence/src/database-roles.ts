import { readFile } from 'node:fs/promises';
import { sql, type Kysely } from 'kysely';
import type { Database } from './schema.js';

/** The two passwords `deploy/postgres/roles.sql` sets, from the installation's `.env`. */
export interface DatabaseRolePasswords {
  readonly ownerPassword: string;
  readonly appPassword: string;
}

/** A SQL string literal: the value between single quotes, each quote doubled. */
function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * `roles.sql` is written for `psql -v`, so an operator can run it by hand. Its
 * only psql syntax is the two `:'name'` variables; this fills them in as
 * literals so the same file runs through an ordinary connection.
 */
export function renderRolesScript(script: string, passwords: DatabaseRolePasswords): string {
  return script
    .replaceAll(":'owner_password'", sqlLiteral(passwords.ownerPassword))
    .replaceAll(":'app_password'", sqlLiteral(passwords.appPassword));
}

/**
 * Runs `roles.sql` as an administrative user. The whole script goes in one
 * simple-protocol query, so it runs in one implicit transaction: a failure
 * anywhere changes nothing.
 */
export async function applyDatabaseRoles(
  db: Kysely<Database>,
  scriptPath: string,
  passwords: DatabaseRolePasswords,
): Promise<void> {
  const script = await readFile(scriptPath, 'utf8');
  await sql.raw(renderRolesScript(script, passwords)).execute(db);
}

/** Reads the two passwords; throws with the variable names when either is blank. */
export function databaseRolePasswordsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseRolePasswords {
  const ownerPassword = env.COPALIBRE_DATABASE_OWNER_PASSWORD?.trim() ?? '';
  const appPassword = env.COPALIBRE_DATABASE_APP_PASSWORD?.trim() ?? '';
  if (!ownerPassword || !appPassword) {
    throw new Error(
      'COPALIBRE_DATABASE_OWNER_PASSWORD and COPALIBRE_DATABASE_APP_PASSWORD must be set; run "copalibre upgrade" to generate them',
    );
  }
  return { ownerPassword, appPassword };
}
