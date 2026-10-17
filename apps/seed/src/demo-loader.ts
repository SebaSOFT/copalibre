import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  EventLog,
  type DisciplineDescriptor,
  type MatchRosterMember,
  type Segment,
} from '@copalibre/domain';
import {
  datasetDirectory,
  readDataset,
  validateDatasetDirectory,
  type DemoDataset,
  type DemoGame,
  type DemoPlayer,
} from '@copalibre/demo-datasets';
import type { ObjectReference, ObjectStorageAdapter } from '@copalibre/object-storage';
import {
  CompetitionRepository,
  EnrollmentRepository,
  ObjectMetadataRepository,
  OrganizationRepository,
  PersonRepository,
  ProjectionStore,
  ScheduleRepository,
  TournamentRepository,
  ZoneEntrantResolution,
  newId,
  withTransaction,
  type Database,
  type UnitOfWork,
  type ZoneEntrantResolver,
} from '@copalibre/persistence';
import { resolvePersistedNodes } from '@copalibre/tournament-engine';
import type { Kysely } from 'kysely';
import type { DemoAnchor, DemoCutoff } from './arguments.js';
import { CupGraphError, inferCupGraph, type InferredCup } from './cup-graph.js';
import { daysBetween, localDateOf, localToEpoch, shiftLocalDate } from './zoned-time.js';

/** The engine's persisted-graph resolution, bound to persistence's port as the API binds it. */
const resolveZone: ZoneEntrantResolver = resolvePersistedNodes;

/** What a demo load did, for the operator and for tests. */
export interface DemoLoadReport {
  readonly dataset: string;
  readonly status: 'installed' | 'skipped';
  readonly counts: {
    readonly clubs: number;
    readonly players: number;
    readonly entrants: number;
    readonly stages: number;
    readonly fixtures: number;
    readonly matchesFinalized: number;
    readonly goalEvents: number;
    readonly venues: number;
    readonly officials: number;
    readonly scheduledMatches: number;
    readonly emblems: number;
  };
  /** How the load was shaped in time and progress; present when it installed. */
  readonly shaping?: {
    /** The first game day as loaded, in the organization's time zone. */
    readonly firstGameDay: string;
    /** The cutoff instant, when one was given. */
    readonly playedUntil?: string;
    /** Whether the cups' qualification was confirmed, which needs every group game played. */
    readonly qualificationConfirmed: boolean;
    /** Fixtures with a side still to be decided. */
    readonly undecidedFixtures: number;
  };
  /** Set on a skipped load that was given --anchor or --played-until: they were not applied. */
  readonly flagsIgnored?: boolean;
}

/** The dataset cannot be loaded as it stands: invalid, or its prerequisites are not installed. */
export class DemoDatasetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DemoDatasetError';
  }
}

const EMPTY_COUNTS: DemoLoadReport['counts'] = {
  clubs: 0,
  players: 0,
  entrants: 0,
  stages: 0,
  fixtures: 0,
  matchesFinalized: 0,
  goalEvents: 0,
  venues: 0,
  officials: 0,
  scheduledMatches: 0,
  emblems: 0,
};

const SLOT_MINUTES = 15;
const HALF_SECONDS = 1500;

export interface LoadDemoOptions {
  readonly dataset: DemoDataset;
  /** Reads a dataset-relative file, such as an emblem. */
  readonly readAsset: (relativePath: string) => Promise<Buffer>;
  /** Told when each phase of the load starts, for the operator. */
  readonly onProgress?: (message: string) => void;
  /** Where the first game day lands; the published dates without one. */
  readonly anchor?: DemoAnchor;
  /** Up to when games are played; every game without one. */
  readonly playedUntil?: DemoCutoff;
  /** The clock `today` and `now` read; the wall clock by default. */
  readonly now?: () => number;
}

/**
 * Loads a demo dataset in one transaction, after checking its discipline is installed. Emblems are uploaded
 * first (inside the transaction's callback) and deleted again if anything fails, as the catalogue seeder does.
 * Safe to repeat: a dataset whose tournament already exists is reported as skipped and nothing is written.
 */
export async function loadDemoDataset(
  db: Kysely<Database>,
  storage: ObjectStorageAdapter,
  options: LoadDemoOptions,
): Promise<DemoLoadReport> {
  const { dataset } = options;
  const tournaments = new TournamentRepository(db);

  const descriptor = await tournaments.findDescriptorByAlias(
    dataset.discipline.alias,
    dataset.discipline.version,
  );
  if (!descriptor) {
    throw new DemoDatasetError(
      `The ${dataset.discipline.alias}@${dataset.discipline.version} discipline is not installed. ` +
        `Install it first (for example with "copalibre module add"); demo loading never installs modules.`,
    );
  }

  const organization = await new OrganizationRepository(db).findByAlias(dataset.organization.alias);
  if (organization) {
    const present = await tournaments.findByScopedAlias(
      dataset.organization.alias,
      dataset.tournament.alias,
    );
    if (present)
      return {
        dataset: dataset.alias,
        status: 'skipped',
        counts: EMPTY_COUNTS,
        ...(options.anchor === undefined && options.playedUntil === undefined
          ? {}
          : { flagsIgnored: true }),
      };
    throw new DemoDatasetError(
      `The organization "${dataset.organization.alias}" exists without the tournament ` +
        `"${dataset.tournament.alias}". Reset the development database (docker compose down -v) and load again.`,
    );
  }

  const uploaded: ObjectReference[] = [];
  try {
    return await withTransaction(db, (uow) =>
      loadInto(uow, storage, descriptor, options, uploaded),
    );
  } catch (error) {
    await Promise.allSettled(uploaded.map((reference) => storage.delete(reference)));
    throw error;
  }
}

/** Reads, validates and loads a committed dataset by alias. */
export async function loadDemoDatasetByAlias(
  db: Kysely<Database>,
  storage: ObjectStorageAdapter,
  alias: string,
  root?: string,
  onProgress?: (message: string) => void,
  shaping: Pick<LoadDemoOptions, 'anchor' | 'playedUntil' | 'now'> = {},
): Promise<DemoLoadReport> {
  const directory = datasetDirectory(alias, root);
  const issues = await validateDatasetDirectory(directory);
  if (issues.length > 0) {
    throw new DemoDatasetError(
      `Dataset "${alias}" is invalid:\n${issues.map((i) => `  ${i.file} ${i.path} ${i.message}`).join('\n')}`,
    );
  }
  const dataset = await readDataset(alias, root);
  return loadDemoDataset(db, storage, {
    dataset,
    readAsset: (relativePath) => readFile(path.join(directory, relativePath)),
    ...(onProgress === undefined ? {} : { onProgress }),
    ...shaping,
  });
}

async function loadInto(
  uow: UnitOfWork,
  storage: ObjectStorageAdapter,
  descriptor: DisciplineDescriptor,
  options: LoadDemoOptions,
  uploaded: ObjectReference[],
): Promise<DemoLoadReport> {
  const { dataset } = options;
  const say = options.onProgress ?? (() => undefined);
  const timeZone = dataset.organization.timezone;
  const actor = 'system:demo-dataset';
  const context = 'system:demo.load';

  // --- organization ----------------------------------------------------------
  say('creating the organization');
  const organization = await new OrganizationRepository(uow.tx).create(uow, {
    alias: dataset.organization.alias,
    name: dataset.organization.name,
    primaryLanguage: dataset.organization.primaryLanguage,
    timezone: timeZone,
    actor,
    authorizationContext: context,
  });
  const organizationId = organization.organizationId;
  const audit = { organizationId, actor, authorizationContext: context } as const;

  // Every repository is built over the open transaction, not the pool: several of them look a row up through
  // their own handle before updating it (a club, a tournament), and a row written earlier in this transaction is
  // invisible to any other connection.
  const tx = uow.tx;
  const enrollment = new EnrollmentRepository(tx);
  const persons = new PersonRepository(tx);
  const competition = new CompetitionRepository(tx);
  const schedules = new ScheduleRepository(tx);
  const objects = new ObjectMetadataRepository(tx);
  const tournamentRepository = new TournamentRepository(tx);

  const storeEmblem = async (
    relativePath: string,
    folder: string,
    name: string,
  ): Promise<string> => {
    const bytes = await options.readAsset(relativePath);
    const reference = await storage.put(
      `${organizationId}/${folder}/${newId()}-${name}.png`,
      bytes,
      'image/png',
    );
    uploaded.push(reference);
    const metadata = await objects.save(uow, {
      organizationId,
      profile: storage.profile,
      storageKey: reference.key,
      contentType: 'image/png',
      sizeBytes: bytes.length,
      uploadedBy: actor,
    });
    return metadata.objectId;
  };

  if (dataset.organization.emblem !== undefined) {
    await new OrganizationRepository(tx).updateSettings(uow, organizationId, {
      emblemObjectId: await storeEmblem(dataset.organization.emblem, 'emblem', 'organization'),
      actor,
      authorizationContext: context,
    });
  }

  // --- clubs, teams, emblems ---------------------------------------------------
  say(`creating ${dataset.clubs.length} clubs with emblems`);
  const teamIdByAlias = new Map<string, string>();
  const clubByTeam = new Map(dataset.teams.map((team) => [team.alias, team.clubAlias]));
  const clubIdByAlias = new Map<string, string>();
  for (const club of dataset.clubs) {
    const created = await enrollment.createClub(uow, {
      organizationId,
      name: club.name,
      alias: club.alias,
      abbreviation: club.abbreviation,
      actor,
      authorizationContext: context,
      origin: 'import',
    });
    clubIdByAlias.set(club.alias, created.clubId);
    const emblemObjectId = await storeEmblem(club.emblem, `clubs/${created.clubId}`, club.alias);
    await enrollment.updateClub(uow, {
      clubId: created.clubId,
      organizationId,
      emblemObjectId,
      actor,
      authorizationContext: context,
    });
  }
  for (const team of dataset.teams) {
    const created = await enrollment.createTeam(uow, {
      organizationId,
      alias: team.alias,
      clubId: clubIdByAlias.get(clubByTeam.get(team.alias) ?? team.clubAlias) as string,
      name: team.name,
      abbreviation: team.abbreviation,
      actor,
      authorizationContext: context,
    });
    teamIdByAlias.set(team.alias, created.teamId);
  }

  // --- players ----------------------------------------------------------------
  say(`creating ${dataset.players.length} players`);
  const personByPlayer = new Map<string, { personId: string; player: DemoPlayer }>();
  for (const player of dataset.players) {
    const displayName = `${player.givenNames} ${player.surname}`;
    const { person } = await persons.register(uow, {
      organizationId,
      displayName,
      actor,
      authorizationContext: context,
    });
    if (player.nationality) {
      await persons.setNationality(uow, {
        personId: person.personId,
        organizationId,
        nationality: player.nationality,
        actor,
        authorizationContext: context,
      });
    }
    await persons.enlist(uow, {
      personId: person.personId,
      teamId: teamIdByAlias.get(player.teamAlias) as string,
      role: 'player',
      organizationId,
      actor,
      authorizationContext: context,
    });
    personByPlayer.set(player.alias, { personId: person.personId, player });
  }

  // --- tournament, entrants ----------------------------------------------------
  say('creating the tournament and registering entrants');
  const tournament = await tournamentRepository.create(uow, {
    organizationId,
    alias: dataset.tournament.alias,
    name: dataset.tournament.name,
    descriptor,
    actor,
    authorizationContext: context,
    origin: 'import',
  });
  const tournamentId = tournament.tournamentId;
  await tournamentRepository.updateEmblem(uow, {
    tournamentId,
    organizationId,
    emblemObjectId: await storeEmblem(dataset.tournament.emblem, 'tournaments', 'tournament'),
    actor,
    authorizationContext: context,
  });
  await competition.createSeason(uow, {
    tournamentId,
    name: dataset.tournament.season,
    ordinal: 1,
    ...audit,
  });

  const entrantByTeam = new Map<string, string>();
  for (const team of dataset.teams) {
    const entrant = await enrollment.registerEntrant(uow, {
      tournamentId,
      entrantRef: { kind: 'team', teamId: teamIdByAlias.get(team.alias) as string },
      ...audit,
      origin: 'import',
    });
    await enrollment.setEntrantStatus(uow, {
      entrantId: entrant.entrantId,
      status: 'accepted',
      ...audit,
    });
    entrantByTeam.set(team.alias, entrant.entrantId);
  }

  // --- stages: groups, then cups as zones (design D12) ---------------------------
  say('creating stages, groups and zones');
  const groupPhases = dataset.phases.filter((phase) => phase.kind === 'group');
  const cupPhases = dataset.phases.filter((phase) => phase.kind === 'cup');
  const groupsStage = await competition.createStageInTournament(uow, {
    tournamentId,
    number: 1,
    name: 'Fase de grupos',
    format: 'round-robin',
    ...audit,
  });
  const cupsStage = await competition.createStageInTournament(uow, {
    tournamentId,
    number: 2,
    name: 'Copas',
    format: 'single-elimination',
    ...audit,
  });

  const everyone = Object.fromEntries(
    [...entrantByTeam.values()].map((entrantId) => [entrantId, 1] as const),
  );
  const groupsZones = await competition.assignZonesManually(uow, {
    stageId: groupsStage.stageId,
    assignment: { groups: everyone },
    zoneCount: 1,
    ...audit,
  });
  const groupsZone = groupsZones.entities[0];
  if (!groupsZone) throw new DemoDatasetError('The groups stage produced no zone');
  await competition.renameZone(uow, { zoneId: groupsZone.zoneId, name: 'Grupos', ...audit });
  const groupNumbers = Object.fromEntries(
    groupPhases.flatMap((phase, index) =>
      phase.teamAliases.map((alias) => [entrantByTeam.get(alias) as string, index + 1] as const),
    ),
  );
  const groups = await competition.assignGroupsManually(uow, {
    zoneId: groupsZone.zoneId,
    assignment: { groups: groupNumbers },
    groupCount: groupPhases.length,
    ...audit,
  });
  const groupIdByPhase = new Map<string, string>();
  for (const [index, phase] of groupPhases.entries()) {
    const group = groups.entities[index];
    if (!group) throw new DemoDatasetError(`No group was created for ${phase.alias}`);
    await competition.renameGroup(uow, { groupId: group.groupId, name: phase.name, ...audit });
    groupIdByPhase.set(phase.alias, group.groupId);
  }

  const cupNumbers = Object.fromEntries(
    cupPhases.flatMap((phase, index) =>
      phase.teamAliases.map((alias) => [entrantByTeam.get(alias) as string, index + 1] as const),
    ),
  );
  const cupZones = await competition.assignZonesManually(uow, {
    stageId: cupsStage.stageId,
    assignment: { groups: cupNumbers },
    zoneCount: cupPhases.length,
    ...audit,
  });
  const zoneIdByPhase = new Map<string, string>();
  for (const [index, phase] of cupPhases.entries()) {
    const zone = cupZones.entities[index];
    if (!zone) throw new DemoDatasetError(`No zone was created for ${phase.alias}`);
    await competition.renameZone(uow, { zoneId: zone.zoneId, name: phase.name, ...audit });
    zoneIdByPhase.set(phase.alias, zone.zoneId);
  }

  // --- fixtures and their matches ------------------------------------------------
  say(`creating ${dataset.games.length} fixtures`);
  const games = [...dataset.games].sort((a, b) =>
    a.key.localeCompare(b.key, 'en', { numeric: true }),
  );
  const isCup = (game: DemoGame): boolean => zoneIdByPhase.has(game.phaseAlias);
  const matchIdByGame = new Map<string, string>();

  const groupGames = games.filter((game) => !isCup(game));
  const groupFixtures = await competition.createFixtures(uow, {
    stageId: groupsStage.stageId,
    fixtures: groupGames.map((game) => ({
      round: game.roundNumber,
      homeEntrantId: entrantByTeam.get(game.homeTeamAlias) as string,
      awayEntrantId: entrantByTeam.get(game.awayTeamAlias) as string,
      groupId: groupIdByPhase.get(game.phaseAlias) as string,
    })),
    ...audit,
  });
  const groupMatches = await competition.listMatchesForStage(groupsStage.stageId, uow);
  for (const [index, game] of groupGames.entries()) {
    const match = groupMatches.find(
      (candidate) => candidate.fixtureId === groupFixtures[index]?.fixtureId,
    );
    if (!match) throw new DemoDatasetError(`No match was created for ${game.key}`);
    matchIdByGame.set(game.key, match.matchId);
  }

  // Cups are persisted brackets (design D4): later sides are edges to the game their entrant came
  // from, and first-round sides are qualifier positions of one manual plan from the groups.
  const cups: { readonly zoneId: string; readonly cup: InferredCup }[] = [];
  for (const phase of cupPhases) {
    try {
      cups.push({
        zoneId: zoneIdByPhase.get(phase.alias) as string,
        cup: inferCupGraph(games.filter((game) => game.phaseAlias === phase.alias)),
      });
    } catch (error) {
      if (error instanceof CupGraphError)
        throw new DemoDatasetError(`${phase.alias}: ${error.message}`);
      throw error;
    }
  }
  const qualifierOrder = cups.flatMap(({ cup }) =>
    cup.seats.map((alias) => entrantByTeam.get(alias) as string),
  );
  const plan = await competition.createPromotionPlan(uow, {
    zoneId: groupsZone.zoneId,
    nextStageId: cupsStage.stageId,
    plan: {
      perGroupAdvance: Object.fromEntries(
        groupPhases.map((phase, index) => [index + 1, phase.teamAliases.length]),
      ),
      combination: { mode: 'manual', order: qualifierOrder },
      bands: cupPhases.map((phase, index) => ({
        zoneRef: phase.name,
        count: cups[index]?.cup.seats.length ?? 0,
      })),
    },
    ...audit,
  });
  // One publish for every cup, as seeding does: it materializes each zone's implicit group before
  // the first fixture makes the stage's structure immutable.
  let offset = 0;
  const plans = cups.map(({ zoneId, cup }) => {
    const base = offset;
    offset += cup.seats.length;
    return {
      zoneId,
      nodes: cup.nodes((seat) => ({
        kind: 'qualifier' as const,
        promotionPlanId: plan.promotionPlanId,
        position: base + seat,
      })),
    };
  });
  await competition.publishFixturePlans(uow, { stageId: cupsStage.stageId, plans, ...audit });
  for (const { zoneId, cup } of cups) {
    const created = await tx
      .selectFrom('fixtures')
      .innerJoin('matches', 'matches.fixture_id', 'fixtures.fixture_id')
      .select(['fixtures.node_key', 'matches.match_id'])
      .where('fixtures.zone_id', '=', zoneId)
      .execute();
    for (const [gameKey, nodeKey] of cup.nodeKeyByGame) {
      const match = created.find((row) => row.node_key === nodeKey);
      if (!match) throw new DemoDatasetError(`No match was created for ${gameKey}`);
      matchIdByGame.set(gameKey, match.match_id);
    }
  }

  // --- venues, officials, schedule -------------------------------------------------
  say('creating venues, officials and the schedule');
  const venueIdByAlias = new Map<string, string>();
  for (const venue of dataset.venues) {
    const created = await schedules.createVenue(uow, {
      organizationId,
      alias: venue.alias,
      name: venue.name,
      concurrentCapacity: 1,
      actor,
      authorizationContext: context,
    });
    venueIdByAlias.set(venue.alias, created.venueId);
  }
  const officialIdByName = new Map<string, string>();
  for (const game of games) {
    for (const person of game.officials) {
      const displayName = `${person.givenNames} ${person.surname}`;
      if (officialIdByName.has(displayName)) continue;
      const created = await schedules.createOfficial(uow, {
        organizationId,
        displayName,
        roles: ['referee'],
        actor,
        authorizationContext: context,
      });
      officialIdByName.set(displayName, created.officialId);
    }
  }

  // Dates move by whole calendar days on the wall-clock string (design D1); `today` and `now` read
  // one clock (design D2).
  const clock = options.now ?? Date.now;
  const publishedFirstDay = games.map((game) => game.scheduledAt.slice(0, 10)).sort()[0] as string;
  const firstGameDay =
    options.anchor === undefined
      ? publishedFirstDay
      : options.anchor.kind === 'today'
        ? localDateOf(clock(), timeZone)
        : options.anchor.date;
  const dayOffset = daysBetween(publishedFirstDay, firstGameDay);
  const kickoff = (game: DemoGame): number =>
    localToEpoch(shiftLocalDate(game.scheduledAt, dayOffset), timeZone);
  const cutoff =
    options.playedUntil === undefined
      ? Number.POSITIVE_INFINITY
      : options.playedUntil.kind === 'now'
        ? clock()
        : options.playedUntil.at;
  // A game is played when its nominal finish is at or before the cutoff (design D3).
  const played = (game: DemoGame): boolean => kickoff(game) + 2 * HALF_SECONDS * 1000 <= cutoff;
  const first = Math.min(...games.map(kickoff));
  const last = Math.max(...games.map(kickoff));
  const schedule = await schedules.createSchedule(uow, {
    organizationId,
    name: 'Programacion',
    startsAt: first,
    endsAt: last + SLOT_MINUTES * 60_000,
    slotMinutes: SLOT_MINUTES,
    turnaroundMinutes: 0,
    venueIds: [...venueIdByAlias.values()],
    actor,
    authorizationContext: context,
  });
  const slots = await schedules.listScheduleSlots(schedule.scheduleId, uow);
  const slotIdByVenueAndStart = new Map(
    slots.map((slot) => [`${slot.venueId}|${slot.startsAt}`, slot.slotId] as const),
  );
  const assignments = games.map((game) => {
    const venueId = venueIdByAlias.get(game.venueAlias ?? '');
    const slotId =
      venueId === undefined ? undefined : slotIdByVenueAndStart.get(`${venueId}|${kickoff(game)}`);
    if (slotId === undefined) throw new DemoDatasetError(`No schedule slot fits ${game.key}`);
    const officialIds = [
      ...new Set(
        game.officials
          .map((person) => officialIdByName.get(`${person.givenNames} ${person.surname}`))
          .filter((id): id is string => id !== undefined),
      ),
    ];
    return {
      matchId: matchIdByGame.get(game.key) as string,
      slotId,
      ...(officialIds.length === 0 ? {} : { officialIds }),
    };
  });
  await schedules.publishSchedule(uow, { assignments, origin: 'import', ...audit });

  // --- results: the same repository sequence as the API's bulk-load (design D5) ----
  say('recording results');
  const playersByTeam = new Map<string, DemoPlayer[]>();
  for (const player of dataset.players) {
    playersByTeam.set(player.teamAlias, [...(playersByTeam.get(player.teamAlias) ?? []), player]);
  }
  const eventCode = (detail: string | undefined): string => {
    const wanted =
      detail === 'falta directa'
        ? 'direct-free-kick-goal'
        : detail === 'penalti'
          ? 'penalty-goal'
          : 'goal';
    return descriptor.eventDefinitions.some((definition) => definition.code === wanted)
      ? wanted
      : 'goal';
  };
  let goalEvents = 0;
  let matchesFinalized = 0;
  const play = async (game: DemoGame, drawWinner?: string): Promise<void> => {
    const matchId = matchIdByGame.get(game.key) as string;
    const entrantIds = [
      entrantByTeam.get(game.homeTeamAlias) as string,
      entrantByTeam.get(game.awayTeamAlias) as string,
    ];
    for (const [teamAlias, entrantId] of [
      [game.homeTeamAlias, entrantIds[0]],
      [game.awayTeamAlias, entrantIds[1]],
    ] as const) {
      const members: MatchRosterMember[] = (playersByTeam.get(teamAlias) ?? []).map((player) => {
        const person = personByPlayer.get(player.alias);
        return {
          personId: person?.personId as string,
          ...(player.dorsal === undefined ? {} : { number: player.dorsal }),
          name: `${player.givenNames} ${player.surname}`,
          ...(player.nationality === undefined ? {} : { nationality: player.nationality }),
          ...(player.roles.length === 0 ? {} : { roles: [...player.roles] }),
          onField: false,
        };
      });
      await competition.setMatchRoster(uow, {
        matchId,
        entrantId: entrantId as string,
        members,
        ...audit,
      });
    }

    const segments: Segment[] = [];
    for (const number of [1, 2]) {
      const created = await competition.createSegment(uow, {
        matchId,
        type: 'half',
        number,
        ...audit,
      });
      await competition.setSegmentState(uow, {
        segmentId: created.segmentId,
        state: 'completed',
        ...audit,
      });
      segments.push(
        await competition.adjustSegmentClock(uow, {
          segmentId: created.segmentId,
          elapsedSeconds: HALF_SECONDS,
          ...audit,
        }),
      );
    }

    const log = new EventLog(descriptor);
    const kickoffAt = kickoff(game);
    for (const [index, event] of game.events.entries()) {
      const half = event.period === 'P2' ? 1 : 0;
      const [minutes = '0', seconds = '0'] = event.clock.split(':');
      const remaining = Number(minutes) * 60 + Number(seconds);
      const elapsed = Math.max(0, HALF_SECONDS - remaining);
      const person =
        event.playerAlias === undefined ? undefined : personByPlayer.get(event.playerAlias);
      const validated = log.record({
        eventId: newId(),
        matchId,
        segment: segments[half] as Segment,
        definitionCode: eventCode(event.detail),
        occurredAt: new Date(kickoffAt + (half * HALF_SECONDS + elapsed) * 1000).toISOString(),
        side: entrantByTeam.get(event.teamAlias) as string,
        ...(person === undefined ? {} : { personId: person.personId }),
        segmentElapsedSeconds: elapsed,
        entrantIds,
      });
      if (!validated.ok) {
        throw new DemoDatasetError(`${game.key} event ${index + 1}: ${validated.error.message}`);
      }
      await competition.appendEvent(uow, { event: validated.value, sequence: index + 1, ...audit });
      goalEvents += 1;
    }

    const homeEntrant = entrantIds[0] as string;
    const awayEntrant = entrantIds[1] as string;
    await competition.recordResult(uow, {
      matchId,
      result: {
        sides: [
          {
            entrantId: homeEntrant,
            statistics: { 'goals-for': game.homeGoals, 'goals-against': game.awayGoals },
            resultReason: 'played',
          },
          {
            entrantId: awayEntrant,
            statistics: { 'goals-for': game.awayGoals, 'goals-against': game.homeGoals },
            resultReason: 'played',
          },
        ],
        ...(game.homeGoals === game.awayGoals
          ? drawWinner === undefined
            ? {}
            : { winnerEntrantId: drawWinner }
          : { winnerEntrantId: game.homeGoals > game.awayGoals ? homeEntrant : awayEntrant }),
        recordedAt: new Date(kickoffAt + 2 * HALF_SECONDS * 1000).toISOString(),
      },
      ...audit,
    });
    const projectionVersion = await new ProjectionStore(tx).nextVersion(uow, {
      projectionType: 'match-console',
      entityId: matchId,
    });
    await uow.publishEvent({
      organizationId,
      stream: `match:${matchId}`,
      entityId: matchId,
      eventType: 'match.console-projection',
      projectionVersion,
      payload: { matchId, status: 'finalized' },
    });
    matchesFinalized += 1;
  };

  for (const game of groupGames) {
    if (played(game)) await play(game);
  }

  // Qualification is confirmed, as an organizer would, only once every group game is played; the
  // cups then fill through the same writer a recorded result uses (design D4).
  const resolution = new ZoneEntrantResolution(tx, resolveZone, async () => undefined);
  const qualificationConfirmed = groupGames.every(played);
  if (qualificationConfirmed) {
    await competition.confirmPromotionPlan(uow, {
      promotionPlanId: plan.promotionPlanId,
      resolution: Object.fromEntries(
        qualifierOrder.map((entrantId, index) => [String(index + 1), entrantId]),
      ),
      ...audit,
    });
    for (const { zoneId } of cups) await resolution.run(uow, zoneId, audit);
  }
  const cupGames = games
    .filter(isCup)
    .sort((a, b) => kickoff(a) - kickoff(b) || a.key.localeCompare(b.key, 'en', { numeric: true }));
  for (const game of cupGames) {
    if (!played(game)) continue;
    const fixture = await tx
      .selectFrom('fixtures')
      .innerJoin('matches', 'matches.fixture_id', 'fixtures.fixture_id')
      .select(['fixtures.zone_id', 'fixtures.home_entrant_id', 'fixtures.away_entrant_id'])
      .where('matches.match_id', '=', matchIdByGame.get(game.key) as string)
      .executeTakeFirstOrThrow();
    // A side the bracket has not decided yet cannot be played.
    if (fixture.home_entrant_id === null || fixture.away_entrant_id === null) continue;
    if (
      fixture.home_entrant_id !== entrantByTeam.get(game.homeTeamAlias) ||
      fixture.away_entrant_id !== entrantByTeam.get(game.awayTeamAlias)
    ) {
      throw new DemoDatasetError(
        `${game.key}: the bracket seated other entrants than the dataset publishes`,
      );
    }
    const cup = cups.find((entry) => entry.zoneId === fixture.zone_id);
    const drawWinner = cup?.cup.drawWinners.get(game.key);
    await play(game, drawWinner === undefined ? undefined : entrantByTeam.get(drawWinner));
    await resolution.run(uow, fixture.zone_id as string, audit);
  }

  await tournamentRepository.publish(uow, {
    tournamentId,
    organizationId,
    actor,
    authorizationContext: context,
  });

  return {
    dataset: dataset.alias,
    status: 'installed',
    counts: {
      clubs: dataset.clubs.length,
      players: dataset.players.length,
      entrants: entrantByTeam.size,
      stages: 2,
      fixtures: games.length,
      matchesFinalized,
      goalEvents,
      venues: dataset.venues.length,
      officials: officialIdByName.size,
      scheduledMatches: assignments.length,
      emblems: dataset.clubs.length + 1 + (dataset.organization.emblem === undefined ? 0 : 1),
    },
    shaping: {
      firstGameDay,
      ...(Number.isFinite(cutoff) ? { playedUntil: new Date(cutoff).toISOString() } : {}),
      qualificationConfirmed,
      undecidedFixtures: Number(
        (
          await tx
            .selectFrom('fixtures')
            .select((eb) => eb.fn.countAll<string | number>().as('n'))
            .where('stage_id', 'in', [groupsStage.stageId, cupsStage.stageId])
            .where((eb) =>
              eb.or([eb('home_entrant_id', 'is', null), eb('away_entrant_id', 'is', null)]),
            )
            .executeTakeFirstOrThrow()
        ).n,
      ),
    },
  };
}
