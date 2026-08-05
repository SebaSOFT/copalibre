import { InvariantViolationError } from '../errors.js';
import { OrganizationAccessRepository } from './organization-access-repository.js';
import { OrganizationRepository } from './organization-repository.js';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';

const INSTALLATION_BOOTSTRAP_LOCK = 30_301_001;

export interface BootstrapAdministratorInput {
  readonly organizationAlias: string;
  readonly organizationName: string;
  readonly email: string;
  readonly invitationToken: string;
  readonly invitationTokenHash: string;
  readonly expiresAt: string;
}

export interface BootstrapAdministratorResult {
  readonly organizationId: string;
  readonly organizationAlias: string;
  readonly invitationId: string;
  readonly expiresAt: string;
}

/**
 * The one installation bootstrap writes through the same organization and
 * invitation repositories as normal operation. The advisory lock serializes
 * two operators racing a fresh database, including the empty-table case where
 * row locks cannot help.
 */
export class InstallationBootstrapRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async createInitialAdministrator(
    uow: UnitOfWork,
    input: BootstrapAdministratorInput,
  ): Promise<BootstrapAdministratorResult> {
    await sql`select pg_advisory_xact_lock(${INSTALLATION_BOOTSTRAP_LOCK})`.execute(uow.tx);
    const existing = await uow.tx
      .selectFrom('organizations')
      .select('organization_id')
      .limit(1)
      .executeTakeFirst();
    if (existing) {
      throw new InvariantViolationError(
        'Installation bootstrap is available only before any organization exists',
      );
    }

    const organizations = new OrganizationRepository(this.db);
    const organization = await organizations.create(uow, {
      alias: input.organizationAlias,
      name: input.organizationName,
      actor: 'bootstrap:cli',
      authorizationContext: 'bootstrap-token',
    });
    const invitation = await new OrganizationAccessRepository(this.db).createInvitation(uow, {
      organizationId: organization.organizationId,
      recipientEmail: input.email,
      role: 'admin',
      status: 'active',
      token: input.invitationToken,
      tokenHash: input.invitationTokenHash,
      expiresAt: input.expiresAt,
      actor: 'bootstrap:cli',
      authorizationContext: 'bootstrap-token',
    });
    return {
      organizationId: organization.organizationId,
      organizationAlias: organization.alias,
      invitationId: invitation.invitationId,
      expiresAt: invitation.expiresAt,
    };
  }
}
