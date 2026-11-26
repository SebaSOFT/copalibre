import type { Kysely } from 'kysely';
import {
  type Database,
  CompetitionRepository,
  TournamentRepository,
  recordAuditRefusal,
  withTransaction,
  CompetitionRecordRepository,
  InvariantViolationError,
} from '@copalibre/persistence';
import type { RequestWithSubject } from '../auth/request-context.js';
import {
  StageConfigurationResponse,
  StageConfigurationRequest,
  SeriesMutationPreviewResponse,
} from '../dto/organization.dto.js';
import { resolveTournament } from '../controllers/standings.controller.js';
import { findStage, stageMutationContext, actorOf, authorizationContextOf } from './context.js';
import { BadRequestException, ConflictException } from '../http/error-contract.js';
import {
  evaluateMutation,
  validateStageGroupConfiguration,
  compileEffectiveRuleset,
} from '@copalibre/domain';

export async function configuration(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  request: RequestWithSubject,
): Promise<StageConfigurationResponse> {
  const { tournament } = await resolveTournament(db, {
    organizationAlias,
    tournamentAlias,
    request,
  });
  const competition = new CompetitionRepository(db);
  const stage = await findStage(competition, tournament.tournamentId, stageNumber);
  const configuration = await new TournamentRepository(db).findLatestStageConfiguration(
    stage.stageId,
  );
  return {
    overrides: { ...(configuration?.overrides ?? {}) },
    ...(configuration?.groupConfiguration === undefined
      ? {}
      : { groupConfiguration: configuration.groupConfiguration }),
  };
}

export async function previewConfigurationMutation(
  db: Kysely<Database>,
  logger: { error(message: string, ...args: unknown[]): void },
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  body: StageConfigurationRequest,
  request: RequestWithSubject,
): Promise<SeriesMutationPreviewResponse> {
  const { tournament, organizationId } = await resolveTournament(db, {
    organizationAlias,
    tournamentAlias,
    request,
  });
  const competition = new CompetitionRepository(db);
  const stage = await findStage(competition, tournament.tournamentId, stageNumber);

  const descriptor = await new TournamentRepository(db).findDescriptor(
    tournament.disciplineRef.descriptorId,
    tournament.disciplineRef.version,
  );
  if (!descriptor) {
    throw new BadRequestException(
      `Discipline ${tournament.disciplineRef.descriptorId}@${tournament.disciplineRef.version} is not installed`,
      { errorCode: 'stage-bad-request' },
    );
  }
  const { hasRecordedResults, generatedFixtures, previousValues } = await stageMutationContext(
    db,
    stage.stageId,
  );

  const fields = await Promise.all(
    Object.entries(body.overrides).map(async ([field, nextValue]) => {
      const decision = evaluateMutation(descriptor.fieldPolicies, field, {
        hasRecordedResults,
        generatedFixtures,
        previousValue: previousValues[field],
        nextValue,
      });
      if (!decision.ok) {
        await recordAuditRefusal(
          db,
          {
            organizationId,
            entityType: 'stage-configuration',
            entityId: stage.stageId,
            action: 'mutation.refused',
            actor: actorOf(request),
            authorizationContext: authorizationContextOf(request),
            reason: decision.error.message,
            previousState: { field, nextValue },
          },
          (error) => logger.error('Failed to record a refusal audit entry', error as Error),
        );
        return { field, blocked: true, reason: decision.error.message };
      }
      return {
        field,
        mutationClass: decision.value.mutationClass,
        ...(decision.value.mutationClass === 'requires_rebuild'
          ? { invalidatedFixtureCount: decision.value.invalidates.length }
          : {}),
      };
    }),
  );
  return { fields };
}

export async function updateConfiguration(
  db: Kysely<Database>,
  logger: { error(message: string, ...args: unknown[]): void },
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  body: StageConfigurationRequest,
  request: RequestWithSubject,
): Promise<StageConfigurationResponse> {
  const { tournament, organizationId } = await resolveTournament(db, {
    organizationAlias,
    tournamentAlias,
    request,
  });
  const competition = new CompetitionRepository(db);
  const stage = await findStage(competition, tournament.tournamentId, stageNumber);

  const tournaments = new TournamentRepository(db);
  const descriptor = await tournaments.findDescriptor(
    tournament.disciplineRef.descriptorId,
    tournament.disciplineRef.version,
  );
  if (!descriptor) {
    throw new BadRequestException(
      `Discipline ${tournament.disciplineRef.descriptorId}@${tournament.disciplineRef.version} is not installed`,
      { errorCode: 'stage-bad-request' },
    );
  }
  const { hasRecordedResults, generatedFixtures, previousValues } = await stageMutationContext(
    db,
    stage.stageId,
  );

  if (body.groupConfiguration !== undefined && body.groupConfiguration !== null) {
    const groupError = validateStageGroupConfiguration(body.groupConfiguration);
    if (groupError) {
      throw new BadRequestException(groupError, { errorCode: 'stage-bad-request' });
    }
  }

  const fields = Object.entries(body.overrides);
  for (const [field, nextValue] of fields) {
    const decision = evaluateMutation(descriptor.fieldPolicies, field, {
      hasRecordedResults,
      generatedFixtures,
      previousValue: previousValues[field],
      nextValue,
    });
    if (!decision.ok) {
      await recordAuditRefusal(
        db,
        {
          organizationId,
          entityType: 'stage-configuration',
          entityId: stage.stageId,
          action: 'mutation.refused',
          actor: actorOf(request),
          authorizationContext: authorizationContextOf(request),
          reason: decision.error.message,
          previousState: { field, nextValue },
        },
        (error) => logger.error('Failed to record a refusal audit entry', error as Error),
      );
      throw new ConflictException(decision.error.message, {
        errorCode: 'stage-configuration-conflict',
      });
    }
  }

  const mergedOverrides = { ...previousValues, ...Object.fromEntries(fields) };
  try {
    return await withTransaction(db, async (uow) => {
      await competition.assertStageHasNoFixtures(uow, stage.stageId);
      if (fields.length === 0 && body.groupConfiguration === undefined) {
        const current = await tournaments.findLatestStageConfiguration(stage.stageId);
        return {
          overrides: mergedOverrides,
          ...(current?.groupConfiguration === undefined
            ? {}
            : { groupConfiguration: current.groupConfiguration }),
        };
      }

      const currentConfiguration = await tournaments.findLatestStageConfiguration(stage.stageId);
      const ruleset = await tournaments.findLatestRuleset(tournament.tournamentId);
      if (!ruleset) {
        throw new BadRequestException(
          'This tournament has no configured ruleset to attach a stage configuration to',
          { errorCode: 'stage-bad-request' },
        );
      }

      const stageConfiguration = currentConfiguration
        ? await tournaments.updateStageConfiguration(uow, {
            stageId: stage.stageId,
            organizationId,
            changedOverrides: Object.fromEntries(fields),
            ...(body.groupConfiguration === undefined
              ? {}
              : { groupConfiguration: body.groupConfiguration }),
            actor: actorOf(request),
            authorizationContext: authorizationContextOf(request),
          })
        : await tournaments.createStageConfiguration(uow, {
            stageId: stage.stageId,
            rulesetId: ruleset.rulesetId,
            organizationId,
            overrides: mergedOverrides,
            ...(body.groupConfiguration == null
              ? {}
              : { groupConfiguration: body.groupConfiguration }),
            actor: actorOf(request),
            authorizationContext: authorizationContextOf(request),
          });

      const compiledStage = compileEffectiveRuleset(descriptor, ruleset, stageConfiguration);
      if (compiledStage.ok) {
        await new CompetitionRecordRepository(db).saveCompiledRuleset(uow, {
          tournamentId: tournament.tournamentId,
          stageId: stage.stageId,
          ruleset: compiledStage.value,
          organizationId,
          actor: actorOf(request),
          authorizationContext: authorizationContextOf(request),
        });
      }
      return {
        overrides: mergedOverrides,
        ...(stageConfiguration.groupConfiguration === undefined
          ? {}
          : { groupConfiguration: stageConfiguration.groupConfiguration }),
      };
    });
  } catch (error) {
    if (error instanceof InvariantViolationError) {
      throw new ConflictException(error.message, { errorCode: 'stage-configuration-conflict' });
    }
    throw error;
  }
}
