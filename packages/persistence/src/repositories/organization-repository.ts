import {
  Alias,
  isSupportedLanguage,
  type Organization,
  type SupportedLanguage,
} from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { newId } from '../ids.js';
import { toOrganization } from '../mapping.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';
import { InvariantViolationError } from '../errors.js';

const DEFAULT_PRIMARY_LANGUAGE: SupportedLanguage = 'es';
const DEFAULT_TIMEZONE = 'UTC';

export interface CreateOrganizationInput {
  readonly alias: string;
  readonly name: string;
  readonly actor: string;
  readonly authorizationContext: string;
  readonly primaryLanguage?: string;
  readonly timezone?: string;
}

export interface UpdateOrganizationSettingsInput {
  readonly name?: string;
  readonly primaryLanguage?: string;
  readonly timezone?: string;
  readonly emblemObjectId?: string;
  readonly actor: string;
  readonly authorizationContext: string;
}

/**
 * `Intl.DateTimeFormat` throws `RangeError` for an unknown time zone
 * identifier — the exact set of valid IANA identifiers, with no hand-copied
 * list or regex to keep in sync.
 */
export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
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
    const primaryLanguage = validatePrimaryLanguage(input.primaryLanguage);
    const timezone = validateTimezone(input.timezone);

    const organizationId = newId();
    const row = await uow.tx
      .insertInto('organizations')
      .values({
        organization_id: organizationId,
        alias: alias.value.value,
        name: input.name,
        primary_language: primaryLanguage,
        timezone,
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

  async updateSettings(
    uow: UnitOfWork,
    organizationId: string,
    input: UpdateOrganizationSettingsInput,
  ): Promise<Organization> {
    const updates: {
      name?: string;
      primary_language?: SupportedLanguage;
      timezone?: string;
      emblem_object_id?: string;
    } = {};
    if (input.name !== undefined) {
      updates.name = input.name;
    }
    if (input.primaryLanguage !== undefined) {
      updates.primary_language = validatePrimaryLanguage(input.primaryLanguage);
    }
    if (input.timezone !== undefined) {
      updates.timezone = validateTimezone(input.timezone);
    }
    if (input.emblemObjectId !== undefined) {
      updates.emblem_object_id = input.emblemObjectId;
    }

    const row = await uow.tx
      .updateTable('organizations')
      .set(updates)
      .where('organization_id', '=', organizationId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const organization = toOrganization(row);

    await uow.recordAudit({
      organizationId,
      entityType: 'organization',
      entityId: organizationId,
      action: 'organization.settings_updated',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...organization },
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

function validatePrimaryLanguage(value: string | undefined): SupportedLanguage {
  if (value === undefined) return DEFAULT_PRIMARY_LANGUAGE;
  if (!isSupportedLanguage(value)) {
    throw new InvariantViolationError(
      `primaryLanguage must be one of the supported languages, got "${value}"`,
      { primaryLanguage: value },
    );
  }
  return value;
}

function validateTimezone(value: string | undefined): string {
  if (value === undefined) return DEFAULT_TIMEZONE;
  if (!isValidTimeZone(value)) {
    throw new InvariantViolationError(
      `timezone must be a valid IANA time zone identifier, got "${value}"`,
      {
        timezone: value,
      },
    );
  }
  return value;
}
