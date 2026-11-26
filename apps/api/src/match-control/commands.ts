import { BadRequestException, NotFoundException } from '../http/error-contract.js';
import {
  applyMatchCommand,
  type MatchCommand,
  type MatchTransition,
  type Segment,
  type SegmentPlan,
} from '@copalibre/domain';
import {
  CompetitionRepository,
  lockRowsForMutation,
  MatchAssignmentRepository,
  MatchCommandIdempotencyRepository,
  ProjectionStore,
  TournamentRepository,
  withTransaction,
  type Database,
  type UnitOfWork,
} from '@copalibre/persistence';
import { type Kysely } from 'kysely';
import { type RequestWithSubject } from '../auth/request-context.js';
import { MatchCommandRequest, MatchStateResponse } from '../dto/match-control.dto.js';
import { enforceMatchCommand } from '../policy/resource-policy.js';
import { refuseIfAnulledBySeries } from '../controllers/stage-series.js';
import { afterOutcomeChange } from '../after-outcome-change.js';
import { assertSidesDecided } from '../assert-sides-decided.js';
import { handleState, regulationPlanOf, stageOf } from './console-projection.js';
import {
  anullSurplusOf,
  resolveTournament,
  answerStored,
  plannedSegment,
  finalizeFingerprint,
  fingerprintOf,
  publishClockChanged,
} from './context.js';

export async function handleCommand(
  db: Kysely<Database>,
  logger: { warn: (message: unknown, ...rest: unknown[]) => void },
  uncompiledRulesetsWarned: Set<string>,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
  command: string,
  request: RequestWithSubject,
  body?: MatchCommandRequest,
  idempotencyKey?: string,
): Promise<MatchStateResponse> {
  if (!isMatchCommand(command)) {
    throw new BadRequestException(`Unknown match command "${command}"`, {
      errorCode: 'match-control-bad-request',
    });
  }

  const tournament = await resolveTournament(db, organizationAlias, tournamentAlias);
  const competition = new CompetitionRepository(db);
  const match = await competition.findMatch(matchId);
  if (!match)
    throw new NotFoundException(`No match "${matchId}"`, {
      errorCode: 'match-control-not-found',
    });

  // Before the generic status guard, so an operator whose match a series anulled during an
  // outage is told which series settled it rather than only that the match is not-required.
  if (match.status === 'not-required') {
    await refuseIfAnulledBySeries(db, {
      match,
      tournamentId: tournament.tournamentId,
      stageId: await stageOf(db, matchId),
    });
  }

  // Finalize alone requires a key (irreversible, so "just resend it" must be
  // safe by construction); start/pause/resume accept one but don't require
  // it — additive only — and fingerprint on
  // the command name itself, since they carry no meaningful request body.
  const fingerprint =
    command === 'finalize' ? finalizeFingerprint(body) : fingerprintOf({ command });
  const idempotency = new MatchCommandIdempotencyRepository(db);
  if (command === 'finalize' && !idempotencyKey) {
    throw new BadRequestException('Finalizing a match requires an Idempotency-Key header', {
      errorCode: 'match-control-bad-request',
    });
  }
  if (idempotencyKey) {
    const previous = await idempotency.find(idempotencyKey);
    if (previous)
      return answerStored(
        idempotency,
        idempotencyKey,
        previous,
        matchId,
        command,
        fingerprint,
        () => handleState(db, organizationAlias, tournamentAlias, matchId),
      );
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
    capability: command === 'finalize' ? 'match.finalize' : 'match.control-clock',
    match: { organizationId: tournament.organizationId, matchId, stageId },
  });

  if (command === 'start' || command === 'finalize') {
    await withTransaction(db, (uow) => assertSidesDecided(db, uow, matchId));
  }

  const segments = await competition.listSegments(matchId);
  // A Start for a match with no segments creates its regulation plan inside the transaction
  // below, under the match's row lock. Until then the planned first segment stands in for it,
  // so a discipline that declares no segment type is still refused here, before any write.
  const plansRegulation =
    command === 'start' && match.status === 'scheduled' && segments.length === 0;
  const descriptor =
    command !== 'finalize'
      ? await new TournamentRepository(db).findDescriptor(
          tournament.disciplineRef.descriptorId,
          tournament.disciplineRef.version,
        )
      : undefined;
  if (plansRegulation && !descriptor) {
    throw new NotFoundException(
      `Tournament "${tournamentAlias}" names a discipline that is no longer installed`,
      { errorCode: 'match-control-not-found' },
    );
  }
  const regulationPlan =
    plansRegulation && descriptor
      ? await regulationPlanOf(
          db,
          logger,
          uncompiledRulesetsWarned,
          descriptor,
          tournamentAlias,
          tournament.tournamentId,
          stageId,
        )
      : undefined;
  // The segment the operator named, not merely whichever is running: after a
  // pause nothing is running, so resolving the target by "currently active"
  // alone left `resume` with nothing to restart and the clock stopped for
  // good. An absent `segmentId` keeps the original behavior for the callers
  // that send no body at all.
  const running = segments.find((segment) => segment.state === 'active');
  const target: Segment | undefined = plansRegulation
    ? regulationPlan && plannedSegment(matchId, regulationPlan.type)
    : body?.segmentId !== undefined
      ? segments.find((segment) => segment.segmentId === body.segmentId)
      : (running ??
        // Nothing is running, so "resume" means the half the match is in —
        // `listSegments` is ordered by number, so the first segment not yet
        // ended is that one. Only the commands that set a clock running may
        // reach for it; pause and end still act on what is actually running.
        (command === 'start' || command === 'resume'
          ? segments.find((segment) => segment.state !== 'completed')
          : undefined));
  if (!plansRegulation && body?.segmentId !== undefined && !target) {
    throw new NotFoundException(`No segment "${body.segmentId}" in this match`, {
      errorCode: 'match-control-not-found',
    });
  }
  const transition = applyMatchCommand(match, command, target);
  if (!transition.ok) {
    throw new BadRequestException(transition.error.message, {
      errorCode: 'match-control-bad-request',
    });
  }

  const audit = {
    organizationId: tournament.organizationId,
    actor: request.subject?.subjectId ?? 'unknown',
    authorizationContext: `capability:${granted.capability}`,
  };

  const finalizeResponse: MatchStateResponse = {
    matchId,
    status: transition.value.status,
    clockRunning: transition.value.clockRunning,
    runningTimers: [],
  };

  try {
    await withTransaction(db, async (uow) => {
      // The key is claimed in this transaction, so a commit always carries it and a rollback
      // never does. The claim must follow any FOR UPDATE lock on the match row: Start claims
      // after startUnderLock (see below). Finalize records its key at the end of this
      // transaction, with the response it already holds.
      const claimCommand = async (): Promise<void> => {
        if (idempotencyKey && command !== 'finalize') {
          await idempotency.claim(uow, {
            idempotencyKey,
            matchId,
            operation: command,
            requestFingerprint: fingerprint,
          });
        }
      };
      if (command !== 'start') await claimCommand();
      if (command === 'start' || command === 'finalize') await assertSidesDecided(db, uow, matchId);
      // Every Start is decided again under the match row lock: a Start that read the match
      // before another one committed would otherwise start it a second time.
      const committed =
        command === 'start'
          ? await startUnderLock(db, uow, {
              matchId,
              command,
              ...(plansRegulation && regulationPlan ? { plan: regulationPlan } : {}),
              segments,
              target,
              audit,
            })
          : { segments, target, transition: transition.value };
      // Start claims here, after startUnderLock has taken the match row lock. The claim's
      // foreign key takes a shared lock on that row, and a second Start that had claimed first
      // would wait on the first one's lock while the first waited on its shared lock: a deadlock.
      if (command === 'start') await claimCommand();
      await competition.applyCommand(uow, {
        matchId,
        command,
        status: committed.transition.status,
        grantedBy: granted.grantedBy,
        ...audit,
      });

      let updatedTarget: Segment | undefined;
      if (committed.target && committed.transition.segmentState) {
        // Only one segment runs at a time: starting or resuming one stops
        // whichever was left running, the same rule the manual adjustment's
        // `activate` already enforces.
        if (committed.transition.clockRunning) {
          for (const segment of committed.segments) {
            if (segment.segmentId !== committed.target.segmentId && segment.state === 'active') {
              await competition.setSegmentState(uow, {
                segmentId: segment.segmentId,
                state: 'pending',
                ...audit,
              });
            }
          }
        }
        updatedTarget = await competition.setSegmentState(uow, {
          segmentId: committed.target.segmentId,
          state: committed.transition.segmentState,
          ...audit,
        });
      }

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
          status: committed.transition.status,
          clockRunning: committed.transition.clockRunning,
        },
      });

      if (command !== 'finalize' && updatedTarget) {
        await publishClockChanged(uow, {
          organizationId: tournament.organizationId,
          matchId,
          segment: updatedTarget,
          descriptor: descriptor ?? undefined,
          projectionVersion,
        });
      }

      if (command === 'finalize') {
        if (!body?.sides?.length) {
          throw new BadRequestException('Finalizing a match requires one entry per side', {
            errorCode: 'match-control-bad-request',
          });
        }
        await competition.recordResult(uow, {
          matchId,
          result: {
            // resultReason is always written explicitly, never left to an
            // implicit "absent means played" — a blob nobody is forced to
            // touch again is a blob whose meaning nothing enforces.
            sides: body.sides.map((side) => ({
              entrantId: side.entrantId,
              statistics: side.statistics,
              ...(side.placement === undefined ? {} : { placement: side.placement }),
              resultReason: side.resultReason ?? 'played',
            })),
            ...(body.winnerEntrantId === undefined
              ? {}
              : { winnerEntrantId: body.winnerEntrantId }),
            recordedAt: new Date().toISOString(),
          },
          ...audit,
        });
        // In the same transaction as the result that caused it: a series decided by this
        // finalize anulls the games it no longer needs and releases their slots, and a
        // record where the result landed but the anulling did not is exactly the incoherent
        // state the product refuses. `anullSurplusMatches` belongs to the multi-match series logic; deciding *when* to
        // call it is what was missing, and without it every surface downstream of here —
        // the builder's contingency marks, the public bar, the offline conflict — describes
        // a state the engine never reaches.
        await anullSurplusOf(db, uow, {
          matchId,
          stageId,
          tournamentId: tournament.tournamentId,
          ...audit,
        });
        await afterOutcomeChange(db, uow, matchId, audit);

        await idempotency.record(uow, {
          idempotencyKey: idempotencyKey ?? '',
          matchId,
          operation: command,
          requestFingerprint: fingerprint ?? '',
          response: finalizeResponse as unknown as Record<string, unknown>,
        });
      }
    });
  } catch (error) {
    if (!idempotencyKey) throw error;
    const previous = await idempotency.find(idempotencyKey);
    if (!previous) throw error;
    return answerStored(idempotency, idempotencyKey, previous, matchId, command, fingerprint, () =>
      handleState(db, organizationAlias, tournamentAlias, matchId),
    );
  }

  if (command === 'finalize') return finalizeResponse;

  const state = await handleState(db, organizationAlias, tournamentAlias, matchId);
  if (idempotencyKey) {
    await idempotency.completeResponse(idempotencyKey, state as unknown as Record<string, unknown>);
  }
  return state;
}

export async function startUnderLock(
  db: Kysely<Database>,
  uow: UnitOfWork,
  input: {
    readonly matchId: string;
    readonly command: MatchCommand;
    readonly plan?: SegmentPlan;
    readonly segments: readonly Segment[];
    readonly target: Segment | undefined;
    readonly audit: {
      readonly organizationId: string;
      readonly actor: string;
      readonly authorizationContext: string;
    };
  },
): Promise<{
  readonly segments: readonly Segment[];
  readonly target: Segment | undefined;
  readonly transition: MatchTransition;
}> {
  const competition = new CompetitionRepository(db);
  await lockRowsForMutation(
    db,
    uow.tx.selectFrom('matches').select('match_id').where('match_id', '=', input.matchId),
  ).execute();
  const match = await competition.findMatch(input.matchId, uow);
  if (!match)
    throw new NotFoundException(`No match "${input.matchId}"`, {
      errorCode: 'match-control-not-found',
    });

  let { segments, target } = input;
  if (input.plan !== undefined && match.status === 'scheduled') {
    segments = await competition.listSegments(input.matchId, uow);
    if (segments.length === 0) {
      const created: Segment[] = [];
      for (let number = 1; number <= input.plan.count; number += 1) {
        created.push(
          await competition.createSegment(uow, {
            matchId: input.matchId,
            type: input.plan.type,
            number,
            ...input.audit,
          }),
        );
      }
      segments = created;
    }
    target = segments.find((segment) => segment.state !== 'completed');
  }

  const transition = applyMatchCommand(match, input.command, target);
  if (!transition.ok) {
    throw new BadRequestException(transition.error.message, {
      errorCode: 'match-control-bad-request',
    });
  }
  return { segments, target, transition: transition.value };
}

export function isMatchCommand(value: string): value is MatchCommand {
  return (
    value === 'start' ||
    value === 'pause' ||
    value === 'resume' ||
    value === 'end' ||
    value === 'finalize'
  );
}
