import type { Kysely } from 'kysely';
import {
  type Database,
  CompetitionRepository,
  TournamentRepository,
  StageReadModel,
  recordAuditRefusal,
} from '@copalibre/persistence';
import {
  SeriesDeclarationRequest,
  SeriesMutationPreviewResponse,
} from '../dto/organization.dto.js';
import type { RequestWithSubject } from '../auth/request-context.js';
import { resolveTournament } from '../controllers/standings.controller.js';
import { NotFoundException, BadRequestException } from '../http/error-contract.js';
import { evaluateMutation } from '@copalibre/domain';
import { actorOf, authorizationContextOf } from './context.js';

export async function previewSeriesMutation(
  db: Kysely<Database>,
  logger: { error(message: string, ...args: unknown[]): void },
  organizationAlias: string,
  tournamentAlias: string,
  stageNumber: number,
  body: SeriesDeclarationRequest,
  request: RequestWithSubject,
): Promise<SeriesMutationPreviewResponse> {
  const { tournament, organizationId } = await resolveTournament(db, {
    organizationAlias,
    tournamentAlias,
    request,
  });

  const competition = new CompetitionRepository(db);
  const stages = await competition.listStagesOfTournament(tournament.tournamentId);
  const stage = stages.find((candidate) => candidate.number === stageNumber);
  if (!stage)
    throw new NotFoundException(`No stage ${stageNumber} in "${tournamentAlias}"`, {
      errorCode: 'stage-not-found',
    });

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

  const readModel = new StageReadModel(db);
  const record = await readModel.stageRecord(stage.stageId);
  const matches = await readModel.matches(stage.stageId);
  const generatedFixtures = matches.map((match) => ({
    fixtureId: match.matchId,
    stageId: stage.stageId,
    hasResult: match.status === 'finalized',
  }));
  const hasRecordedResults = record?.hasRecordedResults ?? false;
  const previousValues: Record<string, unknown> = record?.overrides ?? {};

  const proposed: [string, unknown][] = [
    ['series.span', body.span],
    ...(body.resolutionClass === undefined
      ? []
      : [['series.resolutionClass', body.resolutionClass] as [string, unknown]]),
    ...(body.neutralGround === undefined
      ? []
      : [['series.neutralGround', body.neutralGround] as [string, unknown]]),
    ...(body.standingsAccounting === undefined
      ? []
      : [['series.standingsAccounting', body.standingsAccounting] as [string, unknown]]),
  ];

  const fields = await Promise.all(
    proposed.map(async ([field, nextValue]) => {
      const decision = evaluateMutation(descriptor.fieldPolicies, field, {
        hasRecordedResults,
        generatedFixtures,
        previousValue: previousValues[field],
        nextValue,
      });
      if (!decision.ok) {
        // A classification consulted and found blocking, returned as a
        // 200 decision rather than thrown — the one refusal shape the
        // central exception filter cannot see, so it is recorded here
        // instead.
        // Awaited, not fire-and-forget: nothing has been sent to the
        // caller yet, so awaiting adds no risk of altering a response
        // already on the wire, and it removes the race a detached write
        // would leave between this response and a reader of the trail.
        await recordAuditRefusal(
          db,
          {
            organizationId,
            entityType: 'stage-series',
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
