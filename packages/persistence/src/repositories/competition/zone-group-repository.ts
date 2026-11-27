import {
  IMPLICIT_GROUP_NAME,
  IMPLICIT_ZONE_NAME,
  validateGroup,
  validateZone,
} from '@copalibre/domain';
import type { Group, Zone } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { InvariantViolationError, NotFoundError } from '../../errors.js';
import { newId } from '../../ids.js';
import { toGroup, toZone } from '../../mapping.js';
import type { Database } from '../../schema.js';
import type { UnitOfWork } from '../../transaction.js';
import type { AuditContext } from '../enrollment-repository.js';
import { assertStageHasNoFixtures } from './competition-support.js';

/** Zones and groups: their lifecycle, their entrants and the implicit zone and group of a stage. */
export class ZoneGroupRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async createZone(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly number: number;
      readonly name: string;
      /** Omitted: the zone inherits its stage's format. */
      readonly format?: Zone['format'];
    } & AuditContext,
  ): Promise<Zone> {
    await assertStageHasNoFixtures(uow, input.stageId);
    const zone: Zone = { zoneId: newId(), ...input };
    const valid = validateZone(zone);
    if (!valid.ok) throw new InvariantViolationError(valid.error.message, valid.error.details);
    const row = await uow.tx
      .insertInto('zones')
      .values({
        zone_id: zone.zoneId,
        stage_id: zone.stageId,
        number: zone.number,
        name: zone.name,
        format: zone.format ?? null,
        draw_seed: null,
        draw_constraints: null,
        created_at: new Date(),
        deleted_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'zone',
      entityId: zone.zoneId,
      action: 'zone.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...zone },
    });
    return toZone(row);
  }

  /** Renames a zone — permitted at any time, seeded or not. */
  async renameZone(
    uow: UnitOfWork,
    input: { readonly zoneId: string; readonly name: string } & AuditContext,
  ): Promise<Zone> {
    const row = await uow.tx
      .updateTable('zones')
      .set({ name: input.name })
      .where('zone_id', '=', input.zoneId)
      .returningAll()
      .executeTakeFirst();
    if (!row) {
      throw new NotFoundError(`Zone ${input.zoneId} does not exist`, { zoneId: input.zoneId });
    }
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'zone',
      entityId: input.zoneId,
      action: 'zone.renamed',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { name: input.name },
    });
    return toZone(row);
  }

  /**
   * Sets a zone's own format, or clears it (`null`) so the zone inherits its stage's again.
   * Refused once the stage holds a fixture: a zone's format decides the fixtures it generates. The
   * caller validates the format against the discipline's `availableFormats`.
   */
  async setZoneFormat(
    uow: UnitOfWork,
    input: { readonly zoneId: string; readonly format: Zone['format'] | null } & AuditContext,
  ): Promise<Zone> {
    const existing = await uow.tx
      .selectFrom('zones')
      .select('stage_id')
      .where('zone_id', '=', input.zoneId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!existing) {
      throw new NotFoundError(`Zone ${input.zoneId} does not exist`, { zoneId: input.zoneId });
    }
    await assertStageHasNoFixtures(uow, existing.stage_id);
    const row = await uow.tx
      .updateTable('zones')
      .set({ format: input.format })
      .where('zone_id', '=', input.zoneId)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirstOrThrow();
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'zone',
      entityId: input.zoneId,
      action: 'zone.format-set',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { format: input.format },
    });
    return toZone(row);
  }

  /** Removes a zone while retaining its assignments for the undo window. */
  async deleteZone(
    uow: UnitOfWork,
    input: { readonly zoneId: string } & AuditContext,
  ): Promise<Zone> {
    const existing = await uow.tx
      .selectFrom('zones')
      .selectAll()
      .where('zone_id', '=', input.zoneId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!existing) {
      throw new NotFoundError(`Zone ${input.zoneId} does not exist`, { zoneId: input.zoneId });
    }
    const groups = await uow.tx
      .selectFrom('groups')
      .select('group_id')
      .where('zone_id', '=', input.zoneId)
      .where('deleted_at', 'is', null)
      .execute();
    const groupIds = groups.map((group) => group.group_id);
    const zoneFixture = await uow.tx
      .selectFrom('fixtures')
      .select('fixture_id')
      .where('zone_id', '=', input.zoneId)
      .executeTakeFirst();
    const groupFixture =
      groupIds.length === 0
        ? undefined
        : await uow.tx
            .selectFrom('fixtures')
            .select('fixture_id')
            .where('group_id', 'in', groupIds)
            .executeTakeFirst();
    if (zoneFixture || groupFixture) {
      throw new InvariantViolationError('Cannot remove a zone that already has fixtures', {
        zoneId: input.zoneId,
      });
    }

    const deletedAt = new Date();
    const deleted = await uow.tx
      .updateTable('zones')
      .set({ deleted_at: deletedAt })
      .where('zone_id', '=', input.zoneId)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();
    if (!deleted) {
      throw new NotFoundError(`Zone ${input.zoneId} does not exist`, { zoneId: input.zoneId });
    }

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'zone',
      entityId: input.zoneId,
      action: 'zone.deleted',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { ...toZone(deleted) },
      resultingState: { deletedAt: deletedAt.toISOString(), groupsHidden: groupIds.length },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `stage:${deleted.stage_id}`,
      entityId: input.zoneId,
      eventType: 'zone.deleted',
      projectionVersion: 1,
      payload: {
        stageId: deleted.stage_id,
        zoneId: input.zoneId,
        deletedAt: deletedAt.toISOString(),
        groupsHidden: groupIds.length,
        actor: input.actor,
      },
    });
    return toZone(deleted);
  }

  async restoreZone(
    uow: UnitOfWork,
    input: { readonly zoneId: string } & AuditContext,
  ): Promise<Zone> {
    const restored = await uow.tx
      .updateTable('zones')
      .set({ deleted_at: null })
      .where('zone_id', '=', input.zoneId)
      .where('deleted_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
      .returningAll()
      .executeTakeFirst();
    if (!restored) {
      throw new NotFoundError(`Zone ${input.zoneId} is no longer available to restore`, {
        zoneId: input.zoneId,
      });
    }
    const zone = toZone(restored);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'zone',
      entityId: input.zoneId,
      action: 'zone.restored',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...zone },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `stage:${restored.stage_id}`,
      entityId: input.zoneId,
      eventType: 'zone.restored',
      projectionVersion: 1,
      payload: { stageId: restored.stage_id, zoneId: input.zoneId, actor: input.actor },
    });
    return zone;
  }

  async listZonesOfStage(stageId: string): Promise<readonly Zone[]> {
    const rows = await this.db
      .selectFrom('zones')
      .selectAll()
      .where('stage_id', '=', stageId)
      .where('deleted_at', 'is', null)
      .orderBy('number')
      .execute();
    return rows.map(toZone);
  }

  async findZoneById(zoneId: string): Promise<Zone | undefined> {
    const row = await this.db
      .selectFrom('zones')
      .selectAll()
      .where('zone_id', '=', zoneId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    return row === undefined ? undefined : toZone(row);
  }

  async findZoneByNumberIncludingDeleted(
    stageId: string,
    number: number,
  ): Promise<Zone | undefined> {
    const row = await this.db
      .selectFrom('zones')
      .selectAll()
      .where('stage_id', '=', stageId)
      .where('number', '=', number)
      .executeTakeFirst();
    return row === undefined ? undefined : toZone(row);
  }

  async currentOrImplicitZone(
    uow: UnitOfWork,
    input: { readonly stageId: string } & AuditContext,
  ): Promise<Zone> {
    const row = await uow.tx
      .selectFrom('zones')
      .selectAll()
      .where('stage_id', '=', input.stageId)
      .where('deleted_at', 'is', null)
      .orderBy('number')
      .limit(1)
      .executeTakeFirst();
    return row
      ? toZone(row)
      : this.createZone(uow, { ...input, number: 1, name: IMPLICIT_ZONE_NAME });
  }

  async createGroup(
    uow: UnitOfWork,
    input: {
      readonly zoneId: string;
      readonly number: number;
      readonly name: string;
    } & AuditContext,
  ): Promise<Group> {
    const zoneRow = await uow.tx
      .selectFrom('zones')
      .select('stage_id')
      .where('zone_id', '=', input.zoneId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!zoneRow) {
      throw new NotFoundError(`Zone ${input.zoneId} does not exist`, { zoneId: input.zoneId });
    }
    await assertStageHasNoFixtures(uow, zoneRow.stage_id);
    const group: Group = { groupId: newId(), ...input };
    const valid = validateGroup(group);
    if (!valid.ok) throw new InvariantViolationError(valid.error.message, valid.error.details);
    const row = await uow.tx
      .insertInto('groups')
      .values({
        group_id: group.groupId,
        zone_id: group.zoneId,
        number: group.number,
        name: group.name,
        draw_seed: null,
        draw_constraints: null,
        created_at: new Date(),
        deleted_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'group',
      entityId: group.groupId,
      action: 'group.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...group },
    });
    return toGroup(row);
  }

  /** Renames a group — permitted at any time, seeded or not. */
  async renameGroup(
    uow: UnitOfWork,
    input: { readonly groupId: string; readonly name: string } & AuditContext,
  ): Promise<Group> {
    const row = await uow.tx
      .updateTable('groups')
      .set({ name: input.name })
      .where('group_id', '=', input.groupId)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();
    if (!row) {
      throw new NotFoundError(`Group ${input.groupId} does not exist`, { groupId: input.groupId });
    }
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'group',
      entityId: input.groupId,
      action: 'group.renamed',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { name: input.name },
    });
    return toGroup(row);
  }

  /** Removes a group while retaining its assignments for the undo window. */
  async deleteGroup(
    uow: UnitOfWork,
    input: { readonly groupId: string } & AuditContext,
  ): Promise<Group> {
    const existing = await uow.tx
      .selectFrom('groups')
      .selectAll()
      .where('group_id', '=', input.groupId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!existing) {
      throw new NotFoundError(`Group ${input.groupId} does not exist`, { groupId: input.groupId });
    }
    const fixture = await uow.tx
      .selectFrom('fixtures')
      .select('fixture_id')
      .where('group_id', '=', input.groupId)
      .executeTakeFirst();
    if (fixture) {
      throw new InvariantViolationError('Cannot remove a group that already has fixtures', {
        groupId: input.groupId,
      });
    }
    const deletedAt = new Date();
    const deleted = await uow.tx
      .updateTable('groups')
      .set({ deleted_at: deletedAt })
      .where('group_id', '=', input.groupId)
      .where('deleted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();
    if (!deleted) {
      throw new NotFoundError(`Group ${input.groupId} does not exist`, { groupId: input.groupId });
    }

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'group',
      entityId: input.groupId,
      action: 'group.deleted',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { ...toGroup(deleted) },
      resultingState: { deletedAt: deletedAt.toISOString() },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `zone:${deleted.zone_id}`,
      entityId: input.groupId,
      eventType: 'group.deleted',
      projectionVersion: 1,
      payload: {
        zoneId: deleted.zone_id,
        groupId: input.groupId,
        deletedAt: deletedAt.toISOString(),
        actor: input.actor,
      },
    });
    return toGroup(deleted);
  }

  async restoreGroup(
    uow: UnitOfWork,
    input: { readonly groupId: string } & AuditContext,
  ): Promise<Group> {
    const restored = await uow.tx
      .updateTable('groups')
      .set({ deleted_at: null })
      .where('group_id', '=', input.groupId)
      .where('deleted_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
      .returningAll()
      .executeTakeFirst();
    if (!restored) {
      throw new NotFoundError(`Group ${input.groupId} is no longer available to restore`, {
        groupId: input.groupId,
      });
    }
    const group = toGroup(restored);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'group',
      entityId: input.groupId,
      action: 'group.restored',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...group },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `zone:${restored.zone_id}`,
      entityId: input.groupId,
      eventType: 'group.restored',
      projectionVersion: 1,
      payload: { zoneId: restored.zone_id, groupId: input.groupId, actor: input.actor },
    });
    return group;
  }

  async listGroupsOfZone(zoneId: string): Promise<readonly Group[]> {
    const rows = await this.db
      .selectFrom('groups')
      .innerJoin('zones', 'zones.zone_id', 'groups.zone_id')
      .selectAll('groups')
      .where('groups.zone_id', '=', zoneId)
      .where('groups.deleted_at', 'is', null)
      .where('zones.deleted_at', 'is', null)
      .orderBy('groups.number')
      .execute();
    return rows.map(toGroup);
  }

  async findGroupByNumberIncludingDeleted(
    zoneId: string,
    number: number,
  ): Promise<Group | undefined> {
    const row = await this.db
      .selectFrom('groups')
      .selectAll()
      .where('zone_id', '=', zoneId)
      .where('number', '=', number)
      .executeTakeFirst();
    return row === undefined ? undefined : toGroup(row);
  }

  async listGroupEntrantIdsOfZone(zoneId: string): Promise<ReadonlyMap<string, readonly string[]>> {
    const rows = await this.db
      .selectFrom('group_entrants')
      .innerJoin('groups', 'groups.group_id', 'group_entrants.group_id')
      .innerJoin('zones', 'zones.zone_id', 'groups.zone_id')
      .select(['group_entrants.group_id as groupId', 'group_entrants.entrant_id as entrantId'])
      .where('groups.zone_id', '=', zoneId)
      .where('groups.deleted_at', 'is', null)
      .where('zones.deleted_at', 'is', null)
      .orderBy('groups.number')
      .orderBy('group_entrants.entrant_id')
      .execute();
    const entrantIdsByGroup = new Map<string, string[]>();

    for (const row of rows) {
      const entrantIds = entrantIdsByGroup.get(row.groupId) ?? [];
      entrantIds.push(row.entrantId);
      entrantIdsByGroup.set(row.groupId, entrantIds);
    }

    return entrantIdsByGroup;
  }

  async listEntrantIdsOfZone(zoneId: string): Promise<readonly string[]> {
    const rows = await this.db
      .selectFrom('zone_entrants')
      .innerJoin('zones', 'zones.zone_id', 'zone_entrants.zone_id')
      .select('entrant_id')
      .where('zone_entrants.zone_id', '=', zoneId)
      .where('zones.deleted_at', 'is', null)
      .orderBy('entrant_id')
      .execute();
    return rows.map((row) => row.entrant_id);
  }

  async listEntrantIdsOfGroup(groupId: string): Promise<readonly string[]> {
    const rows = await this.db
      .selectFrom('group_entrants')
      .innerJoin('groups', 'groups.group_id', 'group_entrants.group_id')
      .innerJoin('zones', 'zones.zone_id', 'groups.zone_id')
      .select('entrant_id')
      .where('group_entrants.group_id', '=', groupId)
      .where('groups.deleted_at', 'is', null)
      .where('zones.deleted_at', 'is', null)
      .orderBy('entrant_id')
      .execute();
    return rows.map((row) => row.entrant_id);
  }

  async currentOrImplicitGroup(
    uow: UnitOfWork,
    input: { readonly zoneId: string } & AuditContext,
  ): Promise<Group> {
    const row = await uow.tx
      .selectFrom('groups')
      .selectAll()
      .where('zone_id', '=', input.zoneId)
      .where('deleted_at', 'is', null)
      .orderBy('number')
      .limit(1)
      .executeTakeFirst();
    return row
      ? toGroup(row)
      : this.createGroup(uow, { ...input, number: 1, name: IMPLICIT_GROUP_NAME });
  }
}
