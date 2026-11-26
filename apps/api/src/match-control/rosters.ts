import { BadRequestException, NotFoundException } from '../http/error-contract.js';
import { type MatchRosterMember } from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  MatchAssignmentRepository,
  PersonRepository,
  ProjectionStore,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import { type Kysely } from 'kysely';
import { type RequestWithSubject } from '../auth/request-context.js';
import {
  ConsoleRosterResponse,
  MatchConsoleResponse,
  RosterCandidateResponse,
  SetMatchRosterRequest,
} from '../dto/match-control.dto.js';
import { enforceMatchCommand, enforcePolicy } from '../policy/resource-policy.js';
import { refuseIfAnulledBySeries } from '../controllers/stage-series.js';
import {
  resolveTournament,
  identityByEntrant,
  buildRosterResponses,
  withIdempotency,
  type IdempotencyClaim,
} from './context.js';
import { consoleProjection, stageOf } from './console-projection.js';

export async function handleRosters(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
  request: RequestWithSubject,
): Promise<ConsoleRosterResponse[]> {
  const tournament = await resolveTournament(db, organizationAlias, tournamentAlias);
  enforcePolicy({
    plane: 'admin-control',
    subject: request.subject,
    resource: {
      organizationId: tournament.organizationId,
      ownerTournamentId: tournament.tournamentId,
    },
  });
  const competition = new CompetitionRepository(db);
  const [rosters, events] = await Promise.all([
    db
      .selectFrom('match_rosters')
      .select(['entrant_id', 'roster_members'])
      .where('match_id', '=', matchId)
      .execute(),
    competition.listEvents(matchId),
  ]);
  const identity = await identityByEntrant(
    db,
    rosters.map((roster) => roster.entrant_id),
  );
  return buildRosterResponses(matchId, rosters, events, identity);
}

export async function handleRosterCandidates(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
  entrantId: string,
  request: RequestWithSubject,
): Promise<RosterCandidateResponse[]> {
  const tournament = await resolveTournament(db, organizationAlias, tournamentAlias);
  enforcePolicy({
    plane: 'admin-control',
    subject: request.subject,
    resource: {
      organizationId: tournament.organizationId,
      ownerTournamentId: tournament.tournamentId,
    },
  });
  const entrant = await resolveRosterEntrant(db, matchId, entrantId);
  const eligiblePersonIds = await eligiblePersonIdsFor(db, entrant);
  const persons = await new PersonRepository(db).findPersons([...eligiblePersonIds]);
  return persons.map((person) => ({
    personId: person.personId,
    name: person.displayName,
    ...(person.nationality === undefined ? {} : { nationality: person.nationality }),
  }));
}

export async function handleSetRoster(
  db: Kysely<Database>,
  logger: { warn: (message: unknown, ...rest: unknown[]) => void },
  uncompiledRulesetsWarned: Set<string>,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
  entrantId: string,
  body: SetMatchRosterRequest,
  request: RequestWithSubject,
  idempotencyKey?: string,
): Promise<MatchConsoleResponse> {
  return withIdempotency(
    db,
    idempotencyKey,
    matchId,
    'roster-select',
    { entrantId, body },
    (claim) =>
      setRosterOnce(
        db,
        organizationAlias,
        tournamentAlias,
        matchId,
        entrantId,
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

export async function setRosterOnce(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
  entrantId: string,
  body: SetMatchRosterRequest,
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

  // Before the generic status guard, so an operator whose match a series anulled during an
  // outage is told which series settled it rather than only that the match is not-required.
  if (match.status === 'not-required') {
    await refuseIfAnulledBySeries(db, {
      match,
      tournamentId: tournament.tournamentId,
      stageId: await stageOf(db, matchId),
    });
  }
  // Mirrors `recordEvent`'s own status guard: a queued roster
  // selection reaching a match that finalized in the meantime is refused
  // the same way a live submission would be, not silently accepted.
  if (match.status !== 'in-progress') {
    throw new BadRequestException(
      `Match "${matchId}" is ${match.status}; roster selection happens while it is in progress`,
      { errorCode: 'match-control-bad-request' },
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
    capability: 'match.select-roster',
    match: { organizationId: tournament.organizationId, matchId, stageId },
  });

  const entrant = await resolveRosterEntrant(db, matchId, entrantId);
  const eligiblePersonIds = await eligiblePersonIdsFor(db, entrant);

  const members = body.members ?? [];
  for (const member of members) {
    if (!eligiblePersonIds.has(member.personId)) {
      throw new BadRequestException(
        `Person "${member.personId}" is not a registered player of entrant "${entrantId}"`,
        { errorCode: 'match-control-bad-request' },
      );
    }
  }
  if (new Set(members.map((member) => member.personId)).size !== members.length) {
    throw new BadRequestException('A roster cannot name the same person twice', {
      errorCode: 'match-control-bad-request',
    });
  }
  const numbers = members.flatMap((member) => (member.number === undefined ? [] : [member.number]));
  if (new Set(numbers).size !== numbers.length) {
    throw new BadRequestException('A roster cannot assign the same number twice', {
      errorCode: 'match-control-bad-request',
    });
  }

  const priorRoster = (await competition.matchRoster(matchId)).find(
    (roster) => roster.entrantId === entrantId,
  );
  if (priorRoster) {
    const submittedPersonIds = new Set(members.map((member) => member.personId));
    const removed = priorRoster.members
      .map((member) => member.personId)
      .filter((personId) => !submittedPersonIds.has(personId));
    if (removed.length > 0) {
      const events = await competition.listEvents(matchId);
      const attributingEvent = events.find(
        (event) => event.personId && removed.includes(event.personId),
      );
      if (attributingEvent) {
        throw new BadRequestException(
          `Cannot remove person "${attributingEvent.personId}" from the roster — event ` +
            `"${attributingEvent.definitionCode}" (sequence ${attributingEvent.sequence}) is ` +
            'already attributed to them',
          { errorCode: 'match-control-bad-request' },
        );
      }
    }
  }

  const persons = await new PersonRepository(db).findPersons(
    members.map((member) => member.personId),
  );
  const personById = new Map(persons.map((person) => [person.personId, person]));
  const rosterMembers: MatchRosterMember[] = members.map((member) => {
    const person = personById.get(member.personId);
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
  });

  const audit = {
    organizationId: tournament.organizationId,
    actor: request.subject?.subjectId ?? 'unknown',
    authorizationContext: `capability:${granted.capability} via ${granted.grantedBy}`,
  };
  await withTransaction(db, async (uow) => {
    await claim(uow);
    await competition.setMatchRoster(uow, {
      matchId,
      entrantId,
      members: rosterMembers,
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
      payload: { matchId, command: 'roster-set', entrantId },
    });
  });
}

export async function resolveRosterEntrant(
  db: Kysely<Database>,
  matchId: string,
  entrantId: string,
): Promise<{
  readonly entrant_kind: string;
  readonly team_id: string | null;
  readonly person_id: string | null;
}> {
  const fixture = await db
    .selectFrom('matches')
    .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
    .select(['fixtures.home_entrant_id', 'fixtures.away_entrant_id'])
    .where('matches.match_id', '=', matchId)
    .executeTakeFirst();
  if (fixture?.home_entrant_id !== entrantId && fixture?.away_entrant_id !== entrantId) {
    throw new BadRequestException(`Entrant "${entrantId}" is not one of this match’s two sides`, {
      errorCode: 'match-control-bad-request',
    });
  }

  const entrant = await db
    .selectFrom('entrants')
    .select(['entrant_kind', 'team_id', 'person_id'])
    .where('entrant_id', '=', entrantId)
    .executeTakeFirst();
  if (!entrant)
    throw new NotFoundException(`No entrant "${entrantId}"`, {
      errorCode: 'match-control-not-found',
    });
  return entrant;
}

export async function eligiblePersonIdsFor(
  db: Kysely<Database>,
  entrant: {
    readonly entrant_kind: string;
    readonly team_id: string | null;
    readonly person_id: string | null;
  },
): Promise<ReadonlySet<string>> {
  if (entrant.entrant_kind === 'team' && entrant.team_id) {
    const byTeam = await new EnrollmentRepository(db).playersByTeams([entrant.team_id]);
    return new Set((byTeam.get(entrant.team_id) ?? []).map((player) => player.personId));
  }
  return new Set(entrant.person_id ? [entrant.person_id] : []);
}
