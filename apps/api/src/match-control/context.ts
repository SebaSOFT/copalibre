import { createHash } from 'node:crypto';
import { ConflictException, NotFoundException } from '../http/error-contract.js';
import {
  addableSegmentsOf,
  foldRosterLineup,
  soleMemberWithRole,
  type DisciplineDescriptor,
  type EventDefinition,
  type LocalizedLabel,
  type MatchRoster,
  type RecordedEvent,
  type RunningTimer,
  type Segment,
  type SegmentPlan,
} from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  MatchCommandIdempotencyRepository,
  TournamentRepository,
  type Database,
  type UnitOfWork,
} from '@copalibre/persistence';
import { type Kysely } from 'kysely';
import {
  ConsoleRosterResponse,
  ConsoleSegmentPlanResponse,
  MatchCommandRequest,
} from '../dto/match-control.dto.js';
import { readStageSeries, resolveFixtureSeries } from '../controllers/stage-series.js';
import { clockChangedPayloadOf } from '../controllers/segment-clock.js';
import {
  answerFromKey,
  keyReusedConflict,
  type KeyedCommand,
} from '../controllers/match-command-idempotency.js';

export async function anullSurplusOf(
  db: Kysely<Database>,
  uow: UnitOfWork,
  input: {
    readonly matchId: string;
    readonly stageId: string;
    readonly tournamentId: string;
    readonly organizationId: string;
    readonly actor: string;
    readonly authorizationContext: string;
  },
): Promise<void> {
  const competition = new CompetitionRepository(db);
  const match = await competition.findMatch(input.matchId, uow);
  if (!match) return;

  const declaration = await readStageSeries(uow.tx, {
    tournamentId: input.tournamentId,
    stageId: input.stageId,
    zoneId: await competition.findFixtureZoneId(match.fixtureId, uow),
  });
  if (declaration === undefined) return;

  const fixtures = await competition.listFixturesOfStage(input.stageId, uow);
  const fixture = fixtures.find((candidate) => candidate.fixtureId === match.fixtureId);
  if (!fixture) return;

  const matches = await competition.listMatchesForStage(input.stageId, uow);
  const resolution = resolveFixtureSeries({
    declaration,
    ...(fixture.homeEntrantId === undefined ? {} : { homeEntrantId: fixture.homeEntrantId }),
    ...(fixture.awayEntrantId === undefined ? {} : { awayEntrantId: fixture.awayEntrantId }),
    matches: matches
      .filter((candidate) => candidate.fixtureId === match.fixtureId)
      .sort((a, b) => a.number - b.number),
  });
  if (resolution === undefined || resolution.anulledMatchNumbers.length === 0) return;

  await competition.anullSurplusMatches(uow, {
    fixtureId: match.fixtureId,
    anulledMatchNumbers: resolution.anulledMatchNumbers,
    organizationId: input.organizationId,
    actor: input.actor,
    authorizationContext: input.authorizationContext,
  });
}

export async function resolveTournament(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
) {
  const tournament = await new TournamentRepository(db).findByScopedAlias(
    organizationAlias,
    tournamentAlias,
  );
  if (!tournament) {
    throw new NotFoundException(
      `No tournament "${tournamentAlias}" in organization "${organizationAlias}"`,
      { errorCode: 'match-control-not-found' },
    );
  }
  return tournament;
}

export async function descriptorFor(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
): Promise<DisciplineDescriptor> {
  const tournament = await resolveTournament(db, organizationAlias, tournamentAlias);
  const descriptor = await new TournamentRepository(db).findDescriptor(
    tournament.disciplineRef.descriptorId,
    tournament.disciplineRef.version,
  );
  if (!descriptor) {
    throw new NotFoundException(
      `Tournament "${tournamentAlias}" names a discipline that is no longer installed`,
      { errorCode: 'match-control-not-found' },
    );
  }
  return descriptor;
}

export async function eligibleStaffIdsFor(
  db: Kysely<Database>,
  entrantIds: readonly string[],
): Promise<ReadonlySet<string>> {
  if (entrantIds.length === 0) return new Set();

  const entrants = await db
    .selectFrom('entrants')
    .select('team_id')
    .where('entrant_id', 'in', entrantIds)
    .execute();
  const teamIds = entrants.flatMap((entrant) => (entrant.team_id ? [entrant.team_id] : []));
  if (teamIds.length === 0) return new Set();

  const staff = await db
    .selectFrom('players')
    .select('person_id')
    .where('team_id', 'in', teamIds)
    .where('role', 'in', ['coach', 'staff'])
    .execute();
  return new Set(staff.map((member) => member.person_id));
}

export async function identityByEntrant(
  db: Kysely<Database>,
  entrantIds: readonly string[],
): Promise<{
  readonly teamNameByEntrant: ReadonlyMap<string, string>;
  readonly teamAbbreviationByEntrant: ReadonlyMap<string, string>;
  readonly clubIdByEntrant: ReadonlyMap<string, string>;
}> {
  if (entrantIds.length === 0) {
    return {
      teamNameByEntrant: new Map(),
      teamAbbreviationByEntrant: new Map(),
      clubIdByEntrant: new Map(),
    };
  }

  const enrollment = new EnrollmentRepository(db);
  const [entrantNames, entrantTeams] = await Promise.all([
    enrollment.resolveEntrantNames(entrantIds),
    db
      .selectFrom('entrants')
      .select(['entrant_id', 'team_id'])
      .where('entrant_id', 'in', entrantIds)
      .execute(),
  ]);

  const teamIdByEntrant = new Map(
    entrantTeams.flatMap((entrant) =>
      entrant.team_id === null ? [] : [[entrant.entrant_id, entrant.team_id] as const],
    ),
  );
  const teamIds = [...new Set(teamIdByEntrant.values())];
  const clubIdByTeam = await enrollment.clubsOfTeams(teamIds);

  const teamNameByEntrant = new Map(
    [...entrantNames.entries()].map(([entrantId, entry]) => [entrantId, entry.name] as const),
  );
  const teamAbbreviationByEntrant = new Map(
    [...entrantNames.entries()].flatMap(([entrantId, entry]) =>
      entry.abbreviation === undefined ? [] : [[entrantId, entry.abbreviation] as const],
    ),
  );
  const clubIdByEntrant = new Map(
    [...teamIdByEntrant.entries()].flatMap(([entrantId, teamId]) => {
      const clubId = clubIdByTeam.get(teamId);
      return clubId === undefined ? [] : [[entrantId, clubId] as const];
    }),
  );

  return { teamNameByEntrant, teamAbbreviationByEntrant, clubIdByEntrant };
}

export function buildRosterResponses(
  matchId: string,
  rosters: readonly RosterRow[],
  events: readonly RecordedEvent[],
  identity: {
    readonly teamNameByEntrant: ReadonlyMap<string, string>;
    readonly teamAbbreviationByEntrant: ReadonlyMap<string, string>;
    readonly clubIdByEntrant: ReadonlyMap<string, string>;
  },
): ConsoleRosterResponse[] {
  return rosters.map((roster) => ({
    entrantId: roster.entrant_id,
    ...(identity.teamNameByEntrant.get(roster.entrant_id) === undefined
      ? {}
      : { teamName: identity.teamNameByEntrant.get(roster.entrant_id) }),
    ...(identity.teamAbbreviationByEntrant.get(roster.entrant_id) === undefined
      ? {}
      : { teamAbbreviation: identity.teamAbbreviationByEntrant.get(roster.entrant_id) }),
    ...(identity.clubIdByEntrant.get(roster.entrant_id) === undefined
      ? {}
      : { clubId: identity.clubIdByEntrant.get(roster.entrant_id) }),
    members: foldRosterLineup(initialRosterOf(matchId, roster), events).members.map((member) => ({
      personId: member.personId,
      ...(member.number === undefined ? {} : { number: member.number }),
      name: member.name,
      ...(member.nationality === undefined ? {} : { nationality: member.nationality }),
      ...(member.roles === undefined ? {} : { roles: [...member.roles] }),
      onField: member.onField,
    })),
  }));
}

export async function withIdempotency<T>(
  db: Kysely<Database>,
  idempotencyKey: string | undefined,
  matchId: string,
  operation: string,
  requestBody: unknown,
  run: (claim: IdempotencyClaim) => Promise<void>,
  respond: () => Promise<T>,
): Promise<T> {
  if (!idempotencyKey) {
    await run(noClaim);
    return respond();
  }
  const idempotency = new MatchCommandIdempotencyRepository(db);
  const fingerprint = fingerprintOf(requestBody);
  const previous = await idempotency.find(idempotencyKey);
  if (previous) {
    return answerStored(
      idempotency,
      idempotencyKey,
      previous,
      matchId,
      operation,
      fingerprint,
      respond,
    );
  }

  const claim: IdempotencyClaim = async (uow, response) => {
    const keyed = { idempotencyKey, matchId, operation, requestFingerprint: fingerprint };
    if (response === undefined) await idempotency.claim(uow, keyed);
    else
      await idempotency.record(uow, {
        ...keyed,
        response: response as Record<string, unknown>,
      });
  };
  try {
    await run(claim);
  } catch (error) {
    // A concurrent request with this key may have committed first, or a refusal may follow
    // a commit this request did not see. Answer from the key if one is on record; otherwise the
    // refusal stands and nothing was recorded.
    const raced = await idempotency.find(idempotencyKey);
    if (!raced) throw error;
    return answerStored(
      idempotency,
      idempotencyKey,
      raced,
      matchId,
      operation,
      fingerprint,
      respond,
    );
  }
  const response = await respond();
  await idempotency.completeResponse(
    idempotencyKey,
    response as unknown as Record<string, unknown>,
  );
  return response;
}

export async function answerStored<T>(
  idempotency: MatchCommandIdempotencyRepository,
  idempotencyKey: string,
  stored: KeyedCommand<unknown>,
  matchId: string,
  operation: string,
  fingerprint: string,
  respond: () => Promise<T>,
): Promise<T> {
  const answer = answerFromKey<unknown>(stored, matchId, operation, fingerprint);
  if (answer.outcome === 'conflict') throw keyReusedConflict(operation);
  if (answer.outcome === 'replay') return answer.response as T;
  const response = await respond();
  await idempotency.completeResponse(
    idempotencyKey,
    response as unknown as Record<string, unknown>,
  );
  return response;
}

/**
 * Claims a request's idempotency key inside the transaction that carries the command's writes. A
 * command that already holds its complete response passes it, and the key is stored completed.
 * The claim inserts a row whose foreign key takes a shared lock on the match row, so it must follow
 * any FOR UPDATE lock the command takes on that row.
 */
export type IdempotencyClaim = (uow: UnitOfWork, response?: unknown) => Promise<void>;

export const noClaim: IdempotencyClaim = async () => undefined;

export function segmentPlanResponse(
  descriptor: DisciplineDescriptor,
  plan: SegmentPlan | undefined,
  segments: readonly Segment[],
): ConsoleSegmentPlanResponse {
  const regulation =
    plan === undefined
      ? undefined
      : {
          type: plan.type,
          ...typeLabelFor(descriptor, plan.type),
          count: plan.count,
          ...(plan.maximum === undefined ? {} : { maximum: plan.maximum }),
        };
  return {
    ...(regulation === undefined ? {} : { regulation }),
    addable: addableSegmentsOf(descriptor, plan, segments).map((entry) => ({
      ...entry,
      ...typeLabelFor(descriptor, entry.type),
    })),
  };
}

/** The stand-in for the first planned segment, used only for the pre-transaction check. */
export function plannedSegment(matchId: string, type: string): Segment {
  return { segmentId: '', matchId, type, number: 1, state: 'pending' };
}

export function segmentsOfConfig(config: unknown): unknown {
  return typeof config === 'object' && config !== null
    ? (config as Readonly<Record<string, unknown>>)['segments']
    : undefined;
}

/**
 * Which event definitions start and end a timer, read off the discipline.
 *
 * A timed penalty is a declared *effect* on an event definition, so the
 * discipline already says which events start a clock and for how long — the
 * console does not need a second list to keep in step.
 */
export function timerCodesOf(descriptor: DisciplineDescriptor) {
  const starts: Record<string, number> = {};
  for (const definition of descriptor.eventDefinitions) {
    for (const effect of definition.effects ?? []) {
      if (effect.kind === 'timed-penalty') starts[definition.code] = effect.durationSeconds;
    }
  }
  return { starts, stops: [] as readonly string[] };
}

export function durationFor(
  descriptor: DisciplineDescriptor,
  segmentType: string,
): { readonly durationSeconds?: number } {
  const durationSeconds = descriptor.segmentTypes.find(
    (segment) => segment.name === segmentType,
  )?.defaultDurationSeconds;
  return durationSeconds === undefined ? {} : { durationSeconds };
}

export function typeLabelFor(
  descriptor: DisciplineDescriptor,
  segmentType: string,
): { readonly typeLabel?: string | LocalizedLabel } {
  const typeLabel = descriptor.segmentTypes.find((segment) => segment.name === segmentType)?.label;
  return typeLabel === undefined ? {} : { typeLabel };
}

export function toTimerDto(timer: RunningTimer) {
  return {
    timerId: timer.timerId,
    ...(timer.side === undefined ? {} : { side: timer.side }),
    ...(timer.personId === undefined ? {} : { personId: timer.personId }),
    startedAt: timer.startedAt,
    durationSeconds: timer.durationSeconds,
    remainingSeconds: timer.remainingSeconds,
  };
}

/**
 * Which payload fields a console must prompt for as a secondary person
 * selection — read from the definition's own `awardTo`/`target` effects and
 * its declared `personPayloadFields`, rather than guessed from
 * `payloadSchema`'s property types, since a free-text field (`reason`) is a
 * string too but names nobody. `personPayloadFields` covers a field that
 * names a person but carries no behavioral effect of its own — a
 * substitution's `playerOutId`/`playerInId`, say — which an `awardTo`/
 * `target` effect has nothing to attach to.
 */
export function secondaryActorFieldsOf(
  definition: EventDefinition,
): { readonly field: string; readonly label?: string | LocalizedLabel }[] {
  const fields = new Set<string>(definition.personPayloadFields ?? []);
  for (const effect of definition.effects ?? []) {
    if (effect.kind === 'statistic' && typeof effect.awardTo === 'object') {
      fields.add(effect.awardTo.payloadField);
    }
    if (effect.kind === 'tag' && typeof effect.target === 'object') {
      fields.add(effect.target.payloadField);
    }
  }
  // The label is keyed by the field, so it attaches the same way no matter
  // which of the three declarations above put the field in front of an
  // operator. An undeclared one travels without a label rather than with a
  // guess made from its key.
  return [...fields].map((field) => {
    const label = definition.payloadFieldLabels?.[field];
    return label === undefined ? { field } : { field, label };
  });
}

export type RosterMemberRow = {
  readonly personId: string;
  readonly number?: number | string;
  readonly name: string;
  /** Codes naming discipline-declared `RosterRoleDeclaration`s — never a closed enum. */
  readonly roles?: readonly string[];
  readonly onField: boolean;
};

export type RosterRow = {
  readonly entrant_id: string;
  readonly roster_members: readonly RosterMemberRow[];
};

/** One entrant's stored roster, before folding substitution history over it. */
export function initialRosterOf(matchId: string, roster: RosterRow): MatchRoster {
  return { matchId, entrantId: roster.entrant_id, members: roster.roster_members };
}

/**
 * Which entrants a `ScoreAward` ('actor' | 'every-other-side') resolves to —
 * the same vocabulary and semantics `foldLiveScores`'s `scoreRecipients`
 * already establishes for score effects, reused here for roster-role
 * resolution.
 */
export function scoreAwardEntrantIds(
  awardTo: 'actor' | 'every-other-side',
  side: string | undefined,
  entrantIds: readonly string[],
): readonly string[] {
  if (side === undefined) return [];
  return awardTo === 'actor' ? [side] : entrantIds.filter((entrantId) => entrantId !== side);
}

/**
 * Every `payloadField` a `roster-role-snapshot` effect on this event
 * definition resolves to, from the roster and substitution history — the
 * generic form of "who currently holds role X for side Y", not specific to
 * football or to a goalkeeper. A field is present only when exactly one
 * on-field member across every entrant `side` resolves to matches the
 * declared role; otherwise nothing here guesses.
 */
export function rosterRoleSnapshotPayload(
  matchId: string,
  definition: EventDefinition | undefined,
  side: string | undefined,
  entrantIds: readonly string[],
  rosters: readonly RosterRow[],
  events: readonly RecordedEvent[],
): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const effect of definition?.effects ?? []) {
    if (effect.kind !== 'roster-role-snapshot') continue;
    const candidates = scoreAwardEntrantIds(effect.side, side, entrantIds)
      .map((entrantId) => rosters.find((roster) => roster.entrant_id === entrantId))
      .filter((roster): roster is RosterRow => roster !== undefined)
      .map((roster) =>
        soleMemberWithRole(foldRosterLineup(initialRosterOf(matchId, roster), events), effect.role),
      )
      .filter((personId): personId is string => personId !== undefined);
    if (candidates.length === 1) payload[effect.payloadField] = candidates[0] as string;
  }
  return payload;
}

export function finalizeFingerprint(body: MatchCommandRequest | undefined): string {
  return fingerprintOf(body);
}

/**
 * Every mutating console command fingerprints its own request body the same
 * way: a retried idempotency key with an identical body replays the
 * stored response; the same key with a different body is a conflict, not a
 * silent re-application of the new one.
 */
export function fingerprintOf(body: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(body ?? {}))
    .digest('hex');
}

/**
 * Every idempotent route, including finalize, shares this same
 * replay-or-conflict check, not a copy of it per route.
 */
export function replayCommand<T>(
  stored: {
    readonly matchId: string;
    readonly operation: string;
    readonly requestFingerprint: string;
    readonly response: Readonly<Record<string, unknown>>;
  },
  matchId: string,
  operation: string,
  fingerprint: string,
): T {
  if (
    stored.operation !== operation ||
    stored.matchId !== matchId ||
    stored.requestFingerprint !== fingerprint
  ) {
    throw new ConflictException(`Idempotency-Key was already used for a different ${operation}`, {
      errorCode: 'match-control-conflict',
    });
  }
  return stored.response as unknown as T;
}

export async function publishClockChanged(
  uow: UnitOfWork,
  input: {
    readonly organizationId: string;
    readonly matchId: string;
    readonly segment: Segment;
    readonly descriptor: DisciplineDescriptor | undefined;
    readonly projectionVersion: number;
  },
): Promise<void> {
  const payload = clockChangedPayloadOf(input.matchId, input.segment, input.descriptor, Date.now());
  if (!payload) return;
  await uow.publishEvent({
    organizationId: input.organizationId,
    stream: `match:${input.matchId}`,
    entityId: input.matchId,
    eventType: 'match.clock-changed',
    projectionVersion: input.projectionVersion,
    payload: payload as unknown as Record<string, unknown>,
  });
}
