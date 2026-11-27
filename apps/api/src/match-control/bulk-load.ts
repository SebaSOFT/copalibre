import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../http/error-contract.js';
import { EventLog, type MatchRosterMember, type Segment } from '@copalibre/domain';
import {
  CompetitionRepository,
  InvariantViolationError,
  MatchAssignmentRepository,
  PersonRepository,
  ProjectionStore,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import { type Kysely } from 'kysely';
import { type RequestWithSubject } from '../auth/request-context.js';
import { BulkLoadMatchDataRequest, BulkLoadMatchDataResponse } from '../dto/match-control.dto.js';
import { enforceMatchCommand } from '../policy/resource-policy.js';
import { refuseIfAnulledBySeries } from '../controllers/stage-series.js';
import { afterOutcomeChange } from '../after-outcome-change.js';
import { assertSidesDecided } from '../assert-sides-decided.js';
import { anullSurplusOf, resolveTournament, descriptorFor } from './context.js';
import { stageOf } from './console-projection.js';

export async function handleBulkLoad(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
  body: BulkLoadMatchDataRequest,
  request: RequestWithSubject,
): Promise<BulkLoadMatchDataResponse> {
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
  if (match.result) {
    throw new ConflictException(
      `Match ${matchId} already has a result; use the audited correction workflow to supersede it`,
      { errorCode: 'match-control-conflict' },
    );
  }
  if (!body.result?.sides?.length) {
    throw new BadRequestException('A batch must include one result entry per side', {
      errorCode: 'match-control-bad-request',
    });
  }
  const invalidSegment = body.events.find(
    (event) => event.segmentNumber < 1 || event.segmentNumber > body.segments.length,
  );
  if (invalidSegment) {
    throw new BadRequestException(
      `Event "${invalidSegment.definitionCode}" names segment ${invalidSegment.segmentNumber}, ` +
        `but only ${body.segments.length} segment(s) were submitted`,
      { errorCode: 'match-control-bad-request' },
    );
  }

  const stageId = await stageOf(db, matchId);
  const assignments = await new MatchAssignmentRepository(db).forSubject({
    organizationId: tournament.organizationId,
    subjectId: request.subject?.subjectId ?? '',
    matchId,
    stageId,
  });
  const matchContext = { organizationId: tournament.organizationId, matchId, stageId };
  let granted: { readonly capability: string; readonly grantedBy: string } | undefined;
  for (const capability of [
    'match.select-roster',
    'match.record-event',
    'match.finalize',
  ] as const) {
    granted = enforceMatchCommand({
      plane: 'admin-control',
      subject: request.subject,
      resource: {
        organizationId: tournament.organizationId,
        ownerTournamentId: tournament.tournamentId,
      },
      assignments,
      capability,
      match: matchContext,
    });
  }
  const audit = {
    organizationId: tournament.organizationId,
    actor: request.subject?.subjectId ?? 'unknown',
    authorizationContext: `capability:${granted?.capability} via ${granted?.grantedBy}`,
  };

  const descriptor = await descriptorFor(db, organizationAlias, tournamentAlias);
  const entrantIds = body.rosters.map((roster) => roster.entrantId);
  const baseSequence = await competition.nextEventSequence(matchId);

  // Name/nationality are snapshotted from Person, never taken from the
  // submission — the same policy the live roster-selection route
  // enforces, so a bulk-loaded match's roster can never disagree with the
  // identity it names, whether it arrived live or after the fact.
  const rosterPersonIds = body.rosters.flatMap((roster) =>
    roster.members.map((member) => member.personId),
  );
  const rosterPersons = await new PersonRepository(db).findPersons(rosterPersonIds);
  const rosterPersonById = new Map(rosterPersons.map((person) => [person.personId, person]));
  const rostersByEntrant = body.rosters.map((roster) => ({
    entrantId: roster.entrantId,
    members: roster.members.map((member): MatchRosterMember => {
      const person = rosterPersonById.get(member.personId);
      if (!person)
        throw new NotFoundException(`No person "${member.personId}"`, {
          errorCode: 'match-control-not-found',
        });
      return {
        personId: member.personId,
        ...(member.number === undefined ? {} : { number: member.number }),
        name: person.displayName,
        ...(person.nationality === undefined ? {} : { nationality: person.nationality }),
        ...(member.roles === undefined ? {} : { roles: member.roles }),
        onField: member.onField,
      };
    }),
  }));

  const eventCount = await withTransaction(db, async (uow) => {
    await assertSidesDecided(db, uow, matchId);
    for (const roster of rostersByEntrant) {
      await competition.setMatchRoster(uow, {
        matchId,
        entrantId: roster.entrantId,
        members: roster.members,
        ...audit,
      });
    }

    const segments: Segment[] = [];
    for (const [index, input] of body.segments.entries()) {
      const created = await competition.createSegment(uow, {
        matchId,
        type: input.type,
        number: index + 1,
        ...audit,
      });
      await competition.setSegmentState(uow, {
        segmentId: created.segmentId,
        state: 'completed',
        ...audit,
      });
      const elapsedSeconds =
        input.elapsedSeconds ??
        descriptor.segmentTypes.find((candidate) => candidate.name === input.type)
          ?.defaultDurationSeconds ??
        0;
      const adjusted = await competition.adjustSegmentClock(uow, {
        segmentId: created.segmentId,
        elapsedSeconds,
        ...audit,
      });
      segments.push(adjusted);
    }

    for (const [index, input] of body.events.entries()) {
      const segment = segments[input.segmentNumber - 1] as Segment;
      const validated = new EventLog(descriptor).record({
        eventId: crypto.randomUUID(),
        matchId,
        segment,
        definitionCode: input.definitionCode,
        occurredAt: new Date(input.occurredAt).toISOString(),
        ...(input.side === undefined ? {} : { side: input.side }),
        ...(input.personId === undefined ? {} : { personId: input.personId }),
        ...(input.payload === undefined ? {} : { payload: input.payload }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
        entrantIds,
      });
      if (!validated.ok) {
        throw new BadRequestException(
          `Entry ${index + 1} ("${input.definitionCode}"): ${validated.error.message}`,
          { errorCode: 'match-control-bad-request' },
        );
      }
      await competition.appendEvent(uow, {
        event: validated.value,
        sequence: baseSequence + index,
        ...audit,
      });
    }

    try {
      await competition.recordResult(uow, {
        matchId,
        result: {
          sides: body.result.sides.map((side) => ({
            entrantId: side.entrantId,
            statistics: side.statistics,
            ...(side.placement === undefined ? {} : { placement: side.placement }),
            resultReason: side.resultReason ?? 'played',
          })),
          ...(body.result.winnerEntrantId === undefined
            ? {}
            : { winnerEntrantId: body.result.winnerEntrantId }),
          recordedAt: new Date().toISOString(),
        },
        ...audit,
      });
    } catch (error) {
      if (error instanceof InvariantViolationError) {
        throw new ConflictException(error.message, { errorCode: 'match-control-conflict' });
      }
      throw error;
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
      payload: { matchId, status: 'finalized' },
    });

    await anullSurplusOf(db, uow, {
      matchId,
      stageId,
      tournamentId: tournament.tournamentId,
      ...audit,
    });
    await afterOutcomeChange(db, uow, matchId, audit);

    return body.events.length;
  });

  return { matchId, status: 'finalized', eventCount };
}
