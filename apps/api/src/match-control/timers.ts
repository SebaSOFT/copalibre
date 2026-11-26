import { BadRequestException } from '../http/error-contract.js';
import { type DisciplineDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  MatchAssignmentRepository,
  ProjectionStore,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import { type Kysely } from 'kysely';
import { type RequestWithSubject } from '../auth/request-context.js';
import { MatchConsoleResponse } from '../dto/match-control.dto.js';
import { enforceMatchCommand } from '../policy/resource-policy.js';
import {
  resolveTournament,
  descriptorFor,
  withIdempotency,
  type IdempotencyClaim,
} from './context.js';
import { consoleProjection, stageOf } from './console-projection.js';

export async function handleResolveTimer(
  db: Kysely<Database>,
  logger: { warn: (message: unknown, ...rest: unknown[]) => void },
  uncompiledRulesetsWarned: Set<string>,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
  timerId: string,
  request: RequestWithSubject,
  idempotencyKey?: string,
): Promise<MatchConsoleResponse> {
  return withIdempotency(
    db,
    idempotencyKey,
    matchId,
    'timer-resolve',
    { timerId },
    (claim) =>
      resolveTimerOnce(db, organizationAlias, tournamentAlias, matchId, timerId, request, claim),
    () =>
      consoleProjection(
        db,
        logger,
        uncompiledRulesetsWarned,
        organizationAlias,
        tournamentAlias,
        matchId,
        request,
      ),
  );
}

export async function resolveTimerOnce(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
  timerId: string,
  request: RequestWithSubject,
  claim: IdempotencyClaim,
): Promise<void> {
  const tournament = await resolveTournament(db, organizationAlias, tournamentAlias);
  const competition = new CompetitionRepository(db);
  const [events, descriptor] = await Promise.all([
    competition.listEvents(matchId),
    descriptorFor(db, organizationAlias, tournamentAlias),
  ]);
  const timer = events.find((event) => event.eventId === timerId);
  if (!timer || !allowsManualTimerResolution(descriptor, timer.definitionCode)) {
    throw new BadRequestException('This timer has no discipline-declared manual resolution', {
      errorCode: 'match-control-bad-request',
    });
  }

  const stageId = await stageOf(db, matchId);
  const granted = enforceMatchCommand({
    plane: 'admin-control',
    subject: request.subject,
    resource: {
      organizationId: tournament.organizationId,
      ownerTournamentId: tournament.tournamentId,
    },
    assignments: await new MatchAssignmentRepository(db).forSubject({
      organizationId: tournament.organizationId,
      subjectId: request.subject?.subjectId ?? '',
      matchId,
      stageId,
    }),
    capability: 'match.resolve-timer',
    match: { organizationId: tournament.organizationId, matchId, stageId },
  });
  const audit = {
    organizationId: tournament.organizationId,
    actor: request.subject?.subjectId ?? 'unknown',
    authorizationContext: `capability:${granted.capability} via ${granted.grantedBy}`,
  };
  await withTransaction(db, async (uow) => {
    await claim(uow);
    await competition.resolveTimer(uow, { timerId, matchId, ...audit });
    const projectionVersion = await new ProjectionStore(db).nextVersion(uow, {
      projectionType: 'match-console',
      entityId: matchId,
    });
    await uow.publishEvent({
      organizationId: tournament.organizationId,
      stream: `match:${matchId}`,
      entityId: matchId,
      eventType: 'match.console-projection',
      projectionVersion,
      payload: { matchId, command: 'timer-resolved', timerId },
    });
  });
}

export function allowsManualTimerResolution(
  descriptor: DisciplineDescriptor,
  definitionCode: string,
): boolean {
  return (
    descriptor.eventDefinitions
      .find((definition) => definition.code === definitionCode)
      ?.effects?.some(
        (effect) => effect.kind === 'timed-penalty' && effect.allowManualResolution === true,
      ) ?? false
  );
}
