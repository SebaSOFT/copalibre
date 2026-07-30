import {
  Alias,
  compileEffectiveRuleset,
  type DisciplineDescriptor,
  type MatchRuleset,
  type OverrideSet,
  type StageConfiguration,
  type Tournament,
  type TournamentRuleset,
} from '@copalibre/domain';
import type { Kysely } from 'kysely';
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
    await uow.tx
      .insertInto('discipline_descriptors')
      .values({
        descriptor_id: descriptor.descriptorId,
        version: descriptor.version,
        name: descriptor.name,
        document: JSON.stringify(descriptor),
        created_at: new Date(),
      })
      .onConflict((oc) => oc.columns(['descriptor_id', 'version']).doNothing())
      .execute();

    await uow.recordAudit({
      organizationId: context.organizationId,
      entityType: 'discipline-descriptor',
      entityId: descriptor.descriptorId,
      action: 'descriptor.published',
      actor: context.actor,
      authorizationContext: context.authorizationContext,
      resultingState: { descriptorId: descriptor.descriptorId, version: descriptor.version },
    });

    return descriptor;
  }

  async findDescriptor(
    descriptorId: string,
    version: number,
  ): Promise<DisciplineDescriptor | undefined> {
    const row = await this.db
      .selectFrom('discipline_descriptors')
      .select('document')
      .where('descriptor_id', '=', descriptorId)
      .where('version', '=', version)
      .executeTakeFirst();
    return row ? (row.document as unknown as DisciplineDescriptor) : undefined;
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
    const previous = await this.latestRulesetVersion(input.tournamentId);
    const version = previous + 1;
    const rulesetId = previous === 0 ? newId() : await this.rulesetIdFor(input.tournamentId);

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

  private async latestRulesetVersion(tournamentId: string): Promise<number> {
    const row = await this.db
      .selectFrom('tournament_rulesets')
      .select('version')
      .where('tournament_id', '=', tournamentId)
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirst();
    return row?.version ?? 0;
  }

  private async rulesetIdFor(tournamentId: string): Promise<string> {
    const row = await this.db
      .selectFrom('tournament_rulesets')
      .select('ruleset_id')
      .where('tournament_id', '=', tournamentId)
      .limit(1)
      .executeTakeFirst();
    return row?.ruleset_id ?? newId();
  }
}
