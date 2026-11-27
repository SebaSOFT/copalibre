import { validateOfficial, type Official, type OfficialRole } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { newId } from '../../ids.js';
import { toOfficial } from '../../mapping.js';
import type { Database } from '../../schema.js';
import type { UnitOfWork } from '../../transaction.js';
import type { AuditContext } from '../enrollment-repository.js';

/** Official reads and writes. */
export class OfficialRepository {
  constructor(private readonly db: Kysely<Database>) {}

  // ---------------------------------------------------------------------------
  // Officials
  // ---------------------------------------------------------------------------

  async createOfficial(
    uow: UnitOfWork,
    input: Omit<Official, 'officialId'> & AuditContext,
  ): Promise<Official> {
    const officialId = newId();
    const official: Official = {
      officialId,
      organizationId: input.organizationId,
      displayName: input.displayName,
      roles: input.roles,
    };

    const valid = validateOfficial(official);
    if (!valid.ok) throw valid.error;

    const row = await uow.tx
      .insertInto('officials')
      .values({
        official_id: officialId,
        organization_id: input.organizationId,
        display_name: input.displayName,
        roles: JSON.stringify(input.roles),
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'official',
      entityId: officialId,
      action: 'official.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...toOfficial(row) },
    });
    return toOfficial(row);
  }

  async listOfficials(organizationId: string): Promise<readonly Official[]> {
    const rows = await this.db
      .selectFrom('officials')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .orderBy('display_name')
      .execute();
    return rows.map(toOfficial);
  }

  async findOfficial(officialId: string): Promise<Official | undefined> {
    const row = await this.db
      .selectFrom('officials')
      .selectAll()
      .where('official_id', '=', officialId)
      .executeTakeFirst();
    return row ? toOfficial(row) : undefined;
  }

  async updateOfficial(
    uow: UnitOfWork,
    input: {
      readonly officialId: string;
      readonly organizationId: string;
      readonly displayName?: string;
      readonly roles?: readonly OfficialRole[];
    } & Omit<AuditContext, 'organizationId'>,
  ): Promise<Official> {
    const previous = await this.findOfficial(input.officialId);
    const row = await uow.tx
      .updateTable('officials')
      .set({
        ...(input.displayName === undefined ? {} : { display_name: input.displayName }),
        ...(input.roles === undefined ? {} : { roles: JSON.stringify(input.roles) }),
      })
      .where('official_id', '=', input.officialId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const official = toOfficial(row);
    const valid = validateOfficial(official);
    if (!valid.ok) throw valid.error;

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'official',
      entityId: input.officialId,
      action: 'official.updated',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      ...(previous === undefined ? {} : { previousState: { ...previous } }),
      resultingState: { ...official },
    });
    return official;
  }
}
