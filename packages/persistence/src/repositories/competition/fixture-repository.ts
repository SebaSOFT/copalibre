import type { Fixture } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import { InvariantViolationError, NotFoundError } from '../../errors.js';
import { newId } from '../../ids.js';
import { toFixture, toMatch } from '../../mapping.js';
import type { Database } from '../../schema.js';
import type { UnitOfWork } from '../../transaction.js';
import type { PersistedFixtureNode } from '../../fixture-graph.js';
import type { AuditContext } from '../enrollment-repository.js';
import { lockRowsForMutation } from '../../row-lock.js';
import { ZoneGroupRepository } from './zone-group-repository.js';

/** Fixtures: fixture lists, fixture plans, fixture graphs, and surplus annulment and reinstatement. */
export class FixtureRepository {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly zoneGroups: ZoneGroupRepository,
  ) {}

  async resolveFixtureScope(
    uow: UnitOfWork,
    input: { readonly stageId: string } & AuditContext,
    fixture: { readonly zoneId?: string; readonly groupId?: string },
  ): Promise<{ readonly zoneId: string; readonly groupId: string }> {
    if (fixture.groupId) {
      const group = await uow.tx
        .selectFrom('groups')
        .innerJoin('zones', 'zones.zone_id', 'groups.zone_id')
        .select(['groups.group_id', 'groups.zone_id', 'zones.stage_id'])
        .where('groups.group_id', '=', fixture.groupId)
        .where('groups.deleted_at', 'is', null)
        .where('zones.deleted_at', 'is', null)
        .executeTakeFirst();
      if (!group || group.stage_id !== input.stageId) {
        throw new NotFoundError(
          `Group ${fixture.groupId} does not belong to stage ${input.stageId}`,
          {
            groupId: fixture.groupId,
            stageId: input.stageId,
          },
        );
      }
      if (fixture.zoneId && fixture.zoneId !== group.zone_id) {
        throw new InvariantViolationError('Fixture group does not belong to its declared zone', {
          groupId: fixture.groupId,
          zoneId: fixture.zoneId,
        });
      }
      return { zoneId: group.zone_id, groupId: group.group_id };
    }

    const zoneId =
      fixture.zoneId ?? (await this.zoneGroups.currentOrImplicitZone(uow, input)).zoneId;
    if (fixture.zoneId) {
      const zone = await uow.tx
        .selectFrom('zones')
        .select('zone_id')
        .where('zone_id', '=', zoneId)
        .where('stage_id', '=', input.stageId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst();
      if (!zone) {
        throw new NotFoundError(`Zone ${zoneId} does not belong to stage ${input.stageId}`, {
          zoneId,
          stageId: input.stageId,
        });
      }
    }
    const group = await this.zoneGroups.currentOrImplicitGroup(uow, { ...input, zoneId });
    return { zoneId, groupId: group.groupId };
  }

  async assertLegacyFixtureWritesAllowed(
    uow: UnitOfWork,
    stageId: string,
    zoneIds?: readonly string[],
  ): Promise<void> {
    let query = uow.tx
      .selectFrom('fixtures')
      .select(['fixture_id', 'zone_id'])
      .where('stage_id', '=', stageId)
      .where('node_key', 'is not', null);
    if (zoneIds !== undefined) query = query.where('zone_id', 'in', [...zoneIds]);
    const persisted = await query.executeTakeFirst();
    if (persisted) {
      throw new InvariantViolationError(
        'Legacy fixture writes cannot modify a persisted fixture graph',
        { stageId, zoneId: persisted.zone_id },
      );
    }
  }

  async insertFixtureGraph(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly zoneId: string;
      readonly nodes: readonly PersistedFixtureNode[];
    } & AuditContext,
  ): Promise<readonly Fixture[]> {
    const nodeKeys = new Set<string>();
    for (const node of input.nodes) {
      if (nodeKeys.has(node.nodeKey)) {
        throw new InvariantViolationError('Fixture graph node keys must be unique', {
          nodeKey: node.nodeKey,
        });
      }
      if (!Number.isInteger(node.seriesSpan) || node.seriesSpan < 1) {
        throw new InvariantViolationError('Fixture graph series span must be a positive integer', {
          nodeKey: node.nodeKey,
          seriesSpan: node.seriesSpan,
        });
      }
      nodeKeys.add(node.nodeKey);
    }
    // Edges name node keys, never fixture ids, so each must name a node of this same graph.
    for (const node of input.nodes) {
      for (const side of node.sides) {
        if ('matchId' in side && !nodeKeys.has(side.matchId)) {
          throw new InvariantViolationError('Fixture graph edge names an unknown node', {
            nodeKey: node.nodeKey,
            source: side,
          });
        }
      }
    }

    const scope = await this.resolveFixtureScope(uow, input, { zoneId: input.zoneId });
    const nodeByKey = new Map(input.nodes.map((node) => [node.nodeKey, node]));

    const rows = await uow.tx
      .insertInto('fixtures')
      .values(
        input.nodes.map((node) => ({
          fixture_id: newId(),
          stage_id: input.stageId,
          zone_id: scope.zoneId,
          group_id: scope.groupId,
          round: node.round,
          role: null,
          node_key: node.nodeKey,
          bracket: node.bracket,
          position: node.position,
          branch: node.branch ?? null,
          label: node.label ?? null,
          home_source: JSON.stringify(node.sides[0]),
          away_source: JSON.stringify(node.sides[1]),
          contingency: node.contingency ?? null,
          home_entrant_id: null,
          away_entrant_id: null,
          created_at: new Date(),
        })),
      )
      .returningAll()
      .execute();
    const fixtures = rows.map(toFixture);
    // `RETURNING` order is not guaranteed (SQLite), so rows are matched to nodes by key.
    const matchRows = rows.flatMap((row) => {
      const node = row.node_key === null ? undefined : nodeByKey.get(row.node_key);
      if (!node) return [];
      return Array.from({ length: node.seriesSpan }, (_, index) => ({
        match_id: newId(),
        fixture_id: row.fixture_id,
        number: index + 1,
        status: 'scheduled' as const,
        result: null,
        created_at: new Date(),
      }));
    });
    if (matchRows.length > 0) {
      await uow.tx.insertInto('matches').values(matchRows).execute();
      for (const match of matchRows) {
        await uow.recordAudit({
          organizationId: input.organizationId,
          entityType: 'match',
          entityId: match.match_id,
          action: 'match.created',
          actor: input.actor,
          authorizationContext: input.authorizationContext,
          resultingState: { ...toMatch(match) },
        });
      }
    }
    return fixtures;
  }

  /** Bulk fixture insert — the shape the generator will hand over. */
  async createFixtures(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly matchCount?: number;
      readonly fixtures: readonly {
        readonly round: number;
        readonly homeEntrantId?: string;
        readonly awayEntrantId?: string;
        readonly zoneId?: string;
        readonly groupId?: string;
        readonly role?: string;
        readonly matchCount?: number;
      }[];
    } & AuditContext,
  ): Promise<readonly Fixture[]> {
    if (input.fixtures.length === 0) {
      throw new InvariantViolationError('Cannot create an empty fixture set', {
        stageId: input.stageId,
      });
    }

    // Scope creation is intentionally ordered: the first unscoped fixture may
    // create the implicit zone/group, which every later fixture in this same
    // transaction must then reuse.
    const scopedFixtures = [] as Array<
      (typeof input.fixtures)[number] & { readonly zoneId: string; readonly groupId: string }
    >;
    for (const fixture of input.fixtures) {
      scopedFixtures.push({
        ...fixture,
        ...(await this.resolveFixtureScope(uow, input, fixture)),
      });
    }
    await this.assertLegacyFixtureWritesAllowed(
      uow,
      input.stageId,
      scopedFixtures.map((fixture) => fixture.zoneId),
    );
    const rows = await uow.tx
      .insertInto('fixtures')
      .values(
        scopedFixtures.map((fixture) => ({
          fixture_id: newId(),
          stage_id: input.stageId,
          zone_id: fixture.zoneId,
          group_id: fixture.groupId,
          round: fixture.round,
          role: fixture.role ?? null,
          home_entrant_id: fixture.homeEntrantId ?? null,
          away_entrant_id: fixture.awayEntrantId ?? null,
          created_at: new Date(),
        })),
      )
      .returningAll()
      .execute();

    const fixtures = rows.map(toFixture);

    if (fixtures.length > 0) {
      const matchRows = fixtures.flatMap((fixture, fixtureIndex) => {
        const count = input.fixtures[fixtureIndex]?.matchCount ?? input.matchCount ?? 1;
        return Array.from({ length: count }, (_, mIdx) => ({
          match_id: newId(),
          fixture_id: fixture.fixtureId,
          number: mIdx + 1,
          status: 'scheduled' as const,
          result: null,
          created_at: new Date(),
        }));
      });
      await uow.tx.insertInto('matches').values(matchRows).execute();

      for (const m of matchRows) {
        await uow.recordAudit({
          organizationId: input.organizationId,
          entityType: 'match',
          entityId: m.match_id,
          action: 'match.created',
          actor: input.actor,
          authorizationContext: input.authorizationContext,
          resultingState: { ...toMatch(m) },
        });
      }
    }

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'stage',
      entityId: input.stageId,
      action: 'fixtures.generated',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { fixtureCount: fixtures.length },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `stage:${input.stageId}`,
      entityId: input.stageId,
      eventType: 'fixtures.generated',
      projectionVersion: 1,
      payload: { stageId: input.stageId, fixtureCount: fixtures.length },
    });

    return fixtures;
  }

  /**
   * Every generated fixture of a stage, with its real `fixtureId` — what a
   * schedule builder assigns a time and venue to. Distinct from the bracket
   * graph's own node ids (`packages/tournament-engine`'s `match.id`), which
   * are never persisted and never equal a `fixtureId`.
   */
  /**
   * The zone one fixture belongs to — all a caller needs to pick the zone's own series declaration
   * without listing the stage's fixtures. `undefined` for a fixture that does not exist.
   */
  async findFixtureZoneId(fixtureId: string, uow?: UnitOfWork): Promise<string | undefined> {
    const row = await (uow?.tx ?? this.db)
      .selectFrom('fixtures')
      .select('zone_id')
      .where('fixture_id', '=', fixtureId)
      .executeTakeFirst();
    return row?.zone_id ?? undefined;
  }

  /** The zone a group belongs to, or `undefined` for a group that does not exist. */
  async findGroupZoneId(groupId: string): Promise<string | undefined> {
    const row = await this.db
      .selectFrom('groups')
      .innerJoin('zones', 'zones.zone_id', 'groups.zone_id')
      .select('groups.zone_id')
      .where('groups.group_id', '=', groupId)
      .where('groups.deleted_at', 'is', null)
      .where('zones.deleted_at', 'is', null)
      .executeTakeFirst();
    return row?.zone_id;
  }

  async listFixturesOfStage(stageId: string, uow?: UnitOfWork): Promise<readonly Fixture[]> {
    const rows = await (uow?.tx ?? this.db)
      .selectFrom('fixtures')
      .selectAll()
      .where('stage_id', '=', stageId)
      .orderBy('round')
      .execute();
    return rows.map(toFixture);
  }

  /**
   * Replaces a stage's fixture graph in place — the write side of reseeding.
   * Only reachable once `classifyEngineMutation` has already refused a
   * `blocked_after_results` request. Guarded against matches that have
   * progressed beyond scheduled or have results recorded.
   */
  async replaceFixtures(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly matchCount?: number;
      readonly fixtures: readonly {
        readonly round: number;
        readonly homeEntrantId?: string;
        readonly awayEntrantId?: string;
        readonly zoneId?: string;
        readonly groupId?: string;
        readonly matchCount?: number;
      }[];
    } & AuditContext,
  ): Promise<readonly Fixture[]> {
    if (input.fixtures.length === 0) {
      throw new InvariantViolationError('Cannot replace a fixture set with an empty one', {
        stageId: input.stageId,
      });
    }

    await this.assertLegacyFixtureWritesAllowed(uow, input.stageId);

    const attached = await uow.tx
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select('matches.match_id')
      .where('fixtures.stage_id', '=', input.stageId)
      .where((eb) =>
        eb.or([eb('matches.status', '!=', 'scheduled'), eb('matches.result', 'is not', null)]),
      )
      .executeTakeFirst();
    if (attached) {
      throw new InvariantViolationError(
        'Cannot replace fixtures once a match has started or recorded results',
        { stageId: input.stageId },
      );
    }

    const previousCount = await uow.tx
      .selectFrom('fixtures')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('stage_id', '=', input.stageId)
      .executeTakeFirstOrThrow();

    const stageFixtureIds = uow.tx
      .selectFrom('fixtures')
      .select('fixture_id')
      .where('stage_id', '=', input.stageId);

    await uow.tx.deleteFrom('matches').where('fixture_id', 'in', stageFixtureIds).execute();
    await uow.tx.deleteFrom('fixtures').where('stage_id', '=', input.stageId).execute();

    const scopedFixtures = await Promise.all(
      input.fixtures.map(async (fixture) => ({
        ...fixture,
        ...(await this.resolveFixtureScope(uow, input, fixture)),
      })),
    );
    const rows = await uow.tx
      .insertInto('fixtures')
      .values(
        scopedFixtures.map((fixture) => ({
          fixture_id: newId(),
          stage_id: input.stageId,
          zone_id: fixture.zoneId,
          group_id: fixture.groupId,
          round: fixture.round,
          home_entrant_id: fixture.homeEntrantId ?? null,
          away_entrant_id: fixture.awayEntrantId ?? null,
          created_at: new Date(),
        })),
      )
      .returningAll()
      .execute();

    const fixtures = rows.map(toFixture);

    if (fixtures.length > 0) {
      const matchRows = fixtures.flatMap((fixture, fixtureIndex) => {
        const count = input.fixtures[fixtureIndex]?.matchCount ?? input.matchCount ?? 1;
        return Array.from({ length: count }, (_, mIdx) => ({
          match_id: newId(),
          fixture_id: fixture.fixtureId,
          number: mIdx + 1,
          status: 'scheduled' as const,
          result: null,
          created_at: new Date(),
        }));
      });
      await uow.tx.insertInto('matches').values(matchRows).execute();
    }

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'stage',
      entityId: input.stageId,
      action: 'fixtures.regenerated',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { fixtureCount: previousCount.count },
      resultingState: { fixtureCount: fixtures.length },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `stage:${input.stageId}`,
      entityId: input.stageId,
      eventType: 'fixtures.regenerated',
      projectionVersion: 1,
      payload: { stageId: input.stageId, fixtureCount: fixtures.length },
    });

    return fixtures;
  }

  /** Publishes a complete stage draw, including stages mixing elimination and legacy formats. */
  async publishFixturePlans(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly plans: readonly {
        readonly zoneId?: string;
        readonly nodes?: readonly PersistedFixtureNode[];
        readonly fixtures?: readonly {
          readonly round: number;
          readonly homeEntrantId?: string;
          readonly awayEntrantId?: string;
        }[];
        readonly matchCount?: number;
      }[];
    } & AuditContext,
  ): Promise<readonly Fixture[]> {
    if (
      input.plans.length === 0 ||
      input.plans.some((plan) => (plan.nodes?.length ?? plan.fixtures?.length ?? 0) === 0)
    ) {
      throw new InvariantViolationError('A stage draw must contain non-empty fixture plans', {
        stageId: input.stageId,
      });
    }
    await lockRowsForMutation(
      this.db,
      uow.tx.selectFrom('stages').select('stage_id').where('stage_id', '=', input.stageId),
    ).executeTakeFirstOrThrow();
    const previous = await lockRowsForMutation(
      this.db,
      uow.tx
        .selectFrom('matches')
        .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
        .select(['matches.match_id', 'matches.status', 'matches.result'])
        .where('fixtures.stage_id', '=', input.stageId)
        .orderBy('matches.match_id'),
    ).execute();
    if (previous.some((match) => match.status !== 'scheduled' || match.result !== null)) {
      throw new InvariantViolationError(
        'Cannot replace fixtures once a match has started or recorded results',
        { stageId: input.stageId },
      );
    }
    const fixtureIds = uow.tx
      .selectFrom('fixtures')
      .select('fixture_id')
      .where('stage_id', '=', input.stageId);
    await uow.tx.deleteFrom('matches').where('fixture_id', 'in', fixtureIds).execute();
    await uow.tx.deleteFrom('fixtures').where('stage_id', '=', input.stageId).execute();
    const fixtures: Fixture[] = [];
    // Materialize implicit groups for every zone before the first fixture makes structure immutable.
    for (const plan of input.plans) await this.resolveFixtureScope(uow, input, plan);
    // Legacy writes run before graph writes, preserving their prohibition on writing graph entrants.
    const legacy = input.plans.flatMap((plan) =>
      (plan.fixtures ?? []).map((fixture) => ({
        ...fixture,
        ...(plan.zoneId === undefined ? {} : { zoneId: plan.zoneId }),
        ...(plan.matchCount === undefined ? {} : { matchCount: plan.matchCount }),
      })),
    );
    if (legacy.length > 0)
      fixtures.push(...(await this.createFixtures(uow, { ...input, fixtures: legacy })));
    for (const plan of input.plans) {
      if (plan.nodes === undefined) continue;
      const scope = await this.resolveFixtureScope(uow, input, plan);
      fixtures.push(
        ...(await this.createFixtureGraph(uow, {
          ...input,
          zoneId: scope.zoneId,
          nodes: plan.nodes,
        })),
      );
    }
    if (previous.length > 0) {
      await uow.recordAudit({
        organizationId: input.organizationId,
        entityType: 'stage',
        entityId: input.stageId,
        action: 'fixtures.regenerated',
        actor: input.actor,
        authorizationContext: input.authorizationContext,
        previousState: { matchIds: previous.map((match) => match.match_id) },
        resultingState: { fixtureCount: fixtures.length },
      });
      await uow.publishEvent({
        organizationId: input.organizationId,
        stream: `stage:${input.stageId}`,
        entityId: input.stageId,
        eventType: 'fixtures.regenerated',
        projectionVersion: 1,
        payload: { stageId: input.stageId, fixtureCount: fixtures.length },
      });
    }
    return fixtures;
  }

  /** Persists every node and its complete series span for one zone. */
  async createFixtureGraph(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly zoneId: string;
      readonly nodes: readonly PersistedFixtureNode[];
    } & AuditContext,
  ): Promise<readonly Fixture[]> {
    if (input.nodes.length === 0) {
      throw new InvariantViolationError('Cannot create an empty fixture graph', {
        stageId: input.stageId,
        zoneId: input.zoneId,
      });
    }

    const existing = await uow.tx
      .selectFrom('fixtures')
      .select('fixture_id')
      .where('stage_id', '=', input.stageId)
      .where('zone_id', '=', input.zoneId)
      .executeTakeFirst();
    if (existing) {
      throw new InvariantViolationError('Fixture graph already exists for this zone', {
        stageId: input.stageId,
        zoneId: input.zoneId,
      });
    }

    const fixtures = await this.insertFixtureGraph(uow, input);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'stage',
      entityId: input.stageId,
      action: 'fixtures.generated',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { fixtureCount: fixtures.length, zoneId: input.zoneId },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `stage:${input.stageId}`,
      entityId: input.stageId,
      eventType: 'fixtures.generated',
      projectionVersion: 1,
      payload: { stageId: input.stageId, fixtureCount: fixtures.length },
    });
    return fixtures;
  }

  /** Replaces one zone's complete graph only while none of its matches progressed. */
  async replaceFixtureGraph(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly zoneId: string;
      readonly nodes: readonly PersistedFixtureNode[];
    } & AuditContext,
  ): Promise<readonly Fixture[]> {
    if (input.nodes.length === 0) {
      throw new InvariantViolationError('Cannot replace a fixture graph with an empty graph', {
        stageId: input.stageId,
        zoneId: input.zoneId,
      });
    }

    const attached = await uow.tx
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select('matches.match_id')
      .where('fixtures.stage_id', '=', input.stageId)
      .where('fixtures.zone_id', '=', input.zoneId)
      .where((eb) =>
        eb.or([eb('matches.status', '!=', 'scheduled'), eb('matches.result', 'is not', null)]),
      )
      .executeTakeFirst();
    if (attached) {
      throw new InvariantViolationError(
        'Cannot replace fixtures once a match has started or recorded results',
        { stageId: input.stageId, zoneId: input.zoneId },
      );
    }

    const previous = await uow.tx
      .selectFrom('fixtures')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('stage_id', '=', input.stageId)
      .where('zone_id', '=', input.zoneId)
      .executeTakeFirstOrThrow();
    const zoneFixtureIds = uow.tx
      .selectFrom('fixtures')
      .select('fixture_id')
      .where('stage_id', '=', input.stageId)
      .where('zone_id', '=', input.zoneId);

    await uow.tx.deleteFrom('matches').where('fixture_id', 'in', zoneFixtureIds).execute();
    await uow.tx
      .deleteFrom('fixtures')
      .where('stage_id', '=', input.stageId)
      .where('zone_id', '=', input.zoneId)
      .execute();

    const fixtures = await this.insertFixtureGraph(uow, input);
    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'stage',
      entityId: input.stageId,
      action: 'fixtures.regenerated',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { fixtureCount: previous.count, zoneId: input.zoneId },
      resultingState: { fixtureCount: fixtures.length, zoneId: input.zoneId },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `stage:${input.stageId}`,
      entityId: input.stageId,
      eventType: 'fixtures.regenerated',
      projectionVersion: 1,
      payload: { stageId: input.stageId, fixtureCount: fixtures.length },
    });
    return fixtures;
  }
}
