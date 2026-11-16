import {
  createDatabase,
  databaseConfigFromEnv,
  InstallationRoleRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';

/**
 * Who the audit trail names for a grant made from the host's own command line, and the context it
 * records, as `organization add-admin` does.
 */
const ACTOR = 'operator:cli';
const AUTHORIZATION_CONTEXT = 'direct-database';

export interface FirstSuperAdminGrant {
  readonly email: string;
  readonly assignmentId: string;
}

/**
 * Grants super-admin to the account with this email, only while the installation has none active.
 * Every other way to grant it needs a super-admin already, so this is the way to the first one.
 *
 * It refuses, with a message that says what to do, when one exists or when no account has that
 * email; the first refusal is recorded in the audit trail by the grant itself.
 */
export async function grantFirstSuperAdmin(
  db: Kysely<Database>,
  email: string,
): Promise<FirstSuperAdminGrant> {
  const outcome = await withTransaction(db, (uow) =>
    new InstallationRoleRepository(db).grantFirstSuperAdmin(uow, {
      email,
      actor: ACTOR,
      authorizationContext: AUTHORIZATION_CONTEXT,
    }),
  );
  if (outcome.kind === 'granted') {
    return { email, assignmentId: outcome.assignment.assignmentId };
  }
  throw new Error(
    outcome.reason === 'super-admin-exists'
      ? 'this installation already has an active super-admin, so there is no first one to grant. ' +
          'Sign in as that super-admin and use the platform screen of the control panel. ' +
          'This attempt was recorded in the audit trail'
      : `no account has the email "${email}". It must exist first: the person accepts an ` +
          'invitation or signs in once, then run this again',
  );
}

export async function grantFirstSuperAdminFromEnv(
  email: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<FirstSuperAdminGrant> {
  const db = createDatabase(databaseConfigFromEnv(environment));
  try {
    return await grantFirstSuperAdmin(db, email);
  } finally {
    await db.destroy();
  }
}

/** What the command tells the operator once the grant is made. */
export function describeGrant(grant: FirstSuperAdminGrant): string {
  return (
    `Granted super-admin to ${grant.email}. It takes effect the next time they sign in; ` +
    'a session that is already open keeps the access it had.\n'
  );
}
