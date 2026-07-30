import { Alias, type Organization } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { newId } from '../ids';
import { toOrganization } from '../mapping';
import type { Database } from '../schema';
import type { UnitOfWork } from '../transaction';
import { InvariantViolationError } from '../errors';

export interface CreateOrganizationInput {
  readonly alias: string;
  readonly name: string;
  readonly actor: string;
  readonly authorizationContext: string;
}

/**
 * Repositories are the only path into Postgres. Every mutating method takes a
 * UnitOfWork (so its audit + outbox rows share one transaction) and validates
 * phase-2 domain invariants *before* any SQL runs.
 */
export class OrganizationRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async create(uow: UnitOfWork, input: CreateOrganizationInput): Promise<Organization> {
    const alias = Alias.create('organization', input.alias);
    if (!alias.ok) {
      throw new InvariantViolationError(alias.error.message, { alias: input.alias });
    }

    const organizationId = newId();
    const row = await uow.tx
      .insertInto('organizations')
      .values({
        organization_id: organizationId,
        alias: alias.value.value,
        name: input.name,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const organization = toOrganization(row);

    await uow.recordAudit({
      organizationId,
      entityType: 'organization',
      entityId: organizationId,
      action: 'organization.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...organization },
    });
    await uow.publishEvent({
      organizationId,
      stream: `organization:${organizationId}`,
      entityId: organizationId,
      eventType: 'organization.created',
      projectionVersion: 1,
      payload: { organizationId, alias: organization.alias },
    });

    return organization;
  }

  async findByAlias(alias: string): Promise<Organization | undefined> {
    const row = await this.db
      .selectFrom('organizations')
      .selectAll()
      .where('alias', '=', alias)
      .executeTakeFirst();
    return row ? toOrganization(row) : undefined;
  }

  async findById(organizationId: string): Promise<Organization | undefined> {
    const row = await this.db
      .selectFrom('organizations')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();
    return row ? toOrganization(row) : undefined;
  }
}
