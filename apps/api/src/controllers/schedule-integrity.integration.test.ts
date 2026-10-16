import type { INestApplication } from '@nestjs/common';
import { footballDescriptor } from '@copalibre/domain';
import {
  CompetitionRepository,
  EnrollmentRepository,
  ScheduleRepository,
  TournamentRepository,
  newId,
  withTransaction,
} from '@copalibre/persistence';
import { OrganizationScheduleController } from './organization-schedule.controller.js';
import { SchedulesController } from './schedules.controller.js';
import { buildTestApp } from './test-support/integration-harness.js';

/**
 * The schedule's integrity rules through the HTTP stack: the stored rest rule winning over a
 * request body, withdrawal as a batch entry, the reason a published change needs, the
 * in-progress refusal, and the organization-wide read.
 */

const AUDIT = { actor: 'user:seed', authorizationContext: 'seed' };
const HOUR = 60 * 60_000;

let app: INestApplication;
let scratch: Awaited<ReturnType<typeof buildTestApp>>['scratch'];
let request: Awaited<ReturnType<typeof buildTestApp>>['request'];
let organizationId = '';
let grid: { at: (court: 1 | 2, minutes: number) => string; venueIds: readonly string[] };

const OPENS = Date.UTC(2026, 10, 7, 9);

beforeAll(async () => {
  ({ app, scratch, request, organizationId } = await buildTestApp([
    SchedulesController,
    OrganizationScheduleController,
  ]));
  const schedules = new ScheduleRepository(scratch.db);
  grid = await withTransaction(scratch.db, async (uow) => {
    const venueIds: string[] = [];
    for (const court of [1, 2]) {
      const venue = await schedules.createVenue(uow, {
        organizationId,
        alias: `cancha-${court}`,
        name: `Cancha ${court}`,
        concurrentCapacity: 1,
        ...AUDIT,
      });
      venueIds.push(venue.venueId);
    }
    const schedule = await schedules.createSchedule(uow, {
      organizationId,
      name: 'Fin de semana',
      startsAt: OPENS,
      endsAt: OPENS + 12 * HOUR,
      slotMinutes: 30,
      turnaroundMinutes: 0,
      venueIds,
      ...AUDIT,
    });
    const slots = await schedules.listScheduleSlots(schedule.scheduleId, uow);
    return {
      venueIds,
      at: (court: 1 | 2, minutes: number) =>
        slots.find(
          (slot) =>
            slot.venueId === venueIds[court - 1] && slot.startsAt === OPENS + minutes * 60_000,
        )?.slotId as string,
    };
  });
});

afterAll(async () => {
  await app?.close();
  await scratch?.drop();
});

/** A football tournament (a 90-minute estimate) with four matches; 0 and 2 share an entrant. */
async function seedTournament(alias: string, minimumRestMinutes?: number) {
  const tournaments = new TournamentRepository(scratch.db);
  const competition = new CompetitionRepository(scratch.db);
  const participants = new EnrollmentRepository(scratch.db);
  return withTransaction(scratch.db, async (uow) => {
    const descriptorId = newId();
    const descriptor = footballDescriptor({ descriptorId, alias: `futbol-${descriptorId}` });
    await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...AUDIT });
    const tournament = await tournaments.create(uow, {
      organizationId,
      alias,
      name: alias,
      descriptor,
      ...AUDIT,
    });
    if (minimumRestMinutes !== undefined) {
      await tournaments.setMinimumRest(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        minimumRestMinutes,
        ...AUDIT,
      });
    }
    const stage = await competition.createStageInTournament(uow, {
      tournamentId: tournament.tournamentId,
      number: 1,
      name: 'Liga',
      format: 'round-robin',
      organizationId,
      ...AUDIT,
    });
    const entrants: string[] = [];
    for (const name of ['Alfa', 'Bravo', 'Charlie', 'Delta']) {
      const team = await participants.createTeam(uow, { organizationId, name, ...AUDIT });
      const registered = await participants.registerEntrant(uow, {
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'team', teamId: team.teamId },
        organizationId,
        ...AUDIT,
      });
      entrants.push(registered.entrantId);
    }
    const [a, b, c, d] = entrants as [string, string, string, string];
    const fixtures = await competition.createFixtures(uow, {
      stageId: stage.stageId,
      fixtures: [
        { round: 1, homeEntrantId: a, awayEntrantId: b },
        { round: 1, homeEntrantId: c, awayEntrantId: d },
        { round: 2, homeEntrantId: a, awayEntrantId: c },
        { round: 2, homeEntrantId: b, awayEntrantId: d },
      ],
      organizationId,
      ...AUDIT,
    });
    const stageMatches = await competition.listMatchesForStage(stage.stageId, uow);
    const matches = fixtures.map(
      (fixture) =>
        stageMatches.find((match) => match.fixtureId === fixture.fixtureId)?.matchId as string,
    );
    return { tournament, stage, matches };
  });
}

const scheduleUrl = (tournamentAlias: string, stageId: string, suffix = '') =>
  `/organizations/liga-orbital/tournaments/${tournamentAlias}/stages/${stageId}/schedule${suffix}`;

describe('schedule integrity routes', () => {
  it('applies the tournament rest rule and ignores one sent in the body', async () => {
    const strict = await seedTournament('copa-estricta', 120);
    const relaxed = await seedTournament('copa-relajada');
    // Match 0 ends at 10:30 (90 minutes); match 2 starts at 11:00: 30 minutes of rest.
    const backToBack = (matches: readonly string[]) => [
      { matchId: matches[0], slotId: grid.at(1, 0) },
      { matchId: matches[2], slotId: grid.at(2, 120) },
    ];

    const strictPreview = await request({
      method: 'POST',
      url: scheduleUrl('copa-estricta', strict.stage.stageId, '/preview'),
      token: 'organizer-org1',
      payload: { assignments: backToBack(strict.matches), restRule: { minimumMinutes: 0 } },
    });
    expect(strictPreview.statusCode).toBe(201);
    expect(strictPreview.json()).toMatchObject({
      committable: false,
      conflicts: [expect.objectContaining({ kind: 'rest-rule' })],
    });

    const relaxedPreview = await request({
      method: 'POST',
      url: scheduleUrl('copa-relajada', relaxed.stage.stageId, '/preview'),
      token: 'organizer-org1',
      payload: { assignments: backToBack(relaxed.matches), restRule: { minimumMinutes: 600 } },
    });
    expect(relaxedPreview.json()).toMatchObject({ committable: true, conflicts: [] });
  });

  it('withdraws a match atomically with a placement, and asks a reason for the published one', async () => {
    const { stage, matches } = await seedTournament('copa-retiro');
    const [m1, m2] = matches as [string, string];
    const url = scheduleUrl('copa-retiro', stage.stageId);
    const first = await request({
      method: 'POST',
      url,
      token: 'organizer-org1',
      payload: { assignments: [{ matchId: m1, slotId: grid.at(1, 240) }] },
    });
    expect(first.statusCode).toBe(201);

    const batch = {
      assignments: [
        { matchId: m1, withdraw: true },
        { matchId: m2, slotId: grid.at(1, 240) },
      ],
    };
    const preview = await request({
      method: 'POST',
      url: `${url}/preview`,
      token: 'organizer-org1',
      payload: batch,
    });
    expect(preview.json()).toMatchObject({
      committable: true,
      withdrawn: [m1],
      freedSlotIds: [grid.at(1, 240)],
      reasonRequiredMatches: [m1],
    });

    const unreasoned = await request({
      method: 'POST',
      url,
      token: 'organizer-org1',
      payload: batch,
    });
    expect(unreasoned.statusCode).toBe(400);
    expect(unreasoned.json()).toMatchObject({
      errorCode: 'schedule-reason-required',
      uncoveredMatchIds: [m1],
    });

    const published = await request({
      method: 'POST',
      url,
      token: 'organizer-org1',
      payload: { ...batch, reason: { code: 'entrant-request', text: 'Entrant request' } },
    });
    expect(published.statusCode).toBe(201);
    expect(published.json().assignments.map((a: { matchId: string }) => a.matchId)).toEqual([m2]);
    const history = await new ScheduleRepository(scratch.db).listScheduleHistory(m1);
    expect(history).toEqual([
      expect.objectContaining({ reasonCode: 'entrant-request', reason: 'Entrant request' }),
    ]);
  });

  it('refuses an entry that both places and withdraws', async () => {
    const { stage, matches } = await seedTournament('copa-ambigua');
    const response = await request({
      method: 'POST',
      url: scheduleUrl('copa-ambigua', stage.stageId),
      token: 'organizer-org1',
      payload: { assignments: [{ matchId: matches[0], slotId: grid.at(1, 0), withdraw: true }] },
    });
    expect(response.statusCode).toBe(400);
  });

  it('refuses to move a match in progress', async () => {
    const { stage, matches } = await seedTournament('copa-en-juego');
    const [m1] = matches as [string];
    const url = scheduleUrl('copa-en-juego', stage.stageId);
    await request({
      method: 'POST',
      url,
      token: 'organizer-org1',
      payload: { assignments: [{ matchId: m1, slotId: grid.at(2, 480) }] },
    });
    await scratch.db
      .updateTable('matches')
      .set({ status: 'in-progress' })
      .where('match_id', '=', m1)
      .execute();

    const response = await request({
      method: 'POST',
      url,
      token: 'organizer-org1',
      payload: {
        assignments: [{ matchId: m1, slotId: grid.at(2, 600) }],
        reason: { text: 'Late kickoff' },
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().conflicts).toEqual([
      expect.objectContaining({ kind: 'match-in-progress', matchId: m1 }),
    ]);
  });

  it('reads the organization schedule across tournaments, capped and authorized', async () => {
    const first = await seedTournament('copa-agenda-a');
    const second = await seedTournament('copa-agenda-b');
    await request({
      method: 'POST',
      url: scheduleUrl('copa-agenda-a', first.stage.stageId),
      token: 'organizer-org1',
      payload: { assignments: [{ matchId: first.matches[1], slotId: grid.at(2, 0) }] },
    });
    await request({
      method: 'POST',
      url: scheduleUrl('copa-agenda-b', second.stage.stageId),
      token: 'organizer-org1',
      payload: { assignments: [{ matchId: second.matches[1], slotId: grid.at(2, 120) }] },
    });

    const query = `from=${OPENS}&to=${OPENS + 4 * HOUR}&venue=${grid.venueIds[1]}`;
    const response = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/schedule?${query}`,
      token: 'organizer-org1',
    });
    expect(response.statusCode).toBe(200);
    const tournamentsRead = response
      .json()
      .assignments.map(
        (entry: { tournamentId: string; estimatedEnd: number; startsAt: number }) => [
          entry.tournamentId,
          entry.estimatedEnd - entry.startsAt,
        ],
      );
    expect(tournamentsRead).toEqual(
      expect.arrayContaining([
        [first.tournament.tournamentId, 90 * 60_000],
        [second.tournament.tournamentId, 90 * 60_000],
      ]),
    );

    const tooLong = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/schedule?from=${OPENS}&to=${OPENS + 40 * 24 * HOUR}`,
      token: 'organizer-org1',
    });
    expect(tooLong.statusCode).toBe(400);

    for (const token of ['participant-org1', 'organizer-org2']) {
      const refused = await request({
        method: 'GET',
        url: `/organizations/liga-orbital/schedule?${query}`,
        token,
      });
      expect([403, 404]).toContain(refused.statusCode);
    }
    const anonymous = await request({
      method: 'GET',
      url: `/organizations/liga-orbital/schedule?${query}`,
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it('offers the organization recent typed reasons', async () => {
    const response = await request({
      method: 'GET',
      url: '/organizations/liga-orbital/schedule/reasons/recent',
      token: 'organizer-org1',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ reasons: expect.any(Array) });
  });
});
