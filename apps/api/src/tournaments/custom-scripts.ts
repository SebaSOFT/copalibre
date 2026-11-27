import type { Kysely } from 'kysely';
import {
  type Database,
  OrganizationRepository,
  TournamentRepository,
  withTransaction,
  CompetitionRecordRepository,
  InvariantViolationError,
} from '@copalibre/persistence';
import type { RequestWithSubject } from '../auth/request-context.js';
import {
  HookScriptVocabularyResponse,
  TournamentCustomScriptsResponse,
} from '../dto/organization.dto.js';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '../http/error-contract.js';
import { enforcePolicy } from '../policy/resource-policy.js';
import {
  TOURNAMENT_CUSTOM_SCRIPT_HOOKS,
  type HookScriptAttachment,
  validateHookScriptAttachment,
} from '@copalibre/domain';
import {
  createHookScriptRegistry,
  validateHookScriptDocument,
  type RuleScript,
} from '@copalibre/rules';

export async function customScriptVocabulary(
  db: Kysely<Database>,
  organizationAlias: string,
  request: RequestWithSubject,
): Promise<HookScriptVocabularyResponse> {
  const organization = await new OrganizationRepository(db).findByAlias(organizationAlias);
  if (!organization) {
    throw new NotFoundException(`No organization with alias "${organizationAlias}"`, {
      errorCode: 'tournament-not-found',
    });
  }
  enforcePolicy({
    plane: 'admin-control',
    subject: request.subject,
    resource: { organizationId: organization.organizationId },
  });

  return {
    hooks: [...TOURNAMENT_CUSTOM_SCRIPT_HOOKS],
    entries: createHookScriptRegistry()
      .list()
      .map((entry) => ({
        ...entry,
        ...(entry.authoring
          ? {
              authoring: {
                ...entry.authoring,
                ...(entry.authoring.parameters
                  ? {
                      parameters: entry.authoring.parameters.map((parameter) => ({
                        ...parameter,
                      })),
                    }
                  : {}),
              },
            }
          : {}),
      })),
  };
}

export async function customScripts(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  request: RequestWithSubject,
): Promise<TournamentCustomScriptsResponse> {
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
  return { customScripts: [...(ruleset?.customScripts ?? [])] };
}

export async function updateCustomScripts(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  body: TournamentCustomScriptsResponse,
  request: RequestWithSubject,
): Promise<TournamentCustomScriptsResponse> {
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
  const customScripts = validateCustomScripts(body.customScripts ?? []);
  const subject = request.subject;

  try {
    const updated = await withTransaction(db, async (uow) => {
      const result = await tournaments.createRuleset(uow, {
        tournamentId: tournament.tournamentId,
        organizationId: tournament.organizationId,
        descriptor,
        overrides: current.overrides,
        customScripts,
        actor: `user:${subject?.subjectId ?? 'unknown'}`,
        authorizationContext: (subject?.scopes ?? []).join(' '),
        reason: 'Organizer updated custom event rules',
      });
      await new CompetitionRecordRepository(db).saveCompiledRuleset(uow, {
        tournamentId: tournament.tournamentId,
        ruleset: result.effective,
        organizationId: tournament.organizationId,
        actor: `user:${subject?.subjectId ?? 'unknown'}`,
        authorizationContext: (subject?.scopes ?? []).join(' '),
      });
      return result;
    });
    return { customScripts: [...updated.ruleset.customScripts] };
  } catch (error) {
    if (error instanceof InvariantViolationError) {
      throw new ConflictException(error.message, { errorCode: 'tournament-conflict' });
    }
    throw error;
  }
}

export function validateCustomScripts(
  input: readonly HookScriptAttachment[],
): readonly HookScriptAttachment[] {
  const registry = createHookScriptRegistry();
  for (const attachment of input) {
    const hook = validateHookScriptAttachment(attachment);
    if (!hook.ok) {
      throw new BadRequestException(hook.error.message, { errorCode: 'tournament-bad-request' });
    }
    const references = validateHookScriptDocument(
      registry,
      'event.recorded',
      attachment.script as unknown as RuleScript,
    );
    if (!references.ok) {
      throw new BadRequestException(references.error.message, {
        errorCode: 'tournament-bad-request',
      });
    }
  }
  return input;
}
