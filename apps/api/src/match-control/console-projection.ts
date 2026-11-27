import { ForbiddenException, NotFoundException } from '../http/error-contract.js';
import {
  MATCH_CAPABILITIES,
  compileEffectiveRuleset,
  foldLiveScores,
  runningTimers,
  segmentPlanOf,
  segmentsDefaultOf,
  type DisciplineDescriptor,
  type SegmentPlan,
} from '@copalibre/domain';
import {
  CompetitionRecordRepository,
  CompetitionRepository,
  MatchAssignmentRepository,
  PersonRepository,
  ProjectionStore,
  TournamentRepository,
  type Database,
  type UnitOfWork,
} from '@copalibre/persistence';
import { type Kysely } from 'kysely';
import { type RequestWithSubject } from '../auth/request-context.js';
import { MatchConsoleResponse, MatchStateResponse } from '../dto/match-control.dto.js';
import { enforcePolicy } from '../policy/resource-policy.js';
import { elapsedSecondsOf } from '../controllers/segment-clock.js';
import { readFixtureSources } from '../controllers/fixture-sources.js';
import {
  resolveTournament,
  descriptorFor,
  eligibleStaffIdsFor,
  identityByEntrant,
  buildRosterResponses,
  segmentPlanResponse,
  segmentsOfConfig,
  timerCodesOf,
  durationFor,
  typeLabelFor,
  toTimerDto,
  secondaryActorFieldsOf,
} from './context.js';

export async function handleState(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
): Promise<MatchStateResponse> {
  await resolveTournament(db, organizationAlias, tournamentAlias);
  const competition = new CompetitionRepository(db);
  const match = await competition.findMatch(matchId);
  if (!match)
    throw new NotFoundException(`No match "${matchId}"`, {
      errorCode: 'match-control-not-found',
    });

  const descriptor = await descriptorFor(db, organizationAlias, tournamentAlias);
  return matchStateOf(competition, descriptor, match);
}

export async function handleConsole(
  db: Kysely<Database>,
  logger: { warn: (message: unknown, ...rest: unknown[]) => void },
  uncompiledRulesetsWarned: Set<string>,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
  request: RequestWithSubject,
): Promise<MatchConsoleResponse> {
  return consoleProjection(
    db,
    logger,
    uncompiledRulesetsWarned,
    organizationAlias,
    tournamentAlias,
    matchId,
    request,
  );
}

export async function consoleProjection(
  db: Kysely<Database>,
  logger: { warn: (message: unknown, ...rest: unknown[]) => void },
  uncompiledRulesetsWarned: Set<string>,
  organizationAlias: string,
  tournamentAlias: string,
  matchId: string,
  request: RequestWithSubject,
): Promise<MatchConsoleResponse> {
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
  const match = await competition.findMatch(matchId);
  if (!match)
    throw new NotFoundException(`No match "${matchId}"`, {
      errorCode: 'match-control-not-found',
    });

  const stageId = await stageOf(db, matchId);
  const [
    segments,
    events,
    descriptor,
    resolvedTimerIds,
    assignments,
    rosters,
    fixture,
    version,
    stage,
  ] = await Promise.all([
    competition.listSegments(matchId),
    competition.listEvents(matchId),
    descriptorFor(db, organizationAlias, tournamentAlias),
    competition.resolvedTimerIds(matchId),
    new MatchAssignmentRepository(db).forSubject({
      organizationId: tournament.organizationId,
      subjectId: request.subject?.subjectId ?? '',
      matchId,
      stageId,
    }),
    db
      .selectFrom('match_rosters')
      .select(['entrant_id', 'roster_members'])
      .where('match_id', '=', matchId)
      .execute(),
    db
      .selectFrom('matches')
      .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
      .select(['fixtures.home_entrant_id', 'fixtures.away_entrant_id', 'fixtures.node_key'])
      .where('matches.match_id', '=', matchId)
      .executeTakeFirst(),
    new ProjectionStore(db).versionOf('match-console', matchId),
    db.selectFrom('stages').select(['number']).where('stage_id', '=', stageId).executeTakeFirst(),
  ]);
  const isOrgAdmin =
    request.subject?.grantorContext?.organizationAdminOf === tournament.organizationId ||
    request.subject?.grantorContext?.isSuperAdmin === true;
  const capabilities = isOrgAdmin
    ? [...MATCH_CAPABILITIES]
    : [...new Set(assignments.flatMap((assignment) => assignment.capabilities))];
  if (capabilities.length === 0) {
    throw new ForbiddenException('Subject holds no match-control capability for this match', {
      errorCode: 'match-control-forbidden',
    });
  }
  if (!stage)
    throw new NotFoundException(`Stage "${stageId}" no longer exists`, {
      errorCode: 'match-control-not-found',
    });

  const entrantIds = [fixture?.home_entrant_id, fixture?.away_entrant_id].filter(
    (entrantId): entrantId is string => entrantId !== null && entrantId !== undefined,
  );
  const eligibleStaffIds = await eligibleStaffIdsFor(db, entrantIds);
  const eligibleStaff = await new PersonRepository(db).findPersons([...eligibleStaffIds]);
  const { teamNameByEntrant, teamAbbreviationByEntrant, clubIdByEntrant } = await identityByEntrant(
    db,
    entrantIds,
  );

  return {
    matchId,
    stageNumber: stage.number,
    ...(fixture?.node_key == null ? {} : (await readFixtureSources(db, stageId)).get(matchId)),
    status: match.status,
    result: (match.result as Record<string, unknown> | undefined) ?? null,
    liveScores: [...foldLiveScores(descriptor, events, entrantIds)],
    segments: segments.map((segment) => ({
      segmentId: segment.segmentId,
      type: segment.type,
      number: segment.number,
      state: segment.state,
      elapsedSeconds: elapsedSecondsOf(segment, Date.now()),
      ...durationFor(descriptor, segment.type),
      ...typeLabelFor(descriptor, segment.type),
    })),
    // Only a match that can still start or take a segment needs its plan; a finished one
    // skips the ruleset reads and compilation on every console load.
    segmentPlan: segmentPlanResponse(
      descriptor,
      match.status === 'scheduled' || match.status === 'in-progress'
        ? await regulationPlanOf(
            db,
            logger,
            uncompiledRulesetsWarned,
            descriptor,
            tournamentAlias,
            tournament.tournamentId,
            stageId,
          )
        : undefined,
      segments,
    ),
    runningTimers: runningTimers(
      events,
      timerCodesOf(descriptor),
      Date.now(),
      resolvedTimerIds,
    ).map(toTimerDto),
    events: events.map((event) => ({
      eventId: event.eventId,
      definitionCode: event.definitionCode,
      segmentId: event.segmentId,
      sequence: event.sequence,
      occurredAt: event.occurredAt,
      ...(event.side === undefined ? {} : { side: event.side }),
      ...(event.personId === undefined ? {} : { personId: event.personId }),
      ...(event.notes === undefined ? {} : { notes: event.notes }),
      ...(event.segmentElapsedSeconds === undefined
        ? {}
        : { segmentElapsedSeconds: event.segmentElapsedSeconds }),
    })),
    eventDefinitions: descriptor.eventDefinitions.map((definition) => ({
      code: definition.code,
      label: definition.label,
      category: definition.category,
      permittedSegmentTypes: [...definition.permittedSegmentTypes],
      actorRequirement: definition.actorRequirement,
      payloadSchema: { ...definition.payloadSchema },
      display: definition.display ? { ...definition.display } : {},
      secondaryActorFields: secondaryActorFieldsOf(definition),
      ...(definition.workflow === undefined
        ? {}
        : {
            workflow: {
              kind: definition.workflow.kind,
              options: definition.workflow.options.map((option) => ({ ...option })),
            },
          }),
    })),
    eligiblePersonIds: [
      ...new Set(
        rosters.flatMap((roster) => roster.roster_members.map((member) => member.personId)),
      ),
    ],
    rosters: buildRosterResponses(matchId, rosters, events, {
      teamNameByEntrant,
      teamAbbreviationByEntrant,
      clubIdByEntrant,
    }),
    rosterRoles: (descriptor.rosterRoles ?? []).map((role) => ({
      code: role.code,
      label: role.label,
      ...(role.badge === undefined ? {} : { badge: role.badge }),
    })),
    eligibleStaffIds: [...eligibleStaffIds],
    eligibleStaff: eligibleStaff.map((person) => ({
      personId: person.personId,
      displayName: person.displayName,
    })),
    entrants: entrantIds.map((entrantId) => ({
      entrantId,
      ...(teamNameByEntrant.get(entrantId) === undefined
        ? {}
        : { name: teamNameByEntrant.get(entrantId) }),
      ...(teamAbbreviationByEntrant.get(entrantId) === undefined
        ? {}
        : { abbreviation: teamAbbreviationByEntrant.get(entrantId) }),
    })),
    ...(fixture?.home_entrant_id == null ? {} : { homeEntrantId: fixture.home_entrant_id }),
    ...(fixture?.away_entrant_id == null ? {} : { awayEntrantId: fixture.away_entrant_id }),
    capabilities,
    projectionVersion: version?.version ?? 0,
  };
}

export async function regulationPlanOf(
  db: Kysely<Database>,
  logger: { warn: (message: unknown, ...rest: unknown[]) => void },
  uncompiledRulesetsWarned: Set<string>,
  descriptor: DisciplineDescriptor,
  tournamentAlias: string,
  tournamentId: string,
  stageId: string,
): Promise<SegmentPlan | undefined> {
  const stored = await new CompetitionRecordRepository(db).findCompiledRuleset(
    tournamentId,
    stageId,
  );
  if (stored) return segmentPlanOf(descriptor, segmentsOfConfig(stored.config));

  const latest = await new TournamentRepository(db).findLatestRuleset(tournamentId);
  const compiled = compileEffectiveRuleset(descriptor, latest);
  if (compiled.ok) return segmentPlanOf(descriptor, segmentsOfConfig(compiled.value.config));

  // Once per tournament and process: every console load of its matches lands here.
  if (!uncompiledRulesetsWarned.has(tournamentId)) {
    uncompiledRulesetsWarned.add(tournamentId);
    logger.warn(
      `Ruleset of tournament "${tournamentAlias}" does not compile; the discipline's default segments plan the match`,
    );
  }
  return segmentPlanOf(
    descriptor,
    segmentsDefaultOf(descriptor.defaults as Readonly<Record<string, unknown>> | undefined),
  );
}

export async function stageOf(db: Kysely<Database>, matchId: string): Promise<string> {
  const stageId = await new CompetitionRepository(db).stageOfMatch(matchId);
  if (!stageId)
    throw new NotFoundException(`Match "${matchId}" belongs to no stage`, {
      errorCode: 'match-control-not-found',
    });
  return stageId;
}

/** A match's live state, read on the given unit of work when there is one. */
export async function matchStateOf(
  competition: CompetitionRepository,
  descriptor: DisciplineDescriptor,
  match: { readonly matchId: string; readonly status: string },
  uow?: UnitOfWork,
): Promise<MatchStateResponse> {
  const [segments, events, resolvedTimerIds] = await Promise.all([
    competition.listSegments(match.matchId, uow),
    competition.listEvents(match.matchId, uow),
    competition.resolvedTimerIds(match.matchId, uow),
  ]);
  return {
    matchId: match.matchId,
    status: match.status,
    clockRunning: segments.some((segment) => segment.state === 'active'),
    runningTimers: runningTimers(
      events,
      timerCodesOf(descriptor),
      Date.now(),
      resolvedTimerIds,
    ).map(toTimerDto),
  };
}
