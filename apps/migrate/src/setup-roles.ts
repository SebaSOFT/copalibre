import { join } from 'node:path';
import {
  applyDatabaseRoles,
  createDatabase,
  databaseRolePasswordsFromEnv,
} from '@copalibre/persistence';

/**
 * The `database-setup` role: creates the schema owner and the runtime role,
 * sets their passwords and hands every object in `public` to the owner, by
 * running `deploy/postgres/roles.sql` as the PostgreSQL bootstrap superuser.
 * It runs before `migrate` on every start, and is a no-op when nothing changed.
 *
 * `DATABASE_SETUP_URL` is the superuser's connection. Only this role gets it.
 */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_SETUP_URL;
  if (!connectionString) {
    process.stderr.write('database setup failed: DATABASE_SETUP_URL is not set\n');
    process.exitCode = 1;
    return;
  }
  const scriptPath =
    process.env.COPALIBRE_ROLES_SQL ?? join(process.cwd(), 'deploy', 'postgres', 'roles.sql');
  const db = createDatabase({ connectionString, maxConnections: 1 });
  try {
    await applyDatabaseRoles(db, scriptPath, databaseRolePasswordsFromEnv());
    process.stdout.write('database roles ready: copalibre_owner, copalibre_app\n');
  } catch (error) {
    // The driver's message names the failing statement, never the passwords.
    process.stderr.write(
      `database setup failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}

void main();
