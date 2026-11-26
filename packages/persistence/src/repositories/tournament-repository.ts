import {
  type DisciplineDescriptor,
  type MatchRuleset,
  type OverrideSet,
  type StageAllocation,
  type StageConfiguration,
  type Tournament,
  type TournamentRuleset,
} from '@copalibre/domain';
import type { Kysely, Transaction } from 'kysely';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';
import { DisciplineDescriptorRepository } from './tournament/discipline-descriptor-repository.js';
import { RulesetRepository } from './tournament/ruleset-repository.js';
import { TournamentLifecycleRepository } from './tournament/tournament-lifecycle-repository.js';
import { TournamentQueryRepository } from './tournament/tournament-queries.js';
import {
  type CreateTournamentInput,
  type CreateRulesetInput,
} from './tournament/tournament-support.js';

/** Tournament plus the versioned ruleset hierarchy. Compatibility facade: every method delegates to a focused repository in `./tournament/`; new code should use those classes (exported from the package index). */
export class TournamentRepository {
  private readonly descriptors: DisciplineDescriptorRepository;
  private readonly rulesets: RulesetRepository;
  private readonly lifecycle: TournamentLifecycleRepository;
  private readonly queries: TournamentQueryRepository;
  constructor(private readonly db: Kysely<Database>) {
    this.descriptors = new DisciplineDescriptorRepository(db);
    this.rulesets = new RulesetRepository(db);
    this.queries = new TournamentQueryRepository(db);
    this.lifecycle = new TournamentLifecycleRepository(db, this.queries);
  }

  saveDescriptor(
    uow: UnitOfWork,
    descriptor: DisciplineDescriptor,
    context: {
      readonly organizationId: string;
      readonly actor: string;
      readonly authorizationContext: string;
    },
  ): Promise<DisciplineDescriptor> {
    return this.descriptors.saveDescriptor(uow, descriptor, context);
  }
  findDescriptor(descriptorId: string, version: string): Promise<DisciplineDescriptor | undefined> {
    return this.descriptors.findDescriptor(descriptorId, version);
  }
  findDescriptorByAlias(alias: string, version: string): Promise<DisciplineDescriptor | undefined> {
    return this.descriptors.findDescriptorByAlias(alias, version);
  }
  findDescriptorVersionsByAlias(alias: string): Promise<readonly DisciplineDescriptor[]> {
    return this.descriptors.findDescriptorVersionsByAlias(alias);
  }
  listDescriptors(): Promise<
    readonly {
      readonly descriptorId: string;
      readonly version: string;
      readonly document: DisciplineDescriptor;
    }[]
  > {
    return this.descriptors.listDescriptors();
  }
  findStartedTournamentAliasesReferencingDescriptor(
    descriptorId: string,
    version: string,
  ): Promise<readonly string[]> {
    return this.descriptors.findStartedTournamentAliasesReferencingDescriptor(
      descriptorId,
      version,
    );
  }
  findStartedTournamentAliasesReferencingProfile(
    profileId: string,
    version: string,
  ): Promise<readonly string[]> {
    return this.descriptors.findStartedTournamentAliasesReferencingProfile(profileId, version);
  }
  create(uow: UnitOfWork, input: CreateTournamentInput): Promise<Tournament> {
    return this.lifecycle.create(uow, input);
  }
  settingsMutationContext(
    tournamentId: string,
  ): Promise<{ readonly hasRecordedResults: boolean; readonly acceptedEntrantCount: number }> {
    return this.lifecycle.settingsMutationContext(tournamentId);
  }
  renameTournament(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly organizationId: string;
      readonly name: string;
      readonly actor: string;
      readonly authorizationContext: string;
    },
  ): Promise<Tournament> {
    return this.lifecycle.renameTournament(uow, input);
  }
  createRuleset(
    uow: UnitOfWork,
    input: CreateRulesetInput,
  ): Promise<{ readonly ruleset: TournamentRuleset; readonly effective: MatchRuleset }> {
    return this.rulesets.createRuleset(uow, input);
  }
  createStageConfiguration(
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
    return this.rulesets.createStageConfiguration(uow, input);
  }
  updateStageConfiguration(
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
    return this.rulesets.updateStageConfiguration(uow, input);
  }
  publish(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly organizationId: string;
      readonly actor: string;
      readonly authorizationContext: string;
    },
  ): Promise<Tournament> {
    return this.lifecycle.publish(uow, input);
  }
  archive(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly organizationId: string;
      readonly actor: string;
      readonly authorizationContext: string;
    },
  ): Promise<Tournament> {
    return this.lifecycle.archive(uow, input);
  }
  setFeatured(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly organizationId: string;
      readonly featured: boolean;
      readonly actor: string;
      readonly authorizationContext: string;
    },
  ): Promise<Tournament> {
    return this.lifecycle.setFeatured(uow, input);
  }
  setPublicationPrivacy(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly organizationId: string;
      readonly includesMinors: boolean;
      readonly showYouthProfiles: boolean;
      readonly actor: string;
      readonly authorizationContext: string;
    },
  ): Promise<Tournament> {
    return this.lifecycle.setPublicationPrivacy(uow, input);
  }
  setMinimumRest(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly organizationId: string;
      /** `null` clears the rule. */
      readonly minimumRestMinutes: number | null;
      readonly actor: string;
      readonly authorizationContext: string;
    },
  ): Promise<Tournament> {
    return this.lifecycle.setMinimumRest(uow, input);
  }
  updateEmblem(
    uow: UnitOfWork,
    input: {
      readonly tournamentId: string;
      readonly organizationId: string;
      readonly emblemObjectId: string | null;
      readonly actor: string;
      readonly authorizationContext: string;
    },
  ): Promise<Tournament> {
    return this.lifecycle.updateEmblem(uow, input);
  }
  listActiveByOrganization(organizationId: string): Promise<readonly Tournament[]> {
    return this.queries.listActiveByOrganization(organizationId);
  }
  listPublishedByOrganization(organizationId: string): Promise<readonly Tournament[]> {
    return this.queries.listPublishedByOrganization(organizationId);
  }
  private findInTransaction(
    uow: UnitOfWork,
    tournamentId: string,
  ): Promise<Tournament | undefined> {
    return this.queries.findInTransaction(uow, tournamentId);
  }
  findById(tournamentId: string): Promise<Tournament | undefined> {
    return this.queries.findById(tournamentId);
  }
  findByScopedAlias(
    organizationAlias: string,
    tournamentAlias: string,
  ): Promise<Tournament | undefined> {
    return this.queries.findByScopedAlias(organizationAlias, tournamentAlias);
  }
  findLatestRuleset(tournamentId: string): Promise<TournamentRuleset | undefined> {
    return this.rulesets.findLatestRuleset(tournamentId);
  }
  findLatestStageConfiguration(stageId: string): Promise<StageConfiguration | undefined> {
    return this.rulesets.findLatestStageConfiguration(stageId);
  }
  private latestRulesetVersion(
    executor: Kysely<Database> | Transaction<Database>,
    tournamentId: string,
  ): Promise<number> {
    return this.rulesets.latestRulesetVersion(executor, tournamentId);
  }
  private rulesetIdFor(
    executor: Kysely<Database> | Transaction<Database>,
    tournamentId: string,
  ): Promise<string> {
    return this.rulesets.rulesetIdFor(executor, tournamentId);
  }
}

export type { CreateTournamentInput, CreateRulesetInput } from './tournament/tournament-support.js';
