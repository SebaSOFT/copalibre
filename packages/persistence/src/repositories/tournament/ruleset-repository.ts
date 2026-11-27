import {
  compileEffectiveRuleset,
  matchCounterOverrideViolations,
  RulesetCompilationError,
  evaluateCustomScriptsMutation,
  validateHookScriptAttachment,
  type HookScriptAttachment,
  type MatchRuleset,
  type OverrideSet,
  type StageAllocation,
  type StageConfiguration,
  type TournamentRuleset,
} from '@copalibre/domain';
import type { Kysely, Transaction } from 'kysely';
import { InvariantViolationError, NotFoundError } from '../../errors.js';
import { newId } from '../../ids.js';
import type { Database } from '../../schema.js';
import type { UnitOfWork } from '../../transaction.js';
import { type CreateRulesetInput } from './tournament-support.js';

/** Versioned rulesets and stage configurations. */
export class RulesetRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Creates a tournament ruleset version. The effective ruleset is compiled
   * before any INSERT: a forbidden/inherited/unknown override or an undeclared
   * deep merge fails here, not in the database.
   */
  async createRuleset(
    uow: UnitOfWork,
    input: CreateRulesetInput,
  ): Promise<{ readonly ruleset: TournamentRuleset; readonly effective: MatchRuleset }> {
    if (typeof input.overrides['registration.capacity'] === 'number') {
      const newCapacity = input.overrides['registration.capacity'] as number;
      const acceptedRows = await uow.tx
        .selectFrom('entrants')
        .select('entrant_id')
        .where('tournament_id', '=', input.tournamentId)
        .where('status', '=', 'accepted')
        .execute();
      if (newCapacity < acceptedRows.length) {
        throw new InvariantViolationError(
          `Cannot reduce tournament capacity to ${newCapacity}: tournament already has ${acceptedRows.length} accepted entrants.`,
          { tournamentId: input.tournamentId, newCapacity, acceptedCount: acceptedRows.length },
        );
      }
    }

    const previous = await this.latestRulesetVersion(uow.tx, input.tournamentId);
    const version = previous + 1;
    const rulesetId =
      previous === 0 ? newId() : await this.rulesetIdFor(uow.tx, input.tournamentId);

    if (input.customScripts) {
      for (const attachment of input.customScripts) {
        const valid = validateHookScriptAttachment(attachment);
        if (!valid.ok) {
          throw new InvariantViolationError(valid.error.message, {
            hook: attachment.hook,
          });
        }
      }
    }

    if (previous > 0 && input.customScripts !== undefined) {
      const recordedMatch = await uow.tx
        .selectFrom('matches')
        .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
        .innerJoin('stages', 'stages.stage_id', 'fixtures.stage_id')
        .innerJoin('seasons', 'seasons.season_id', 'stages.season_id')
        .select('match_id')
        .where('seasons.tournament_id', '=', input.tournamentId)
        .where('matches.result', 'is not', null)
        .limit(1)
        .executeTakeFirst();
      const mutationResult = evaluateCustomScriptsMutation({
        hasRecordedResults: recordedMatch !== undefined,
      });
      if (!mutationResult.ok) {
        throw new InvariantViolationError(mutationResult.error.message, {
          fieldPath: 'customScripts',
        });
      }
    }

    let customScriptsToPersist = input.customScripts ?? [];
    if (input.customScripts === undefined && previous > 0) {
      const previousRow = await uow.tx
        .selectFrom('tournament_rulesets')
        .select('custom_scripts')
        .where('ruleset_id', '=', rulesetId)
        .where('version', '=', previous)
        .executeTakeFirst();
      if (previousRow?.custom_scripts) {
        const raw = previousRow.custom_scripts;
        customScriptsToPersist = typeof raw === 'string' ? JSON.parse(raw) : raw;
      }
    }

    const candidate: TournamentRuleset = {
      rulesetId,
      tournamentId: input.tournamentId,
      version,
      descriptorRef: {
        descriptorId: input.descriptor.descriptorId,
        version: input.descriptor.version,
      },
      overrides: input.overrides,
      customScripts: customScriptsToPersist,
    };

    // A malformed match-counter override is refused here, on write, together with every other violation
    // the compile finds. Compilation itself skips it on read.
    const counterViolations = matchCounterOverrideViolations(input.descriptor, input.overrides);
    const compiled = compileEffectiveRuleset(input.descriptor, candidate);
    const violations = [...counterViolations, ...(compiled.ok ? [] : compiled.error.violations)];
    if (!compiled.ok || violations.length > 0) {
      const error = new RulesetCompilationError(violations);
      throw new InvariantViolationError(error.message, { violations });
    }

    await uow.tx
      .insertInto('tournament_rulesets')
      .values({
        ruleset_id: rulesetId,
        tournament_id: input.tournamentId,
        version,
        descriptor_id: input.descriptor.descriptorId,
        descriptor_version: input.descriptor.version,
        overrides: JSON.stringify(input.overrides),
        custom_scripts: JSON.stringify(customScriptsToPersist),
        created_at: new Date(),
      })
      .execute();

    await uow.tx
      .updateTable('tournaments')
      .set({ ruleset_id: rulesetId })
      .where('tournament_id', '=', input.tournamentId)
      .execute();

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'tournament-ruleset',
      entityId: rulesetId,
      action: 'ruleset.versioned',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: previous === 0 ? undefined : { version: previous },
      resultingState: {
        version,
        overrides: { ...input.overrides },
        customScripts: customScriptsToPersist,
      },
      reason: input.reason,
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `tournament:${input.tournamentId}`,
      entityId: rulesetId,
      eventType: 'ruleset.versioned',
      projectionVersion: version,
      payload: { rulesetId, version },
    });

    return { ruleset: candidate, effective: compiled.value };
  }

  async createStageConfiguration(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly rulesetId: string;
      readonly organizationId: string;
      readonly overrides: OverrideSet;
      readonly allocation?: StageAllocation;
      readonly groupConfiguration?: import('@copalibre/domain').StageGroupConfiguration;
      readonly actor: string;
      readonly authorizationContext: string;
    },
  ): Promise<StageConfiguration> {
    const stageConfigurationId = newId();
    const configuration: StageConfiguration = {
      stageConfigurationId,
      stageId: input.stageId,
      version: 1,
      rulesetId: input.rulesetId,
      overrides: input.overrides,
      ...(input.allocation === undefined ? {} : { allocation: input.allocation }),
      ...(input.groupConfiguration === undefined
        ? {}
        : { groupConfiguration: input.groupConfiguration }),
    };

    await uow.tx
      .insertInto('stage_configurations')
      .values({
        stage_configuration_id: stageConfigurationId,
        stage_id: input.stageId,
        version: 1,
        ruleset_id: input.rulesetId,
        overrides: JSON.stringify(input.overrides),
        allocation: input.allocation === undefined ? null : JSON.stringify(input.allocation),
        group_configuration:
          input.groupConfiguration === undefined ? null : JSON.stringify(input.groupConfiguration),
        created_at: new Date(),
      })
      .execute();

    await uow.tx
      .updateTable('stages')
      .set({ stage_configuration_id: stageConfigurationId })
      .where('stage_id', '=', input.stageId)
      .execute();

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'stage-configuration',
      entityId: stageConfigurationId,
      action: 'stage-configuration.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...configuration },
    });

    return configuration;
  }

  /**
   * Versions a stage's configuration the way `createStageConfiguration` writes
   * `version: 1` — merges the changed field(s) into the current version's
   * `overrides` and inserts a new row, never mutating a prior version in
   * place. Requires an existing configuration; a stage with none yet is
   * created via `createStageConfiguration` instead.
   */
  async updateStageConfiguration(
    uow: UnitOfWork,
    input: {
      readonly stageId: string;
      readonly organizationId: string;
      readonly changedOverrides: OverrideSet;
      /** Absent leaves the prior version's allocation unchanged; `null` clears it. */
      readonly allocation?: StageAllocation | null;
      /** Absent preserves the prior group configuration; `null` clears it. */
      readonly groupConfiguration?: import('@copalibre/domain').StageGroupConfiguration | null;
      readonly actor: string;
      readonly authorizationContext: string;
    },
  ): Promise<StageConfiguration> {
    const previous = await uow.tx
      .selectFrom('stage_configurations')
      .selectAll()
      .where('stage_id', '=', input.stageId)
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirst();
    if (!previous) {
      throw new NotFoundError(`Stage ${input.stageId} has no configuration to edit`, {
        stageId: input.stageId,
      });
    }

    const rawPrevious = previous.overrides;
    const previousOverrides =
      typeof rawPrevious === 'string' ? JSON.parse(rawPrevious) : (rawPrevious ?? {});
    const mergedOverrides = { ...previousOverrides, ...input.changedOverrides };
    const rawPreviousAllocation = previous.allocation;
    const previousAllocation =
      typeof rawPreviousAllocation === 'string'
        ? (JSON.parse(rawPreviousAllocation) as StageAllocation)
        : ((rawPreviousAllocation ?? undefined) as StageAllocation | undefined);
    const nextAllocation = input.allocation === undefined ? previousAllocation : input.allocation;
    const rawGroupConfiguration = previous.group_configuration;
    const previousGroupConfiguration =
      typeof rawGroupConfiguration === 'string'
        ? JSON.parse(rawGroupConfiguration)
        : (rawGroupConfiguration ?? undefined);
    const nextGroupConfiguration =
      input.groupConfiguration === undefined
        ? previousGroupConfiguration
        : (input.groupConfiguration ?? undefined);
    const version = previous.version + 1;
    const stageConfigurationId = newId();
    const configuration: StageConfiguration = {
      stageConfigurationId,
      stageId: input.stageId,
      version,
      rulesetId: previous.ruleset_id,
      overrides: mergedOverrides,
      ...(nextAllocation === null || nextAllocation === undefined
        ? {}
        : { allocation: nextAllocation }),
      ...(nextGroupConfiguration === undefined
        ? {}
        : { groupConfiguration: nextGroupConfiguration }),
    };

    await uow.tx
      .insertInto('stage_configurations')
      .values({
        stage_configuration_id: stageConfigurationId,
        stage_id: input.stageId,
        version,
        ruleset_id: previous.ruleset_id,
        overrides: JSON.stringify(mergedOverrides),
        allocation:
          nextAllocation === null || nextAllocation === undefined
            ? null
            : JSON.stringify(nextAllocation),
        group_configuration:
          nextGroupConfiguration === undefined ? null : JSON.stringify(nextGroupConfiguration),
        created_at: new Date(),
      })
      .execute();

    await uow.tx
      .updateTable('stages')
      .set({ stage_configuration_id: stageConfigurationId })
      .where('stage_id', '=', input.stageId)
      .execute();

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'stage-configuration',
      entityId: stageConfigurationId,
      action: 'stage-configuration.updated',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: {
        version: previous.version,
        overrides: previousOverrides,
        ...(previousGroupConfiguration === undefined
          ? {}
          : { groupConfiguration: previousGroupConfiguration }),
      },
      resultingState: {
        version,
        overrides: mergedOverrides,
        ...(nextGroupConfiguration === undefined
          ? {}
          : { groupConfiguration: nextGroupConfiguration }),
      },
    });

    return configuration;
  }

  async findLatestRuleset(tournamentId: string): Promise<TournamentRuleset | undefined> {
    const row = await this.db
      .selectFrom('tournament_rulesets')
      .selectAll()
      .where('tournament_id', '=', tournamentId)
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirst();

    if (!row) return undefined;

    const rawOverrides = row.overrides;
    const overrides =
      typeof rawOverrides === 'string' ? JSON.parse(rawOverrides) : (rawOverrides ?? {});
    const rawScripts = row.custom_scripts;
    const customScripts = rawScripts
      ? typeof rawScripts === 'string'
        ? JSON.parse(rawScripts)
        : rawScripts
      : [];

    return {
      rulesetId: row.ruleset_id,
      tournamentId: row.tournament_id,
      version: row.version,
      descriptorRef: {
        descriptorId: row.descriptor_id,
        version: row.descriptor_version,
      },
      overrides: overrides as Record<string, unknown>,
      customScripts: customScripts as readonly HookScriptAttachment[],
    };
  }

  async findLatestStageConfiguration(stageId: string): Promise<StageConfiguration | undefined> {
    const row = await this.db
      .selectFrom('stage_configurations')
      .selectAll()
      .where('stage_id', '=', stageId)
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirst();

    if (!row) return undefined;
    const rawOverrides = row.overrides;
    const overrides =
      typeof rawOverrides === 'string' ? JSON.parse(rawOverrides) : (rawOverrides ?? {});
    const rawAllocation = row.allocation;
    const allocation =
      typeof rawAllocation === 'string'
        ? (JSON.parse(rawAllocation) as StageAllocation)
        : (rawAllocation as StageAllocation | null);
    return {
      stageConfigurationId: row.stage_configuration_id,
      stageId: row.stage_id,
      version: row.version,
      rulesetId: row.ruleset_id,
      overrides: overrides as Record<string, unknown>,
      ...(allocation === null || allocation === undefined ? {} : { allocation }),
      ...(row.group_configuration === null || row.group_configuration === undefined
        ? {}
        : {
            groupConfiguration:
              typeof row.group_configuration === 'string'
                ? JSON.parse(row.group_configuration)
                : row.group_configuration,
          }),
    };
  }

  /**
   * Reads through the caller's own executor rather than `this.db`: called
   * from inside `createRuleset`'s open transaction, and a second connection
   * acquisition against the same underlying connection deadlocks under
   * SQLite's single-connection test dialect — Postgres's pool masked
   * this because a "second" connection was always available to hand out.
   */
  async latestRulesetVersion(
    executor: Kysely<Database> | Transaction<Database>,
    tournamentId: string,
  ): Promise<number> {
    const row = await executor
      .selectFrom('tournament_rulesets')
      .select('version')
      .where('tournament_id', '=', tournamentId)
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirst();
    return row?.version ?? 0;
  }

  async rulesetIdFor(
    executor: Kysely<Database> | Transaction<Database>,
    tournamentId: string,
  ): Promise<string> {
    const row = await executor
      .selectFrom('tournament_rulesets')
      .select('ruleset_id')
      .where('tournament_id', '=', tournamentId)
      .limit(1)
      .executeTakeFirst();
    return row?.ruleset_id ?? newId();
  }
}
