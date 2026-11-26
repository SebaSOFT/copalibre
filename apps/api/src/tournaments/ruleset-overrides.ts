import type { Kysely } from 'kysely';
import {
  type Database,
  TournamentRepository,
  recordAuditRefusal,
  withTransaction,
  CompetitionRecordRepository,
  InvariantViolationError,
} from '@copalibre/persistence';
import type { RequestWithSubject } from '../auth/request-context.js';
import {
  RulesetOverridesResponse,
  RulesetOverridesRequest,
  SeriesMutationPreviewResponse,
  SeriesMutationFieldPreview,
} from '../dto/organization.dto.js';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '../http/error-contract.js';
import { enforcePolicy } from '../policy/resource-policy.js';
import { evaluateMutation } from '@copalibre/domain';

export async function rulesetOverrides(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  request: RequestWithSubject,
): Promise<RulesetOverridesResponse> {
  const tournaments = new TournamentRepository(db);
  const tournament = await tournaments.findByScopedAlias(organizationAlias, tournamentAlias);
  if (!tournament) {
    throw new NotFoundException(`No tournament "${tournamentAlias}"`, {
      errorCode: 'tournament-not-found',
    });
  }
  enforcePolicy({
    plane: 'admin-control',
    subject: request.subject,
    resource: { organizationId: tournament.organizationId },
  });

  const ruleset = await tournaments.findLatestRuleset(tournament.tournamentId);
  if (!ruleset) {
    throw new NotFoundException(`Tournament "${tournamentAlias}" has no ruleset`, {
      errorCode: 'tournament-not-found',
    });
  }
  const descriptor = await tournaments.findDescriptor(
    ruleset.descriptorRef.descriptorId,
    ruleset.descriptorRef.version,
  );
  if (!descriptor) {
    throw new NotFoundException('Tournament discipline descriptor is unavailable', {
      errorCode: 'tournament-not-found',
    });
  }
  return {
    overrides: { ...ruleset.overrides },
    fieldPolicies: descriptor.fieldPolicies,
    disciplineDefaults: descriptor.defaults,
  };
}

export async function previewRulesetOverrides(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  body: RulesetOverridesRequest,
  request: RequestWithSubject,
): Promise<SeriesMutationPreviewResponse> {
  const tournaments = new TournamentRepository(db);
  const tournament = await tournaments.findByScopedAlias(organizationAlias, tournamentAlias);
  if (!tournament) {
    throw new NotFoundException(`No tournament "${tournamentAlias}"`, {
      errorCode: 'tournament-not-found',
    });
  }
  enforcePolicy({
    plane: 'admin-control',
    subject: request.subject,
    resource: { organizationId: tournament.organizationId },
  });

  const current = await tournaments.findLatestRuleset(tournament.tournamentId);
  if (!current) {
    throw new NotFoundException(`Tournament "${tournamentAlias}" has no ruleset`, {
      errorCode: 'tournament-not-found',
    });
  }
  const descriptor = await tournaments.findDescriptor(
    current.descriptorRef.descriptorId,
    current.descriptorRef.version,
  );
  if (!descriptor) {
    throw new NotFoundException('Tournament discipline descriptor is unavailable', {
      errorCode: 'tournament-not-found',
    });
  }

  const fieldNames = dedicatedRouteFieldsOf(body.overrides);
  const { hasRecordedResults, acceptedEntrantCount } = await tournaments.settingsMutationContext(
    tournament.tournamentId,
  );

  const fields: SeriesMutationFieldPreview[] = fieldNames.map((field) => {
    const nextValue = body.overrides[field];
    const decision = evaluateMutation(descriptor.fieldPolicies, field, {
      hasRecordedResults,
      previousValue: current.overrides[field],
      nextValue,
      acceptedEntrantCount,
    });
    if (!decision.ok) return { field, blocked: true, reason: decision.error.message };
    return {
      field,
      mutationClass: decision.value.mutationClass,
      ...(decision.value.mutationClass === 'requires_rebuild'
        ? { invalidatedFixtureCount: decision.value.invalidates.length }
        : {}),
    };
  });
  return { fields };
}

export async function updateRulesetOverrides(
  db: Kysely<Database>,
  logger: { error(message: string, ...args: unknown[]): void },
  organizationAlias: string,
  tournamentAlias: string,
  body: RulesetOverridesRequest,
  request: RequestWithSubject,
): Promise<RulesetOverridesResponse> {
  const tournaments = new TournamentRepository(db);
  const tournament = await tournaments.findByScopedAlias(organizationAlias, tournamentAlias);
  if (!tournament) {
    throw new NotFoundException(`No tournament "${tournamentAlias}"`, {
      errorCode: 'tournament-not-found',
    });
  }
  const subject = request.subject;
  enforcePolicy({
    plane: 'admin-control',
    subject,
    resource: { organizationId: tournament.organizationId },
  });

  const current = await tournaments.findLatestRuleset(tournament.tournamentId);
  if (!current) {
    throw new NotFoundException(`Tournament "${tournamentAlias}" has no ruleset`, {
      errorCode: 'tournament-not-found',
    });
  }
  const descriptor = await tournaments.findDescriptor(
    current.descriptorRef.descriptorId,
    current.descriptorRef.version,
  );
  if (!descriptor) {
    throw new NotFoundException('Tournament discipline descriptor is unavailable', {
      errorCode: 'tournament-not-found',
    });
  }

  const fieldNames = dedicatedRouteFieldsOf(body.overrides);
  const { hasRecordedResults, acceptedEntrantCount } = await tournaments.settingsMutationContext(
    tournament.tournamentId,
  );
  const actor = `user:${subject?.subjectId ?? 'unknown'}`;
  const authorizationContext = (subject?.scopes ?? []).join(' ');
  const nextOverrides: Record<string, unknown> = { ...current.overrides };

  for (const field of fieldNames) {
    const nextValue = body.overrides[field];
    const decision = evaluateMutation(descriptor.fieldPolicies, field, {
      hasRecordedResults,
      previousValue: current.overrides[field],
      nextValue,
      acceptedEntrantCount,
    });
    if (!decision.ok) {
      await recordAuditRefusal(
        db,
        {
          organizationId: tournament.organizationId,
          entityType: 'tournament-ruleset',
          entityId: current.rulesetId,
          action: 'mutation.refused',
          actor,
          authorizationContext,
          reason: decision.error.message,
          previousState: { field, nextValue },
        },
        (error) => logger.error('Failed to record a refusal audit entry', error as Error),
      );
      throw new ConflictException(decision.error.message, {
        errorCode: 'tournament-ruleset-conflict',
      });
    }
    nextOverrides[field] = nextValue;
  }

  try {
    return await withTransaction(db, async (uow) => {
      if (fieldNames.length > 0) {
        const { effective } = await tournaments.createRuleset(uow, {
          tournamentId: tournament.tournamentId,
          organizationId: tournament.organizationId,
          descriptor,
          overrides: nextOverrides,
          customScripts: current.customScripts,
          actor,
          authorizationContext,
          reason: 'Organizer edited ruleset overrides',
        });
        await new CompetitionRecordRepository(db).saveCompiledRuleset(uow, {
          tournamentId: tournament.tournamentId,
          ruleset: effective,
          organizationId: tournament.organizationId,
          actor,
          authorizationContext,
        });
      }
      return {
        overrides: nextOverrides,
        fieldPolicies: descriptor.fieldPolicies,
        disciplineDefaults: descriptor.defaults,
      };
    });
  } catch (error) {
    if (error instanceof InvariantViolationError) {
      throw new ConflictException(error.message, { errorCode: 'tournament-ruleset-conflict' });
    }
    throw error;
  }
}

/** Field names from the request, refusing `customScripts`/`registration.capacity` — each keeps its own dedicated route. */
export function dedicatedRouteFieldsOf(
  overrides: Readonly<Record<string, unknown>>,
): readonly string[] {
  const fields = Object.keys(overrides);
  const misrouted = fields.filter(
    (field) => field === 'customScripts' || field === 'registration.capacity',
  );
  if (misrouted.length > 0) {
    throw new BadRequestException(
      `Field(s) ${misrouted.join(', ')} must be edited through their own dedicated route`,
      { errorCode: 'tournament-bad-request' },
    );
  }
  return fields;
}
