import {
  Alias,
  compileEffectiveRuleset,
  resolveLabel,
  transitionTournament,
  type DisciplineDescriptor,
  type MatchRuleset,
  type OverrideSet,
  type StageConfiguration,
  type Tournament,
  type TournamentRuleset,
} from '@copalibre/domain';
import type { Kysely, Transaction } from 'kysely';
import { InvariantViolationError, NotFoundError } from '../errors.js';
import { newId } from '../ids.js';
import { toTournament } from '../mapping.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';

export interface CreateTournamentInput {
  readonly organizationId: string;
  readonly alias: string;
  readonly name: string;
  readonly descriptor: DisciplineDescriptor;
  readonly actor: string;
  readonly authorizationContext: string;
}

export interface CreateRulesetInput {
  readonly tournamentId: string;
  readonly organizationId: string;
  readonly descriptor: DisciplineDescriptor;
  readonly overrides: OverrideSet;
  readonly actor: string;
  readonly authorizationContext: string;
  readonly reason?: string;
}

/**
 * Tournament plus the versioned ruleset hierarchy. Ruleset writes compile the
 * effective ruleset through phase 2's compiler first — an override the
 * descriptor forbids never reaches the database.
 */
export class TournamentRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async saveDescriptor(
    uow: UnitOfWork,
    descriptor: DisciplineDescriptor,
    context: {
      readonly organizationId: string;
      readonly actor: string;
      readonly authorizationContext: string;
    },
  ): Promise<DisciplineDescriptor> {
    const inserted = await uow.tx
      .insertInto('discipline_descriptors')
      .values({
        descriptor_id: descriptor.descriptorId,
        alias: descriptor.alias,
        version: descriptor.version,
        name: resolveLabel(descriptor.name, 'en'),
        document: JSON.stringify(descriptor),
        created_at: new Date(),
      })
      .onConflict((oc) => oc.columns(['descriptor_id', 'version']).doNothing())
      .returning('descriptor_id')
      .executeTakeFirst();

    if (!inserted) return descriptor;

    await uow.recordAudit({
      organizationId: context.organizationId,
      entityType: 'discipline-descriptor',
      entityId: descriptor.descriptorId,
      action: 'descriptor.published',
      actor: context.actor,
      authorizationContext: context.authorizationContext,
      resultingState: {
        descriptorId: descriptor.descriptorId,
        alias: descriptor.alias,
        version: descriptor.version,
      },
    });
    await uow.publishEvent({
      organizationId: context.organizationId,
      stream: `discipline-descriptor:${descriptor.descriptorId}`,
      entityId: descriptor.descriptorId,
      eventType: 'discipline-descriptor.published',
      projectionVersion: 1,
      payload: {
        descriptorId: descriptor.descriptorId,
        alias: descriptor.alias,
        version: descriptor.version,
      },
    });

    return descriptor;
  }

  async findDescriptor(
    descriptorId: string,
    version: string,
  ): Promise<DisciplineDescriptor | undefined> {
    const row = await this.db
      .selectFrom('discipline_descriptors')
      .select('document')
      .where('descriptor_id', '=', descriptorId)
      .where('version', '=', version)
      .executeTakeFirst();
    return row ? (row.document as unknown as DisciplineDescriptor) : undefined;
  }

  /** Looks up an installed descriptor by its catalogue identity. */
  async findDescriptorByAlias(
    alias: string,
    version: string,
  ): Promise<DisciplineDescriptor | undefined> {
    const row = await this.db
      .selectFrom('discipline_descriptors')
      .select('document')
      .where('alias', '=', alias)
      .where('version', '=', version)
      .executeTakeFirst();
    return row ? (row.document as unknown as DisciplineDescriptor) : undefined;
  }

  /** Every installed version under an alias, used to protect reserved names. */
  async findDescriptorVersionsByAlias(alias: string): Promise<readonly DisciplineDescriptor[]> {
    const rows = await this.db
      .selectFrom('discipline_descriptors')
      .select('document')
      .where('alias', '=', alias)
      .orderBy('version')
      .execute();
    return rows.map((row) => row.document as unknown as DisciplineDescriptor);
  }

  /**
   * Every installed discipline, newest version of each.
   *
   * The wizard reads its options from here rather than from a list in the
   * client: a hardcoded list is a list that disagrees with the installation the
   * day somebody adds a module.
   */
  async listDescriptors(): Promise<
    readonly {
      readonly descriptorId: string;
      readonly version: string;
      readonly document: DisciplineDescriptor;
    }[]
  > {
    const rows = await this.db
      .selectFrom('discipline_descriptors')
      .select(['descriptor_id', 'version', 'document'])
      .orderBy('descriptor_id')
      .orderBy('version', 'desc')
      .execute();

    const newest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) if (!newest.has(row.descriptor_id)) newest.set(row.descriptor_id, row);

    return [...newest.values()].map((row) => ({
      descriptorId: row.descriptor_id,
      version: row.version,
      document: row.document as unknown as DisciplineDescriptor,
    }));
  }

  /**
   * Tournament aliases (started or finished) naming this exact descriptor
   * version — 0036's `module remove` safety check, distinct from
   * `retirableDescriptorVersions`'s catalogue-retirement question: this asks
   * whether *deleting the row* would orphan a reference a tournament record
   * still names, not whether the version is worth keeping in a browsable
   * catalogue.
   */
  async findStartedTournamentAliasesReferencingDescriptor(
    descriptorId: string,
    version: string,
  ): Promise<readonly string[]> {
    const rows = await this.db
      .selectFrom('tournaments')
      .select('alias')
      .where('descriptor_id', '=', descriptorId)
      .where('descriptor_version', '=', version)
      .where('status', 'in', ['started', 'finished'])
      .execute();
    return rows.map((row) => row.alias);
  }

  /** Same question as above, for a profile version. */
  async findStartedTournamentAliasesReferencingProfile(
    profileId: string,
    version: string,
  ): Promise<readonly string[]> {
    const rows = await this.db
      .selectFrom('tournaments')
      .select('alias')
      .where('profile_id', '=', profileId)
      .where('profile_version', '=', version)
      .where('status', 'in', ['started', 'finished'])
      .execute();
    return rows.map((row) => row.alias);
  }

  async create(uow: UnitOfWork, input: CreateTournamentInput): Promise<Tournament> {
    const alias = Alias.create('tournament', input.alias);
    if (!alias.ok) {
      throw new InvariantViolationError(alias.error.message, { alias: input.alias });
    }

    const tournamentId = newId();
    const row = await uow.tx
      .insertInto('tournaments')
      .values({
        tournament_id: tournamentId,
        organization_id: input.organizationId,
        alias: alias.value.value,
        name: input.name,
        descriptor_id: input.descriptor.descriptorId,
        descriptor_version: input.descriptor.version,
        ruleset_id: null,
        status: 'draft',
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    const tournament = toTournament(row);

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'tournament',
      entityId: tournamentId,
      action: 'tournament.created',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      resultingState: { ...tournament },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `tournament:${tournamentId}`,
      entityId: tournamentId,
      eventType: 'tournament.created',
      projectionVersion: 1,
      payload: { tournamentId, alias: tournament.alias, status: tournament.status },
    });

    return tournament;
  }

  /**
   * Creates a tournament ruleset version. The effective ruleset is compiled
   * before any INSERT: a forbidden/inherited/unknown override or an undeclared
   * deep merge fails here, not in the database.
   */
  async createRuleset(
    uow: UnitOfWork,
    input: CreateRulesetInput,
  ): Promise<{ readonly ruleset: TournamentRuleset; readonly effective: MatchRuleset }> {
    const previous = await this.latestRulesetVersion(uow.tx, input.tournamentId);
    const version = previous + 1;
    const rulesetId =
      previous === 0 ? newId() : await this.rulesetIdFor(uow.tx, input.tournamentId);

    const candidate: TournamentRuleset = {
      rulesetId,
      tournamentId: input.tournamentId,
      version,
      descriptorRef: {
        descriptorId: input.descriptor.descriptorId,
        version: input.descriptor.version,
      },
      overrides: input.overrides,
    };

    const compiled = compileEffectiveRuleset(input.descriptor, candidate);
    if (!compiled.ok) {
      throw new InvariantViolationError(compiled.error.message, {
        violations: compiled.error.violations,
      });
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
      resultingState: { version, overrides: { ...input.overrides } },
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
    };

    await uow.tx
      .insertInto('stage_configurations')
      .values({
        stage_configuration_id: stageConfigurationId,
        stage_id: input.stageId,
        version: 1,
        ruleset_id: input.rulesetId,
        overrides: JSON.stringify(input.overrides),
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

  async publish(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly organizationId: string;
      readonly actor: string;
      readonly authorizationContext: string;
    },
  ): Promise<Tournament> {
    const current = await this.findById(input.tournamentId);
    if (!current) {
      throw new NotFoundError(`Tournament ${input.tournamentId} does not exist`, {
        tournamentId: input.tournamentId,
      });
    }

    const row = await uow.tx
      .updateTable('tournaments')
      .set({ status: 'published' })
      .where('tournament_id', '=', input.tournamentId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const published = toTournament(row);

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'tournament',
      entityId: input.tournamentId,
      action: 'tournament.published',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { status: current.status },
      resultingState: { status: published.status },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `tournament:${input.tournamentId}`,
      entityId: input.tournamentId,
      eventType: 'tournament.published',
      projectionVersion: 1,
      payload: { tournamentId: input.tournamentId },
    });

    return published;
  }

  /**
   * Archives a tournament: `finished` → `archived` only. The state
   * machine itself refuses every other starting state, so this never needs
   * its own separate "is this actually done?" check — `transitionTournament`
   * is the single source of truth `publish` predates and does not yet use.
   */
  async archive(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly organizationId: string;
      readonly actor: string;
      readonly authorizationContext: string;
    },
  ): Promise<Tournament> {
    const current = await this.findById(input.tournamentId);
    if (!current) {
      throw new NotFoundError(`Tournament ${input.tournamentId} does not exist`, {
        tournamentId: input.tournamentId,
      });
    }

    const transition = transitionTournament(current.status, 'archived');
    if (!transition.ok) {
      throw new InvariantViolationError(transition.error.message, {
        tournamentId: input.tournamentId,
        from: current.status,
      });
    }

    const row = await uow.tx
      .updateTable('tournaments')
      .set({ status: 'archived', archived_at: new Date() })
      .where('tournament_id', '=', input.tournamentId)
      .returningAll()
      .executeTakeFirstOrThrow();

    const archived = toTournament(row);

    await uow.recordAudit({
      organizationId: input.organizationId,
      entityType: 'tournament',
      entityId: input.tournamentId,
      action: 'tournament.archived',
      actor: input.actor,
      authorizationContext: input.authorizationContext,
      previousState: { status: current.status },
      resultingState: { status: archived.status, archivedAt: archived.archivedAt },
    });
    await uow.publishEvent({
      organizationId: input.organizationId,
      stream: `tournament:${input.tournamentId}`,
      entityId: input.tournamentId,
      eventType: 'tournament.archived',
      projectionVersion: 1,
      payload: { tournamentId: input.tournamentId },
    });

    return archived;
  }

  /**
   * Every non-archived tournament in an organization — the shared
   * "active only" filter every listing method is meant to go through. No
   * other listing method exists in this repository yet, so this is the
   * first one built with the filter in place, not a retrofit.
   */
  async listActiveByOrganization(organizationId: string): Promise<readonly Tournament[]> {
    const rows = await this.db
      .selectFrom('tournaments')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('status', '!=', 'archived')
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toTournament);
  }

  async findById(tournamentId: string): Promise<Tournament | undefined> {
    const row = await this.db
      .selectFrom('tournaments')
      .selectAll()
      .where('tournament_id', '=', tournamentId)
      .executeTakeFirst();
    return row ? toTournament(row) : undefined;
  }

  /** Organization-scoped alias lookup: the URL contract's resolution path. */
  async findByScopedAlias(
    organizationAlias: string,
    tournamentAlias: string,
  ): Promise<Tournament | undefined> {
    const row = await this.db
      .selectFrom('tournaments')
      .innerJoin('organizations', 'organizations.organization_id', 'tournaments.organization_id')
      .selectAll('tournaments')
      .where('organizations.alias', '=', organizationAlias)
      .where('tournaments.alias', '=', tournamentAlias)
      .executeTakeFirst();
    return row ? toTournament(row) : undefined;
  }

  async findLatestRuleset(tournamentId: string): Promise<TournamentRuleset | undefined> {
    const row = await this.db
      .selectFrom('tournament_rulesets')
      .selectAll()
      .where('tournament_id', '=', tournamentId)
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirst();

    return row
      ? {
          rulesetId: row.ruleset_id,
          tournamentId: row.tournament_id,
          version: row.version,
          descriptorRef: {
            descriptorId: row.descriptor_id,
            version: row.descriptor_version,
          },
          overrides: row.overrides as Record<string, unknown>,
        }
      : undefined;
  }

  /**
   * Reads through the caller's own executor rather than `this.db`: called
   * from inside `createRuleset`'s open transaction, and a second connection
   * acquisition against the same underlying connection deadlocks under
   * SQLite's single-connection test dialect — Postgres's pool masked
   * this because a "second" connection was always available to hand out.
   */
  private async latestRulesetVersion(
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

  private async rulesetIdFor(
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
