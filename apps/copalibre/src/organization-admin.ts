import { createHash, randomBytes } from 'node:crypto';
import {
  createDatabase,
  databaseConfigFromEnv,
  OrganizationAccessRepository,
  OrganizationRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';

const INVITATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface OrganizationAdminInvitation {
  readonly invitationId: string;
  readonly expiresAt: string;
  readonly setupUrl: string;
}

export async function createOrganizationAdminInvitation(
  db: Kysely<Database>,
  organizationAlias: string,
  email: string,
  appUrl: string | undefined,
  now = new Date(),
): Promise<OrganizationAdminInvitation> {
  if (!appUrl) throw new Error('COPALIBRE_APP_URL is not set');
  const setupUrl = new URL('/invitations/accept', appUrl);
  const organization = await new OrganizationRepository(db).findByAlias(organizationAlias);
  if (!organization) throw new Error(`Organization "${organizationAlias}" was not found`);

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS).toISOString();
  const invitation = await withTransaction(db, (uow) =>
    new OrganizationAccessRepository(db).createInvitation(uow, {
      organizationId: organization.organizationId,
      recipientEmail: email,
      role: 'admin',
      status: 'active',
      token,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt,
      actor: 'operator:cli',
      authorizationContext: 'direct-database',
    }),
  );

  setupUrl.searchParams.set('token', token);
  return {
    invitationId: invitation.invitationId,
    expiresAt: invitation.expiresAt,
    setupUrl: setupUrl.toString(),
  };
}

export async function createOrganizationAdminInvitationFromEnv(
  organizationAlias: string,
  email: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<OrganizationAdminInvitation> {
  const db = createDatabase(databaseConfigFromEnv(environment));
  try {
    return await createOrganizationAdminInvitation(
      db,
      organizationAlias,
      email,
      environment.COPALIBRE_APP_URL,
    );
  } finally {
    await db.destroy();
  }
}
