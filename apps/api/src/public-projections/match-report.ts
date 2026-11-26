import { NotFoundException } from '../http/error-contract.js';
import {
  CompetitionRepository,
  Database,
  EnrollmentRepository,
  PersonRepository,
  stageMatchOrdinals,
  StageReadModel,
  TournamentRepository,
} from '@copalibre/persistence';
import { PublicMatchReportResponse } from '../dto/public-tournament.dto.js';
import { Kysely } from 'kysely';
import { readPublicScheduleChanges } from '../matches-view/schedule.js';
import { readFixtureSources } from '../controllers/fixture-sources.js';
import { eventLabelFields, rosterRolesOf } from '../controllers/public-match-labels.js';
import { scoreAfterOf, segmentSummariesOf } from '../controllers/public-segments.js';
import { publicClockOf } from '../controllers/segment-clock.js';
import {
  entrantVisibilityById,
  personVisibility,
  personVisibilityById,
} from '../public-person-visibility.js';
import { isImplicitGroup, isImplicitZone, resolveEffectiveMatchCounters } from '@copalibre/domain';
import {
  gameStatusOf,
  livePenaltiesOf,
  publicMatchCountersOf,
  publicMatchStatus,
  publicScores,
  resolvePublishedTournament,
  scheduleStartsAt,
} from './context.js';

export async function matchReport(
  db: Kysely<Database>,
  organizationAlias: string,
  tournamentAlias: string,
  stageNumberValue: string,
  matchNumberValue: string,
  gameValue?: string,
): Promise<PublicMatchReportResponse> {
  const { tournament, organizationName, organizationTimeZone } = await resolvePublishedTournament(
    db,
    organizationAlias,
    tournamentAlias,
  );
  const stageNumber = Number(stageNumberValue);
  const matchNumber = Number(matchNumberValue);
  if (
    !Number.isSafeInteger(stageNumber) ||
    stageNumber < 1 ||
    !Number.isSafeInteger(matchNumber) ||
    matchNumber < 1
  ) {
    throw new NotFoundException({ errorCode: 'public-projection-not-found' });
  }

  const competition = new CompetitionRepository(db);
  const stage = (await competition.listStagesOfTournament(tournament.tournamentId)).find(
    (candidate) => candidate.number === stageNumber,
  );
  if (!stage)
    throw new NotFoundException(`No stage ${stageNumberValue} in tournament`, {
      errorCode: 'public-projection-not-found',
    });

  // `matches.number` is a per-fixture series-game index (always 1 for a
  // non-series fixture) — never stage-unique, so this resolves the target
  // match via the stage's shared ordinal map instead of filtering by that column.
  const stageMatches = await new StageReadModel(db).matches(stage.stageId);
  const ordinals = stageMatchOrdinals(stageMatches);
  const targetRecord = stageMatches.find((record) => ordinals.get(record.matchId) === matchNumber);
  if (!targetRecord)
    throw new NotFoundException(`No match ${matchNumberValue} in stage ${stageNumberValue}`, {
      errorCode: 'public-projection-not-found',
    });

  // A series fixture carries several games: `game` picks one, and the default is the first.
  const gameNumber = gameValue === undefined ? undefined : Number(gameValue);
  if (gameNumber !== undefined && (!Number.isSafeInteger(gameNumber) || gameNumber < 1)) {
    throw new NotFoundException({ errorCode: 'public-projection-not-found' });
  }
  const game =
    gameNumber === undefined
      ? targetRecord.games[0]
      : targetRecord.games.find((candidate) => candidate.number === gameNumber);
  if (gameNumber !== undefined && !game)
    throw new NotFoundException(`No game ${gameValue} in match ${matchNumberValue}`, {
      errorCode: 'public-projection-not-found',
    });
  const gameMatchId = game?.matchId ?? targetRecord.matchId;

  const fixtureSources = await readFixtureSources(db, stage.stageId);

  const match = await db
    .selectFrom('matches')
    .innerJoin('fixtures', 'fixtures.fixture_id', 'matches.fixture_id')
    .select([
      'matches.match_id',
      'matches.number',
      'matches.status',
      'matches.result',
      'fixtures.fixture_id',
      'fixtures.round',
      'matches.stream_url',
      'fixtures.home_entrant_id',
      'fixtures.away_entrant_id',
    ])
    .where('matches.match_id', '=', gameMatchId)
    .executeTakeFirst();
  if (!match)
    throw new NotFoundException(`No match ${matchNumberValue} in stage ${stageNumberValue}`, {
      errorCode: 'public-projection-not-found',
    });

  // The match is shown in the layout of the format its zone plays, which is the stage's unless the
  // zone declares its own.
  const fixtureScope = await resolveFixtureScopeContext(db, targetRecord.fixtureId);
  const zoneFormatOfMatch = fixtureScope.zoneFormat;

  const [schedule, officials, rosterRows, segments, events, descriptor] = await Promise.all([
    db
      .selectFrom('match_schedule_assignments')
      .innerJoin('schedule_slots', 'schedule_slots.slot_id', 'match_schedule_assignments.slot_id')
      .leftJoin('venues', 'venues.venue_id', 'schedule_slots.venue_id')
      .select([
        'schedule_slots.starts_at',
        'match_schedule_assignments.published',
        'venues.name as venue_name',
      ])
      .where('match_schedule_assignments.match_id', '=', match.match_id)
      .executeTakeFirst(),
    db
      .selectFrom('match_schedule_assignments')
      .innerJoin(
        'match_schedule_officials',
        'match_schedule_officials.match_id',
        'match_schedule_assignments.match_id',
      )
      .innerJoin('officials', 'officials.official_id', 'match_schedule_officials.official_id')
      .select(['officials.display_name', 'officials.roles'])
      .where('match_schedule_assignments.match_id', '=', match.match_id)
      .where('match_schedule_assignments.published', '=', true)
      .orderBy('officials.display_name')
      .execute(),
    db
      .selectFrom('match_rosters')
      .select(['entrant_id', 'roster_members'])
      .where('match_id', '=', match.match_id)
      .execute(),
    competition.listSegments(match.match_id),
    competition.listEvents(match.match_id),
    new TournamentRepository(db).findDescriptor(
      tournament.disciplineRef.descriptorId,
      tournament.disciplineRef.version,
    ),
  ]);
  if (!descriptor)
    throw new NotFoundException('Tournament discipline descriptor is unavailable', {
      errorCode: 'public-projection-not-found',
    });

  const entrantIds = [match.home_entrant_id, match.away_entrant_id].filter(
    (entrantId): entrantId is string => entrantId !== null,
  );
  const entrantDetails = await new EnrollmentRepository(db).resolveEntrantPodiumDetails(entrantIds);
  const entrantVisibility = await entrantVisibilityById(db, tournament, entrantIds);
  // Before a side's match-day roster is recorded, a team side shows the players registered to the
  // team. Only an upcoming match has that state: a finished or live match without a roster has no
  // kickoff list still to come.
  const entrantTeamRows =
    entrantIds.length === 0
      ? []
      : await db
          .selectFrom('entrants')
          .select(['entrant_id', 'team_id'])
          .where('entrant_id', 'in', entrantIds)
          .execute();
  const teamIdByEntrant = new Map(
    entrantTeamRows.flatMap((row) =>
      row.team_id === null ? [] : [[row.entrant_id, row.team_id] as const],
    ),
  );
  const rosteredEntrantIds = new Set(rosterRows.map((roster) => roster.entrant_id));
  const squadEntrantIds =
    match.status === 'scheduled'
      ? entrantIds.filter(
          (entrantId) =>
            !rosteredEntrantIds.has(entrantId) &&
            entrantVisibility.get(entrantId)?.hiddenAtRequest !== true &&
            teamIdByEntrant.has(entrantId),
        )
      : [];
  const squadPlayersByTeam = await new EnrollmentRepository(db).playersByTeams(
    squadEntrantIds.flatMap((entrantId) => {
      const teamId = teamIdByEntrant.get(entrantId);
      return teamId === undefined ? [] : [teamId];
    }),
  );
  // A registered squad lists the team's players and substitutes only. Coaches and staff are
  // registered to the team too, but they are not on the squad a spectator is shown.
  const squadPlayers = new Map(
    squadEntrantIds.flatMap((entrantId) => {
      const teamId = teamIdByEntrant.get(entrantId);
      const players = (teamId === undefined ? [] : (squadPlayersByTeam.get(teamId) ?? [])).filter(
        (player) => player.role === 'player' || player.role === 'substitute',
      );
      return players.length === 0 ? [] : [[entrantId, players] as const];
    }),
  );
  const squadPersons = await new PersonRepository(db).findPersons(
    [...squadPlayers.values()].flat().map((player) => player.personId),
  );
  const personById = new Map(squadPersons.map((person) => [person.personId, person]));

  const personIds = [
    ...rosterRows.flatMap((roster) => roster.roster_members.map((member) => member.personId)),
    ...[...squadPlayers.values()].flat().map((player) => player.personId),
    ...events.flatMap((event) => (event.personId === undefined ? [] : [event.personId])),
  ];
  const visibilityByPersonId = await personVisibilityById(db, tournament, personIds);
  const rosterByEntrant = new Map(
    rosterRows.map((roster) => [
      roster.entrant_id,
      roster.roster_members.map((member) => {
        const visibility =
          visibilityByPersonId.get(member.personId) ?? personVisibility(tournament);
        const { personId, name, nationality, ...details } = member;
        return {
          ...details,
          ...(visibility.hiddenAtRequest ? { hiddenAtRequest: true } : { personId, name }),
          publicProfileAvailable: visibility.publicProfileAvailable,
          ...(visibility.nationalityVisible && nationality !== undefined ? { nationality } : {}),
        };
      }),
    ]),
  );
  const registeredSquadOf = (entrantId: string | null) => {
    const players = entrantId === null ? undefined : squadPlayers.get(entrantId);
    if (players === undefined) return undefined;
    return players.map((player) => {
      const visibility = visibilityByPersonId.get(player.personId) ?? personVisibility(tournament);
      const person = personById.get(player.personId);
      return {
        ...(visibility.hiddenAtRequest
          ? { hiddenAtRequest: true }
          : { personId: player.personId, ...(person ? { name: person.displayName } : {}) }),
        publicProfileAvailable: visibility.publicProfileAvailable,
        ...(visibility.nationalityVisible && person?.nationality !== undefined
          ? { nationality: person.nationality }
          : {}),
      };
    });
  };
  const homeSquad = registeredSquadOf(match.home_entrant_id);
  const awaySquad = registeredSquadOf(match.away_entrant_id);
  const registeredSquads =
    homeSquad === undefined && awaySquad === undefined
      ? undefined
      : {
          ...(homeSquad === undefined ? {} : { home: homeSquad }),
          ...(awaySquad === undefined ? {} : { away: awaySquad }),
        };
  const scoreAfter =
    match.home_entrant_id === null || match.away_entrant_id === null
      ? new Map<string, readonly [number, number]>()
      : scoreAfterOf(descriptor, events, [match.home_entrant_id, match.away_entrant_id]);
  const homeCrest = publicCrestOf(match.home_entrant_id, entrantDetails, entrantVisibility);
  const awayCrest = publicCrestOf(match.away_entrant_id, entrantDetails, entrantVisibility);
  const segmentNumberById = new Map(segments.map((segment) => [segment.segmentId, segment.number]));
  const definitionByCode = new Map(
    descriptor.eventDefinitions.map((definition) => [definition.code, definition]),
  );
  const result = match.result as unknown as {
    readonly winnerEntrantId?: unknown;
    readonly sides?: readonly { readonly statistics?: Record<string, number> }[];
  } | null;
  const rosterRoles = rosterRolesOf(descriptor);
  const scores = result?.sides === undefined ? undefined : publicScores(result.sides, descriptor);
  const clock =
    match.status === 'in-progress' ? publicClockOf(segments, descriptor, Date.now()) : undefined;
  const status = publicMatchStatus(match.status);
  const rulesetData = await new TournamentRepository(db).findLatestRuleset(tournament.tournamentId);
  // Counters are shown while a match is in progress or once it is finalized. A match that is
  // scheduled, forfeited or not required has no counters to show, so the field is omitted.
  const counters =
    match.status === 'in-progress' || match.status === 'finalized'
      ? publicMatchCountersOf({
          descriptor,
          overrides: rulesetData?.overrides,
          finished: status === 'final',
          segments,
          events,
          rosters: rosterRows.map((roster) => ({
            entrantId: roster.entrant_id,
            members: roster.roster_members,
          })),
          entrantIds: [match.home_entrant_id, match.away_entrant_id],
        })
      : undefined;
  // A page follows its match's stream when the discipline shows a counter or declares a timed penalty.
  const tracksLiveIndicators =
    resolveEffectiveMatchCounters(descriptor, rulesetData?.overrides).length > 0 ||
    descriptor.eventDefinitions.some((definition) =>
      (definition.effects ?? []).some((effect) => effect.kind === 'timed-penalty'),
    );
  const activePenalties =
    match.status === 'in-progress'
      ? livePenaltiesOf(
          descriptor,
          events,
          await competition.resolvedTimerIds(match.match_id),
          [match.home_entrant_id, match.away_entrant_id],
          Date.now(),
        )
      : [];
  const stageName = stage.name.trim();
  const winnerEntrantId =
    status === 'final' &&
    typeof result?.winnerEntrantId === 'string' &&
    result.winnerEntrantId.length > 0
      ? result.winnerEntrantId
      : undefined;

  return {
    organizationAlias,
    organizationName,
    organizationTimeZone,
    tournamentAlias,
    tournamentName: tournament.name,
    ...(targetRecord.games.length > 1 && game !== undefined
      ? {
          gameNumber: game.number,
          games: targetRecord.games.map((candidate) => ({
            number: candidate.number,
            status: gameStatusOf(candidate.status),
          })),
        }
      : {}),
    ...(descriptor.images === undefined
      ? {}
      : { disciplineImages: descriptor.images.map((reference) => ({ ...reference })) }),
    stageNumber,
    ...(stageName.length > 0 ? { stageName } : {}),
    ...(fixtureScope.zoneName === undefined ? {} : { zoneName: fixtureScope.zoneName }),
    ...(fixtureScope.groupName === undefined ? {} : { groupName: fixtureScope.groupName }),
    stageFormat: zoneFormatOfMatch ?? stage.format,
    matchNumber,
    round: match.round,
    status,
    ...(winnerEntrantId === undefined ? {} : { winnerEntrantId }),
    ...(match.home_entrant_id === null ? {} : { homeEntrantId: match.home_entrant_id }),
    ...(match.home_entrant_id === null ||
    entrantVisibility.get(match.home_entrant_id)?.hiddenAtRequest === true
      ? {}
      : { homeName: entrantDetails.get(match.home_entrant_id)?.name ?? 'Unknown' }),
    ...(match.home_entrant_id !== null &&
    entrantVisibility.get(match.home_entrant_id)?.hiddenAtRequest === true
      ? { homeHiddenAtRequest: true }
      : {}),
    ...(match.home_entrant_id === null || entrantVisibility.get(match.home_entrant_id) === undefined
      ? {}
      : {
          homePublicProfileAvailable: entrantVisibility.get(match.home_entrant_id)
            ?.publicProfileAvailable,
        }),
    ...(match.home_entrant_id === null ||
    entrantVisibility.get(match.home_entrant_id)?.publicProfileAvailable === false
      ? {}
      : { homeAbbreviation: entrantDetails.get(match.home_entrant_id)?.abbreviation }),
    ...(match.home_entrant_id === null ||
    entrantVisibility.get(match.home_entrant_id)?.publicProfileAvailable === false ||
    !entrantDetails.get(match.home_entrant_id)?.clubAlias
      ? {}
      : { homeClubAlias: entrantDetails.get(match.home_entrant_id)?.clubAlias }),
    ...(match.away_entrant_id === null ? {} : { awayEntrantId: match.away_entrant_id }),
    ...(match.away_entrant_id === null ||
    entrantVisibility.get(match.away_entrant_id)?.hiddenAtRequest === true
      ? {}
      : { awayName: entrantDetails.get(match.away_entrant_id)?.name ?? 'Unknown' }),
    ...(match.away_entrant_id !== null &&
    entrantVisibility.get(match.away_entrant_id)?.hiddenAtRequest === true
      ? { awayHiddenAtRequest: true }
      : {}),
    ...(match.away_entrant_id === null || entrantVisibility.get(match.away_entrant_id) === undefined
      ? {}
      : {
          awayPublicProfileAvailable: entrantVisibility.get(match.away_entrant_id)
            ?.publicProfileAvailable,
        }),
    ...(match.away_entrant_id === null ||
    entrantVisibility.get(match.away_entrant_id)?.publicProfileAvailable === false
      ? {}
      : { awayAbbreviation: entrantDetails.get(match.away_entrant_id)?.abbreviation }),
    ...(match.away_entrant_id === null ||
    entrantVisibility.get(match.away_entrant_id)?.publicProfileAvailable === false ||
    !entrantDetails.get(match.away_entrant_id)?.clubAlias
      ? {}
      : { awayClubAlias: entrantDetails.get(match.away_entrant_id)?.clubAlias }),
    ...(homeCrest.clubId === undefined ? {} : { homeClubId: homeCrest.clubId }),
    ...(homeCrest.emblemObjectId === undefined
      ? {}
      : { homeEmblemObjectId: homeCrest.emblemObjectId }),
    ...(awayCrest.clubId === undefined ? {} : { awayClubId: awayCrest.clubId }),
    ...(awayCrest.emblemObjectId === undefined
      ? {}
      : { awayEmblemObjectId: awayCrest.emblemObjectId }),
    ...(match.stream_url === null ? {} : { streamUrl: match.stream_url }),
    ...(scores?.[0] === undefined ? {} : { homeScore: scores[0] }),
    ...(scores?.[1] === undefined ? {} : { awayScore: scores[1] }),
    ...(schedule === undefined ? {} : { scheduledAt: scheduleStartsAt(schedule.starts_at) }),
    ...(schedule?.venue_name === null || schedule?.venue_name === undefined
      ? {}
      : { venueName: schedule.venue_name }),
    ...(await readPublicScheduleChanges(db, [match.match_id])).get(match.match_id),
    ...fixtureSources.get(match.match_id),
    schedulePublished: schedule?.published ?? false,
    officials: officials.map((official) => ({
      name: official.display_name,
      roles: [...official.roles],
    })),
    ...(rosterRoles === undefined ? {} : { rosterRoles }),
    ...(registeredSquads === undefined ? {} : { registeredSquads }),
    rosters: {
      home: match.home_entrant_id
        ? (rosterByEntrant.get(match.home_entrant_id) ?? []).map(({ roles, ...member }) => ({
            ...member,
            ...(roles === undefined ? {} : { roles: [...roles] }),
          }))
        : [],
      away: match.away_entrant_id
        ? (rosterByEntrant.get(match.away_entrant_id) ?? []).map(({ roles, ...member }) => ({
            ...member,
            ...(roles === undefined ? {} : { roles: [...roles] }),
          }))
        : [],
    },
    timeline: events.map((event) => {
      const definition = definitionByCode.get(event.definitionCode);
      const workflowOutcomeCodes = definition?.workflow?.options.map(
        (option) => option.definitionCode,
      );
      return {
        eventId: event.eventId,
        definitionCode: event.definitionCode,
        ...eventLabelFields(definition, event.definitionCode),
        ...(workflowOutcomeCodes === undefined ? {} : { workflowOutcomeCodes }),
        occurredAt: event.occurredAt,
        sequence: event.sequence,
        ...(event.segmentId === undefined
          ? {}
          : { segmentNumber: segmentNumberById.get(event.segmentId) }),
        ...(event.segmentElapsedSeconds === undefined
          ? {}
          : { segmentElapsedSeconds: event.segmentElapsedSeconds }),
        ...(scoreAfter.get(event.eventId) === undefined
          ? {}
          : { scoreAfter: scoreAfter.get(event.eventId) as [number, number] }),
        ...(event.side === undefined ? {} : { side: event.side }),
        ...(event.personId === undefined ||
        visibilityByPersonId.get(event.personId)?.hiddenAtRequest === true
          ? {}
          : { personId: event.personId }),
        ...(event.personId !== undefined &&
        visibilityByPersonId.get(event.personId)?.hiddenAtRequest === true
          ? { hiddenAtRequest: true }
          : {}),
        payload: event.payload,
      };
    }),
    ...(segments.length === 0
      ? {}
      : {
          segments: segmentSummariesOf(descriptor, segments, events, [
            match.home_entrant_id ?? undefined,
            match.away_entrant_id ?? undefined,
          ]),
        }),
    ...(clock === undefined ? {} : { clock }),
    ...(counters === undefined ? {} : { counters }),
    matchId: match.match_id,
    ...(tracksLiveIndicators ? { tracksLiveIndicators: true as const } : {}),
    ...(activePenalties.length === 0 ? {} : { activePenalties }),
  };
}

/** A side's crest: its club id and emblem, withheld when the side's public profile is unavailable. */
function publicCrestOf(
  entrantId: string | null,
  details: ReadonlyMap<string, { readonly clubId?: string; readonly emblemObjectId?: string }>,
  visibility: ReadonlyMap<string, { readonly publicProfileAvailable: boolean }>,
): { readonly clubId?: string; readonly emblemObjectId?: string } {
  if (entrantId === null || visibility.get(entrantId)?.publicProfileAvailable === false) return {};
  const detail = details.get(entrantId);
  return {
    ...(detail?.clubId === undefined ? {} : { clubId: detail.clubId }),
    ...(detail?.emblemObjectId === undefined ? {} : { emblemObjectId: detail.emblemObjectId }),
  };
}

async function resolveFixtureScopeContext(
  db: Kysely<Database>,
  fixtureId: string,
): Promise<{
  readonly zoneFormat?: string;
  readonly zoneName?: string;
  readonly groupName?: string;
}> {
  const row = await db
    .selectFrom('fixtures')
    .leftJoin('groups', (join) =>
      join.onRef('groups.group_id', '=', 'fixtures.group_id').on('groups.deleted_at', 'is', null),
    )
    .leftJoin('zones as fixture_zones', (join) =>
      join
        .onRef('fixture_zones.zone_id', '=', 'fixtures.zone_id')
        .on('fixture_zones.deleted_at', 'is', null),
    )
    .leftJoin('zones as group_zones', (join) =>
      join
        .onRef('group_zones.zone_id', '=', 'groups.zone_id')
        .on('group_zones.deleted_at', 'is', null),
    )
    .select([
      'fixture_zones.format as fixture_zone_format',
      'fixture_zones.name as fixture_zone_name',
      'fixture_zones.number as fixture_zone_number',
      'group_zones.format as group_zone_format',
      'group_zones.name as group_zone_name',
      'group_zones.number as group_zone_number',
      'groups.name as group_name',
      'groups.number as group_number',
    ])
    .where('fixtures.fixture_id', '=', fixtureId)
    .executeTakeFirst();
  if (!row) return {};

  const zoneFormat = row.fixture_zone_format ?? row.group_zone_format ?? undefined;
  const zoneNameRaw = row.fixture_zone_name ?? row.group_zone_name;
  const zoneNumberRaw = row.fixture_zone_number ?? row.group_zone_number;
  const zone =
    zoneNameRaw === null || zoneNumberRaw === null
      ? undefined
      : { name: zoneNameRaw, number: zoneNumberRaw };
  const group =
    row.group_name === null || row.group_number === null
      ? undefined
      : { name: row.group_name, number: row.group_number };
  return {
    ...(zoneFormat === undefined ? {} : { zoneFormat }),
    ...(zone === undefined || isImplicitZone(zone) ? {} : { zoneName: zone.name }),
    ...(group === undefined || isImplicitGroup(group) ? {} : { groupName: group.name }),
  };
}
