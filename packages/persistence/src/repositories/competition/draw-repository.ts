import { type DrawConstraint } from '@copalibre/domain';
import type { Group, Zone } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { InvariantViolationError, NotFoundError } from '../../errors.js';
import { newId } from '../../ids.js';
import { toGroup, toZone } from '../../mapping.js';
import type { Database } from '../../schema.js';
import type { UnitOfWork } from '../../transaction.js';
import type { AuditContext } from '../enrollment-repository.js';
import { assertStageHasNoFixtures } from './competition-support.js';

export interface PersistedDraw<T> {
  readonly assignment: GroupAssignment;
  readonly entities: readonly T[];
  readonly seed?: number;
}

export interface GroupAssignment {
  readonly groups: Readonly<Record<string, number>>;
}

/** Zone and group assignment: automatic draws and manual assignment. */
export class DrawRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async assignZones(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly assignment: GroupAssignment;
      readonly constraints: readonly DrawConstraint[];
      readonly zoneCount: number;
      readonly seed: number;
    } & AuditContext,
  ): Promise<PersistedDraw<Zone>> {
    const zones = await this.persistZoneDraw(uow, input, input.assignment, input.zoneCount, {
      seed: input.seed,
      constraints: input.constraints,
    });
    return { assignment: input.assignment, entities: zones, seed: input.seed };
  }

  async assignZonesManually(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly assignment: GroupAssignment;
      readonly zoneCount: number;
    } & AuditContext,
  ): Promise<PersistedDraw<Zone>> {
    const zones = await this.persistZoneDraw(uow, input, input.assignment, input.zoneCount);
    return { assignment: input.assignment, entities: zones };
  }

  async assignGroups(
    uow: UnitOfWork,
    input: {
      readonly zoneId: string;
      readonly assignment: GroupAssignment;
      readonly constraints: readonly DrawConstraint[];
      readonly groupCount: number;
      readonly seed: number;
    } & AuditContext,
  ): Promise<PersistedDraw<Group>> {
    const groups = await this.persistGroupDraw(uow, input, input.assignment, input.groupCount, {
      seed: input.seed,
      constraints: input.constraints,
    });
    return { assignment: input.assignment, entities: groups, seed: input.seed };
  }

  async assignGroupsManually(
    uow: UnitOfWork,
    input: {
      readonly zoneId: string;
      readonly assignment: GroupAssignment;
      readonly groupCount: number;
    } & AuditContext,
  ): Promise<PersistedDraw<Group>> {
    const groups = await this.persistGroupDraw(uow, input, input.assignment, input.groupCount);
    return { assignment: input.assignment, entities: groups };
  }

  async persistZoneDraw(
    uow: UnitOfWork,
    input: { readonly stageId: string } & AuditContext,
    assignment: GroupAssignment,
    zoneCount: number,
    replay?: { readonly seed: number; readonly constraints: readonly DrawConstraint[] },
  ): Promise<readonly Zone[]> {
    this.assertGroupAssignment(assignment, zoneCount);
    await assertStageHasNoFixtures(uow, input.stageId);
    const existing = await uow.tx
      .selectFrom('zones')
      .select('zone_id')
      .where('stage_id', '=', input.stageId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (existing) {
      throw new InvariantViolationError('Zones have already been assigned for this stage', {
        stageId: input.stageId,
      });
    }
    const rows = await uow.tx
      .insertInto('zones')
      .values(
        Array.from({ length: zoneCount }, (_unused, index) => ({
          zone_id: newId(),
          stage_id: input.stageId,
          number: index + 1,
          name: `Zona ${index + 1}`,
          draw_seed: replay?.seed ?? null,
          draw_constraints: replay ? JSON.stringify(replay.constraints) : null,
          created_at: new Date(),
          deleted_at: null,
        })),
      )
      .returningAll()
      .execute();
    const zones = rows.map(toZone);
    const zoneByNumber = new Map(zones.map((zone) => [zone.number, zone.zoneId]));
    await uow.tx
      .insertInto('zone_entrants')
      .values(
        Object.entries(assignment.groups).map(([entrantId, zoneNumber]) => ({
          zone_id: zoneByNumber.get(zoneNumber) as string,
          entrant_id: entrantId,
        })),
      )
      .execute();
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'stage',
      entityId: input.stageId,
      action: replay ? 'zones.drawn' : 'zones.manually-assigned',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { assignment, ...(replay ?? {}) },
    });
    return zones;
  }

  async persistGroupDraw(
    uow: UnitOfWork,
    input: { readonly zoneId: string } & AuditContext,
    assignment: GroupAssignment,
    groupCount: number,
    replay?: { readonly seed: number; readonly constraints: readonly DrawConstraint[] },
  ): Promise<readonly Group[]> {
    this.assertGroupAssignment(assignment, groupCount);
    const zone = await uow.tx
      .selectFrom('zones')
      .select(['zone_id', 'stage_id'])
      .where('zone_id', '=', input.zoneId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!zone)
      throw new NotFoundError(`Zone ${input.zoneId} does not exist`, { zoneId: input.zoneId });
    await assertStageHasNoFixtures(uow, zone.stage_id);
    const existing = await uow.tx
      .selectFrom('groups')
      .select('group_id')
      .where('zone_id', '=', input.zoneId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (existing) {
      throw new InvariantViolationError('Groups have already been assigned for this zone', {
        zoneId: input.zoneId,
      });
    }
    const zoneEntrants = await uow.tx
      .selectFrom('zone_entrants')
      .select('entrant_id')
      .where('zone_id', '=', input.zoneId)
      .execute();
    this.assertAssignmentEntrants(
      assignment,
      zoneEntrants.map((entry) => entry.entrant_id),
      'group',
    );
    const rows = await uow.tx
      .insertInto('groups')
      .values(
        Array.from({ length: groupCount }, (_unused, index) => ({
          group_id: newId(),
          zone_id: input.zoneId,
          number: index + 1,
          name: `Grupo ${index + 1}`,
          draw_seed: replay?.seed ?? null,
          draw_constraints: replay ? JSON.stringify(replay.constraints) : null,
          created_at: new Date(),
          deleted_at: null,
        })),
      )
      .returningAll()
      .execute();
    const groups = rows.map(toGroup);
    const groupByNumber = new Map(groups.map((group) => [group.number, group.groupId]));
    await uow.tx
      .insertInto('group_entrants')
      .values(
        Object.entries(assignment.groups).map(([entrantId, groupNumber]) => ({
          group_id: groupByNumber.get(groupNumber) as string,
          entrant_id: entrantId,
        })),
      )
      .execute();
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'zone',
      entityId: input.zoneId,
      action: replay ? 'groups.drawn' : 'groups.manually-assigned',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { assignment, ...(replay ?? {}) },
    });
    return groups;
  }

  assertGroupAssignment(assignment: GroupAssignment, count: number): void {
    if (!Number.isInteger(count) || count < 1 || Object.keys(assignment.groups).length === 0) {
      throw new InvariantViolationError(
        'A zone/group assignment needs at least one numbered group',
        {
          count,
        },
      );
    }
    for (const position of Object.values(assignment.groups)) {
      if (!Number.isInteger(position) || position < 1 || position > count) {
        throw new InvariantViolationError(
          `Assignment position ${position} is outside 1..${count}`,
          {
            position,
            count,
          },
        );
      }
    }
  }

  assertAssignmentEntrants(
    assignment: GroupAssignment,
    expectedEntrantIds: readonly string[],
    kind: 'group',
  ): void {
    const supplied = Object.keys(assignment.groups).sort();
    const expected = [...expectedEntrantIds].sort();
    if (
      supplied.length !== expected.length ||
      supplied.some((entrantId, index) => entrantId !== expected[index])
    ) {
      throw new InvariantViolationError(
        `A ${kind} draw must assign every entrant in its source zone exactly once`,
        { expectedEntrantIds: expected, assignedEntrantIds: supplied },
      );
    }
  }
}
