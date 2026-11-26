import type { INestApplication } from '@nestjs/common';
import { footballDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  TournamentRepository,
  newId,
  withTransaction,
  type Database,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import { buildTestApp } from './test-support/integration-harness.js';
import { PublicProjectionsController } from './public-projections.controller.js';
import { SchedulesController } from './schedules.controller.js';

let app: INestApplication;
let scratch: Awaited<ReturnType<typeof buildTestApp>>['scratch'];
let organizationId = '';
let request: Awaited<ReturnType<typeof buildTestApp>>['request'];
let tournament: Awaited<ReturnType<TournamentRepository['publish']>>;

const ORGANIZATION = 'liga-orbital';
const actor = { actor: 'user:seed', authorizationContext: 'seed' };

beforeAll(async () => {
  ({ app, scratch, organizationId, request } = await buildTestApp([
    PublicProjectionsController,
    SchedulesController,
  ]));
  const tournaments = new TournamentRepository(scratch.db);
  const descriptor = footballDescriptor({ name: { en: 'Football', es: 'Fútbol' } });
  await withTransaction(scratch.db as Kysely<Database>, (uow) =>
    tournaments.saveDescriptor(uow, descriptor, { organizationId, ...actor }),
  );
  const created = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
    tournaments.create(uow, {
      organizationId,
      alias: 'copa-timeline',
      name: 'Copa Timeline',
      descriptor,
      ...actor,
    }),
  );
  tournament = await withTransaction(scratch.db as Kysely<Database>, (uow) =>
    tournaments.publish(uow, {
      tournamentId: created.tournamentId,
      organizationId,
      ...actor,
    }),
  );
});

afterAll(async () => {
  await app?.close();
  await scratch?.drop();
});

/** Two teams with their entrants in the tournament, and a stage with one fixture and its match. */
let fixtureCount = 0;
/** Abbreviations are unique within a tournament, so each fixture gets its own pair. */
function abbreviationsFor(index: number): readonly [string, string] {
  const code = (value: number) =>
    String.fromCharCode(65 + (value % 26)) +
    String.fromCharCode(65 + (Math.floor(value / 26) % 26));
  return [`${code(index * 2)}Q`, `${code(index * 2 + 1)}Q`];
}

async function fixtureWithTeams(input: {
  readonly stageNumber: number;
  readonly withPlayers?: readonly { readonly name: string; readonly hidden?: boolean }[];
}) {
  const competition = new CompetitionRepository(scratch.db);
  fixtureCount += 1;
  const [homeAbbreviation, awayAbbreviation] = abbreviationsFor(fixtureCount);
  return withTransaction(scratch.db as Kysely<Database>, async (uow) => {
    const now = new Date();
    const homeTeamId = newId();
    const awayTeamId = newId();
    const homeEntrantId = newId();
    const awayEntrantId = newId();
    await uow.tx
      .insertInto('teams')
      .values([
        {
          team_id: homeTeamId,
          organization_id: organizationId,
          alias: `home-${homeTeamId.slice(-6)}`,
          club_id: null,
          name: 'Atlas',
          discipline_id: null,
          abbreviation: homeAbbreviation,
          created_at: now,
        },
        {
          team_id: awayTeamId,
          organization_id: organizationId,
          alias: `away-${awayTeamId.slice(-6)}`,
          club_id: null,
          name: 'Boreal',
          discipline_id: null,
          abbreviation: awayAbbreviation,
          created_at: now,
        },
      ])
      .execute();
    await uow.tx
      .insertInto('entrants')
      .values([
        {
          entrant_id: homeEntrantId,
          tournament_id: tournament.tournamentId,
          entrant_kind: 'team',
          person_id: null,
          team_id: homeTeamId,
          abbreviation: homeAbbreviation,
          seed: null,
          status: 'accepted',
          created_at: now,
        },
        {
          entrant_id: awayEntrantId,
          tournament_id: tournament.tournamentId,
          entrant_kind: 'team',
          person_id: null,
          team_id: awayTeamId,
          abbreviation: awayAbbreviation,
          seed: null,
          status: 'accepted',
          created_at: now,
        },
      ])
      .execute();
    const players: { personId: string; playerId: string; teamId: string }[] = [];
    for (const player of input.withPlayers ?? []) {
      const personId = newId();
      await uow.tx
        .insertInto('persons')
        .values({
          person_id: personId,
          organization_id: organizationId,
          alias: null,
          display_name: player.name,
          natural_key_kind: null,
          natural_key_value: null,
          natural_key_normalised: null,
          nationality: 'AR',
          birth_date: null,
          photo_object_id: null,
          club_id: null,
          hidden_from_public: player.hidden === true,
          created_at: now,
        })
        .execute();
      const playerId = newId();
      await uow.tx
        .insertInto('players')
        .values({
          player_id: playerId,
          person_id: personId,
          team_id: homeTeamId,
          role: 'player',
          created_at: now,
        })
        .execute();
      players.push({ personId, playerId, teamId: homeTeamId });
    }
    const stage = await competition.createStageInTournament(uow, {
      tournamentId: tournament.tournamentId,
      number: input.stageNumber,
      name: `Stage ${input.stageNumber}`,
      format: 'single-elimination',
      organizationId,
      ...actor,
    });
    const [fixture] = await competition.createFixtures(uow, {
      stageId: stage.stageId,
      fixtures: [{ round: 1, homeEntrantId, awayEntrantId }],
      organizationId,
      ...actor,
    });
    if (!fixture) throw new Error('Expected one fixture');
    const match = await competition.createMatch(uow, {
      fixtureId: fixture.fixtureId,
      number: 1,
      organizationId,
      ...actor,
    });
    return { stage, match, homeEntrantId, awayEntrantId, players };
  });
}

const reportUrl = (stageNumber: number) =>
  `/api/organizations/${ORGANIZATION}/tournaments/${tournament.alias}/stages/${stageNumber}/matches/1`;

describe('public match report timeline', () => {
  it('attributes each event to its side, gives its game time and the running score', async () => {
    const competition = new CompetitionRepository(scratch.db);
    const { stage, match, homeEntrantId, awayEntrantId } = await fixtureWithTeams({
      stageNumber: 2,
    });
    await withTransaction(scratch.db as Kysely<Database>, async (uow) => {
      const half = await competition.createSegment(uow, {
        matchId: match.matchId,
        type: 'half',
        number: 1,
        organizationId,
        ...actor,
      });
      await competition.setSegmentState(uow, {
        segmentId: half.segmentId,
        state: 'completed',
        organizationId,
        ...actor,
      });
      await competition.appendEvent(uow, {
        event: {
          eventId: newId(),
          matchId: match.matchId,
          segmentId: half.segmentId,
          definitionCode: 'goal',
          occurredAt: '2026-01-01T00:08:00.000Z',
          side: homeEntrantId,
          segmentElapsedSeconds: 480,
          payload: {},
        },
        sequence: 1,
        organizationId,
        ...actor,
      });
      // An event recorded before the game time was stored: it has no elapsed time.
      await competition.appendEvent(uow, {
        event: {
          eventId: newId(),
          matchId: match.matchId,
          segmentId: half.segmentId,
          definitionCode: 'goal',
          occurredAt: '2026-01-01T00:12:00.000Z',
          side: awayEntrantId,
          payload: {},
        },
        sequence: 2,
        organizationId,
        ...actor,
      });
      await competition.recordResult(uow, {
        matchId: match.matchId,
        result: {
          sides: [
            { entrantId: homeEntrantId, statistics: { goals: 1 } },
            { entrantId: awayEntrantId, statistics: { goals: 1 } },
          ],
          recordedAt: '2026-01-01T01:00:00.000Z',
        },
        organizationId,
        ...actor,
      });
    });

    const response = await request({ method: 'GET', url: reportUrl(stage.number) });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload as string) as {
      homeEntrantId: string;
      timeline: { side?: string; segmentElapsedSeconds?: number; scoreAfter?: number[] }[];
      segments: { number: number; scores?: number[] }[];
      homeScore: number;
      awayScore: number;
    };

    expect(body.timeline[0]).toMatchObject({
      side: homeEntrantId,
      segmentElapsedSeconds: 480,
      scoreAfter: [1, 0],
    });
    expect(body.timeline[1]).toMatchObject({ side: awayEntrantId, scoreAfter: [1, 1] });
    expect(body.timeline[1]?.segmentElapsedSeconds).toBeUndefined();
    const lastScore = body.timeline
      .filter((event) => event.scoreAfter !== undefined)
      .at(-1)?.scoreAfter;
    expect(lastScore).toEqual([body.homeScore, body.awayScore]);
    expect(body.segments[0]?.scores).toEqual([1, 1]);
  });

  it('lists the registered squad of a side with no roster yet, and keeps a hidden person hidden', async () => {
    const { stage } = await fixtureWithTeams({
      stageNumber: 3,
      withPlayers: [{ name: 'Lucía Gómez' }, { name: 'Hernán Secreto', hidden: true }],
    });

    const response = await request({ method: 'GET', url: reportUrl(stage.number) });
    expect(response.statusCode).toBe(200);
    const payload = response.payload as string;
    const body = JSON.parse(payload) as {
      registeredSquads?: {
        home?: { name?: string; hiddenAtRequest?: boolean; publicProfileAvailable: boolean }[];
      };
    };

    expect(body.registeredSquads?.home).toHaveLength(2);
    expect(body.registeredSquads?.home?.map((member) => member.name)).toEqual(
      expect.arrayContaining(['Lucía Gómez']),
    );
    const hidden = body.registeredSquads?.home?.find((member) => member.hiddenAtRequest === true);
    expect(hidden).toEqual({ hiddenAtRequest: true, publicProfileAvailable: false });
    expect(payload).not.toContain('Hernán Secreto');
  });

  it('round-trips a stream link through the schedule endpoint, refuses an unusable one and audits both', async () => {
    const { stage, match } = await fixtureWithTeams({ stageNumber: 4 });
    const url = `/api/organizations/${ORGANIZATION}/tournaments/${tournament.alias}/stages/${stage.stageId}/schedule/matches/${match.matchId}/stream-url`;

    const saved = await request({
      method: 'PUT',
      url,
      token: 'organizer-org1',
      payload: { streamUrl: 'https://example.org/live/semifinal-1' },
    });
    expect(saved.statusCode).toBe(200);
    expect(JSON.parse(saved.payload as string)).toEqual({
      matchId: match.matchId,
      streamUrl: 'https://example.org/live/semifinal-1',
    });
    expect(
      JSON.parse((await request({ method: 'GET', url: reportUrl(stage.number) })).payload as string)
        .streamUrl,
    ).toBe('https://example.org/live/semifinal-1');

    const refused = await request({
      method: 'PUT',
      url,
      token: 'organizer-org1',
      payload: { streamUrl: 'ftp://example.org/stream' },
    });
    expect(refused.statusCode).toBe(400);
    expect(
      JSON.parse((await request({ method: 'GET', url: reportUrl(stage.number) })).payload as string)
        .streamUrl,
    ).toBe('https://example.org/live/semifinal-1');

    const cleared = await request({
      method: 'PUT',
      url,
      token: 'organizer-org1',
      payload: { streamUrl: null },
    });
    expect(cleared.statusCode).toBe(200);
    expect(
      JSON.parse((await request({ method: 'GET', url: reportUrl(stage.number) })).payload as string)
        .streamUrl,
    ).toBeUndefined();

    const audited = await scratch.db
      .selectFrom('audit_log')
      .select(['action', 'entity_id'])
      .where('action', '=', 'schedule.stream-url-changed')
      .where('entity_id', '=', match.matchId)
      .execute();
    expect(audited).toHaveLength(2);
  });

  it('refuses a stream link from a caller without a token', async () => {
    const { stage, match } = await fixtureWithTeams({ stageNumber: 5 });
    const response = await request({
      method: 'PUT',
      url: `/api/organizations/${ORGANIZATION}/tournaments/${tournament.alias}/stages/${stage.stageId}/schedule/matches/${match.matchId}/stream-url`,
      payload: { streamUrl: 'https://example.org/live' },
    });
    expect(response.statusCode).toBe(401);
  });
});
