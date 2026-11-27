import { BadRequestException, NotFoundException } from '../http/error-contract.js';
import { reopenSegment } from '@copalibre/domain';
import {
  CompetitionRepository,
  lockRowsForMutation,
  MatchAssignmentRepository,
  MatchCommandIdempotencyRepository,
  ProjectionStore,
  TournamentRepository,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import { type Kysely } from 'kysely';
import { type RequestWithSubject } from '../auth/request-context.js';
import {
  AddSegmentRequest,
  ClockAdjustmentRequest,
  MatchConsoleResponse,
  MatchStateResponse,
  ReopenSegmentRequest,
} from '../dto/match-control.dto.js';
import { enforceMatchCommand } from '../policy/resource-policy.js';
import { refuseIfAnulledBySeries } from '../controllers/stage-series.js';
import {
  resolveTournament,
  descriptorFor,
  withIdempotency,
  type IdempotencyClaim,
  fingerprintOf,
  replayCommand,
  publishClockChanged,
} from './context.js';
import { consoleProjection, stageOf, matchStateOf } from './console-projection.js';

export async function handleAddSegment(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
  request: RequestWithSubject,
  body: AddSegmentRequest,
  idempotencyKey?: string,
): Promise<MatchStateResponse> {
  const tournament = await resolveTournament(db, organizationAlias, tournamentAlias);
  const competition = new CompetitionRepository(db);
  const match = await competition.findMatch(matchId);
  if (!match)
    throw new NotFoundException(`No match "${matchId}"`, {
      errorCode: 'match-control-not-found',
    });

  if (match.status === 'not-required') {
    await refuseIfAnulledBySeries(db, {
      match,
      tournamentId: tournament.tournamentId,
      stageId: await stageOf(db, matchId),
    });
  }

  const fingerprint = fingerprintOf({ command: 'add-segment', type: body.type });
  const idempotency = new MatchCommandIdempotencyRepository(db);
  if (idempotencyKey) {
    const previous = await idempotency.find(idempotencyKey);
    if (previous)
      return replayCommand<MatchStateResponse>(previous, matchId, 'add-segment', fingerprint);
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
    capability: 'match.control-clock',
    match: { organizationId: tournament.organizationId, matchId, stageId },
  });

  const descriptor = await descriptorFor(db, organizationAlias, tournamentAlias);
  if (!descriptor.segmentTypes.some((segmentType) => segmentType.name === body.type)) {
    throw new BadRequestException(
      `Discipline "${descriptor.descriptorId}" declares no segment type "${body.type}"`,
      { errorCode: 'match-control-bad-request' },
    );
  }
  if (match.status !== 'in-progress') {
    throw new BadRequestException(
      `Segments are added to a match in progress; match "${matchId}" is ${match.status}`,
      { errorCode: 'match-control-bad-request' },
    );
  }

  const audit = {
    organizationId: tournament.organizationId,
    actor: request.subject?.subjectId ?? 'unknown',
    authorizationContext: `capability:${granted.capability}`,
  };

  try {
    return await withTransaction(db, async (uow) => {
      // The match row lock orders this addition against a finalize or a Start on the same match.
      await lockRowsForMutation(
        db,
        uow.tx.selectFrom('matches').select('match_id').where('match_id', '=', matchId),
      ).execute();
      const locked = await competition.findMatch(matchId, uow);
      if (locked?.status !== 'in-progress') {
        throw new BadRequestException(
          `Segments are added to a match in progress; match "${matchId}" is ${locked?.status ?? 'missing'}`,
          { errorCode: 'match-control-bad-request' },
        );
      }

      const existing = await competition.listSegments(matchId, uow);
      const number =
        existing.reduce((highest, segment) => Math.max(highest, segment.number), 0) + 1;
      await competition.createSegment(uow, { matchId, type: body.type, number, ...audit });

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
        payload: {
          matchId,
          status: locked.status,
          clockRunning: existing.some((s) => s.state === 'active'),
        },
      });

      // Read on the transaction, which already holds the match row lock: a read on the pool
      // would need a second connection per request. The added segment is pending, so the
      // status and the running clock reported are the same before and after it.
      const response = await matchStateOf(competition, descriptor, locked, uow);
      if (idempotencyKey) {
        await idempotency.record(uow, {
          idempotencyKey,
          matchId,
          operation: 'add-segment',
          requestFingerprint: fingerprint,
          response: response as unknown as Record<string, unknown>,
        });
      }
      return response;
    });
  } catch (error) {
    if (!idempotencyKey) throw error;
    const previous = await idempotency.find(idempotencyKey);
    if (!previous) throw error;
    return replayCommand<MatchStateResponse>(previous, matchId, 'add-segment', fingerprint);
  }
}

export async function handleAdjustClock(
  db: Kysely<Database>,
  logger: { warn: (message: unknown, ...rest: unknown[]) => void },
  uncompiledRulesetsWarned: Set<string>,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
  body: ClockAdjustmentRequest,
  request: RequestWithSubject,
  idempotencyKey?: string,
): Promise<MatchConsoleResponse> {
  return withIdempotency(
    db,
    idempotencyKey,
    matchId,
    'clock-adjust',
    body,
    (claim) =>
      adjustClockOnce(db, organizationAlias, tournamentAlias, matchId, body, request, claim),
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

export async function adjustClockOnce(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
  body: ClockAdjustmentRequest,
  request: RequestWithSubject,
  claim: IdempotencyClaim,
): Promise<void> {
  const tournament = await resolveTournament(db, organizationAlias, tournamentAlias);
  const competition = new CompetitionRepository(db);
  const segments = await competition.listSegments(matchId);
  if (!segments.some((segment) => segment.segmentId === body.segmentId))
    throw new NotFoundException(`No segment "${body.segmentId}" in this match`, {
      errorCode: 'match-control-not-found',
    });

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
    capability: 'match.control-clock',
    match: { organizationId: tournament.organizationId, matchId, stageId },
  });
  const descriptor = await new TournamentRepository(db).findDescriptor(
    tournament.disciplineRef.descriptorId,
    tournament.disciplineRef.version,
  );
  const audit = {
    organizationId: tournament.organizationId,
    actor: request.subject?.subjectId ?? 'unknown',
    authorizationContext: `capability:${granted.capability} via ${granted.grantedBy}`,
  };

  await withTransaction(db, async (uow) => {
    // The match row lock orders this correction against a finalize, a Start or a reopen on the
    // same match; the status and the segment state are read under it, so the refusals below
    // hold for the write that follows. The claim follows the lock: its foreign key shares that
    // row, and a claim taken first would deadlock with a second correction on the same match.
    await lockRowsForMutation(
      db,
      uow.tx.selectFrom('matches').select('match_id').where('match_id', '=', matchId),
    ).execute();
    await claim(uow);
    const locked = await competition.findMatch(matchId, uow);
    if (!locked)
      throw new NotFoundException(`No match "${matchId}"`, {
        errorCode: 'match-control-not-found',
      });
    // Only a match not yet closed has a clock that may be corrected. A finalized, forfeited or
    // anulled match is part of its record, and the audited correction workflow is the path over it.
    if (locked.status !== 'scheduled' && locked.status !== 'in-progress') {
      throw new BadRequestException(
        `The clock of match "${matchId}" is ${locked.status} and cannot be corrected here`,
        { errorCode: 'match-control-bad-request' },
      );
    }

    const current = await competition.listSegments(matchId, uow);
    const selected = current.find((segment) => segment.segmentId === body.segmentId);
    if (!selected)
      throw new NotFoundException(`No segment "${body.segmentId}" in this match`, {
        errorCode: 'match-control-not-found',
      });
    // Activating an ended segment would reopen it with no reason. Reopening is its own command.
    if (body.activate && selected.state === 'completed') {
      throw new BadRequestException(
        `Segment "${body.segmentId}" has ended; reopen it with a reason instead of activating it`,
        { errorCode: 'match-control-bad-request' },
      );
    }

    if (body.activate) {
      for (const segment of current) {
        if (segment.segmentId !== selected.segmentId && segment.state === 'active') {
          await competition.setSegmentState(uow, {
            segmentId: segment.segmentId,
            state: 'pending',
            ...audit,
          });
        }
      }
      if (selected.state !== 'active') {
        await competition.setSegmentState(uow, {
          segmentId: selected.segmentId,
          state: 'active',
          ...audit,
        });
      }
    }
    const adjusted = await competition.adjustSegmentClock(uow, {
      segmentId: selected.segmentId,
      elapsedSeconds: body.elapsedSeconds,
      ...audit,
    });
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
      payload: { matchId, command: 'clock-adjusted', segmentId: selected.segmentId },
    });
    await publishClockChanged(uow, {
      organizationId: tournament.organizationId,
      matchId,
      segment: adjusted,
      descriptor: descriptor ?? undefined,
      projectionVersion,
    });
  });
}

export async function handleReopenSegmentRoute(
  db: Kysely<Database>,
  logger: { warn: (message: unknown, ...rest: unknown[]) => void },
  uncompiledRulesetsWarned: Set<string>,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
  segmentId: string,
  request: RequestWithSubject,
  body: ReopenSegmentRequest,
  idempotencyKey?: string,
): Promise<MatchConsoleResponse> {
  return withIdempotency(
    db,
    idempotencyKey,
    matchId,
    'segment-reopen',
    { segmentId, reason: body.reason },
    (claim) =>
      reopenSegmentOnce(
        db,
        organizationAlias,
        tournamentAlias,
        matchId,
        segmentId,
        body,
        request,
        claim,
      ),
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

export async function reopenSegmentOnce(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
  segmentId: string,
  body: ReopenSegmentRequest,
  request: RequestWithSubject,
  claim: IdempotencyClaim,
): Promise<void> {
  const tournament = await resolveTournament(db, organizationAlias, tournamentAlias);
  const competition = new CompetitionRepository(db);
  const match = await competition.findMatch(matchId);
  if (!match)
    throw new NotFoundException(`No match "${matchId}"`, {
      errorCode: 'match-control-not-found',
    });
  const segments = await competition.listSegments(matchId);
  if (!segments.some((segment) => segment.segmentId === segmentId))
    throw new NotFoundException(`No segment "${segmentId}" in this match`, {
      errorCode: 'match-control-not-found',
    });

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
    capability: 'match.control-clock',
    match: { organizationId: tournament.organizationId, matchId, stageId },
  });
  const descriptor = await new TournamentRepository(db).findDescriptor(
    tournament.disciplineRef.descriptorId,
    tournament.disciplineRef.version,
  );
  const audit = {
    organizationId: tournament.organizationId,
    actor: request.subject?.subjectId ?? 'unknown',
    authorizationContext: `capability:${granted.capability} via ${granted.grantedBy}`,
  };

  await withTransaction(db, async (uow) => {
    // The match row lock orders this reopen against a finalize or a correction on the same match.
    // The claim follows it, for the reason given in adjustClockOnce.
    await lockRowsForMutation(
      db,
      uow.tx.selectFrom('matches').select('match_id').where('match_id', '=', matchId),
    ).execute();
    await claim(uow);
    const locked = await competition.findMatch(matchId, uow);
    if (!locked)
      throw new NotFoundException(`No match "${matchId}"`, {
        errorCode: 'match-control-not-found',
      });
    const segment = (await competition.listSegments(matchId, uow)).find(
      (candidate) => candidate.segmentId === segmentId,
    );
    if (!segment)
      throw new NotFoundException(`No segment "${segmentId}" in this match`, {
        errorCode: 'match-control-not-found',
      });

    const reopening = reopenSegment(locked, segment);
    if (!reopening.ok) {
      throw new BadRequestException(reopening.error.message, {
        errorCode: 'match-control-bad-request',
      });
    }

    const reopened = await competition.setSegmentState(uow, {
      segmentId,
      state: reopening.value.segmentState,
      reason: body.reason,
      ...audit,
    });
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
      payload: { matchId, command: 'segment-reopened', segmentId },
    });
    await publishClockChanged(uow, {
      organizationId: tournament.organizationId,
      matchId,
      segment: reopened,
      descriptor: descriptor ?? undefined,
      projectionVersion,
    });
  });
}
