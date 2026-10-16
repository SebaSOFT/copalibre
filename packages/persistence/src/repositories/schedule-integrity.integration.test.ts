import {
  localToEpoch,
  ScheduleConflictError,
  winConditionScript,
  type DisciplineDescriptor,
  type Venue,
} from '@copalibre/domain';
import { AuditReader } from '../audit.js';
import { InvariantViolationError, ScheduleReasonRequiredError } from '../errors.js';
import { newId } from '../ids.js';
import { createMigratedDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';
import { withTransaction } from '../transaction.js';
import { CompetitionRepository } from './competition-repository.js';
import { EnrollmentRepository } from './enrollment-repository.js';
import { OrganizationRepository } from './organization-repository.js';
import { ScheduleRepository } from './schedule-repository.js';
import { TournamentRepository } from './tournament-repository.js';

/**
 * The schedule's integrity rules against real storage: the tournament's stored rest rule, a
 * match occupying its estimated duration, the in-progress guard, withdrawal, and the reason and
 * history every change to a published placement leaves behind.
 */

const AUDIT = { actor: 'user:organizer-1', authorizationContext: 'scope:tournament.write' };
const HOUR = 60 * 60_000;

/** Two 25-minute halves: a 50-minute estimate. */
function rinkHockey(): DisciplineDescriptor {
  const descriptorId = newId();
  return {
    descriptorId,
    alias: `hockey-patines-${descriptorId}`,
    version: '1.0.0',
    name: 'Hockey sobre patines',
    attribution: { author: 'CopaLibre tests', licence: 'AGPL-3.0-only' },
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 1, maxPlayers: 10 },
    segmentTypes: [
      { name: 'half', label: 'Half', timed: true, defaultDurationSeconds: 1500 },
      { name: 'extra-time', label: 'Extra time', timed: true, defaultDurationSeconds: 300 },
    ],
    eventDefinitions: [],
    statistics: [],
    scoringInputs: [],
    availableFormats: ['round-robin'],
    winCondition: winConditionScript('higher-score-wins', { unit: 'goals' }),
    notificationRuleCapabilities: [],
    defaults: { segments: { regulationCount: 2, overtimeEnabled: false } },
    fieldPolicies: {},
  };
}

describe('schedule integrity (integration)', () => {
  let scratch: ScratchDatabase;
  let organizationId = '';
  let schedules: ScheduleRepository;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('schedule_integrity');
    schedules = new ScheduleRepository(scratch.db);
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-patines',
        name: 'Liga Patines',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  /** A tournament with four round-robin matches between four clubs. */
  async function seedTournament(alias: string, minimumRestMinutes?: number) {
    const tournaments = new TournamentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const participants = new EnrollmentRepository(scratch.db);
    return withTransaction(scratch.db, async (uow) => {
      const descriptor = rinkHockey();
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

  /** A grid on two courts from `startsAt`, every `slotMinutes`, with no changeover. */
  async function seedGrid(name: string, startsAt: number, slotMinutes: number, hours = 6) {
    return withTransaction(scratch.db, async (uow) => {
      const venues: Venue[] = [];
      for (const court of ['1', '2']) {
        venues.push(
          await schedules.createVenue(uow, {
            organizationId,
            alias: `${name}-cancha-${court}`,
            name: `Cancha ${court}`,
            concurrentCapacity: 1,
            ...AUDIT,
          }),
        );
      }
      const schedule = await schedules.createSchedule(uow, {
        organizationId,
        name,
        startsAt,
        endsAt: startsAt + hours * HOUR,
        slotMinutes,
        turnaroundMinutes: 0,
        venueIds: venues.map((venue) => venue.venueId),
        ...AUDIT,
      });
      const slots = await schedules.listScheduleSlots(schedule.scheduleId, uow);
      /** The slot on `court` (1 or 2) starting `minutes` after the grid opens. */
      const at = (court: 1 | 2, minutes: number) =>
        slots.find(
          (slot) =>
            slot.venueId === venues[court - 1]?.venueId &&
            slot.startsAt === startsAt + minutes * 60_000,
        )?.slotId as string;
      return { venues, schedule, at };
    });
  }

  const publish = (
    input: Omit<
      Parameters<ScheduleRepository['publishSchedule']>[1],
      keyof typeof AUDIT | 'organizationId'
    >,
  ) =>
    withTransaction(scratch.db, (uow) =>
      schedules.publishSchedule(uow, { organizationId, ...input, ...AUDIT }),
    );

  const setStatus = (matchId: string, status: string) =>
    scratch.db.updateTable('matches').set({ status }).where('match_id', '=', matchId).execute();

  it('updates tournament settings on a tournament created in the same transaction', async () => {
    const tournaments = new TournamentRepository(scratch.db);
    const updated = await withTransaction(scratch.db, async (uow) => {
      const descriptor = rinkHockey();
      await tournaments.saveDescriptor(uow, descriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias: 'copa-ajustes',
        name: 'Copa Ajustes',
        descriptor,
        ...AUDIT,
      });
      await tournaments.setMinimumRest(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        minimumRestMinutes: 45,
        ...AUDIT,
      });
      return tournaments.setFeatured(uow, {
        tournamentId: tournament.tournamentId,
        organizationId,
        featured: true,
        ...AUDIT,
      });
    });
    expect(updated).toMatchObject({ featured: true, minimumRestMinutes: 45 });
  });

  it('records where a moved published match was, with actor, reason and audit', async () => {
    const { matches } = await seedTournament('copa-historia');
    const grid = await seedGrid('historia', Date.UTC(2026, 10, 7, 14), 60);
    const [m1] = matches as [string];
    await publish({ assignments: [{ matchId: m1, slotId: grid.at(1, 0) }] });
    await expect(schedules.listScheduleHistory(m1)).resolves.toEqual([]);

    await publish({
      assignments: [{ matchId: m1, slotId: grid.at(2, 180) }],
      reason: { code: 'venue-unavailable', text: 'Venue unavailable' },
    });

    const history = await schedules.listScheduleHistory(m1);
    expect(history).toEqual([
      expect.objectContaining({
        priorSlotId: grid.at(1, 0),
        priorVenueId: grid.venues[0]?.venueId,
        priorStartsAt: Date.UTC(2026, 10, 7, 14),
        priorOfficialIds: [],
        resultingSlotId: grid.at(2, 180),
        reasonCode: 'venue-unavailable',
        reason: 'Venue unavailable',
        actor: AUDIT.actor,
      }),
    ]);
    const audit = (await new AuditReader(scratch.db).historyFor('match', m1)).filter(
      (entry) => entry.action === 'schedule.placement-changed',
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]?.previousState).toMatchObject({ slotId: grid.at(1, 0) });
    expect(audit[0]?.resultingState).toMatchObject({ slotId: grid.at(2, 180) });
    expect(audit[0]?.reason).toBe('Venue unavailable');
  });

  it('refuses a published change without a reason, naming the match and changing nothing', async () => {
    const { matches } = await seedTournament('copa-sin-motivo');
    const grid = await seedGrid('sin-motivo', Date.UTC(2026, 10, 8, 14), 60);
    const [m1, m2] = matches as [string, string];
    await publish({ assignments: [{ matchId: m1, slotId: grid.at(1, 0) }] });

    const refused = publish({
      assignments: [
        { matchId: m1, slotId: grid.at(1, 120) },
        { matchId: m2, slotId: grid.at(2, 0) },
      ],
    });
    await expect(refused).rejects.toBeInstanceOf(ScheduleReasonRequiredError);
    await expect(refused).rejects.toMatchObject({ matchIds: [m1] });

    const placed = await scratch.db
      .selectFrom('match_schedule_assignments')
      .select(['match_id', 'slot_id'])
      .where('match_id', 'in', [m1, m2])
      .execute();
    expect(placed).toEqual([{ match_id: m1, slot_id: grid.at(1, 0) }]);
  });

  it('lets an exception reason override the batch reason, or cover the batch alone', async () => {
    const { matches } = await seedTournament('copa-excepciones');
    const grid = await seedGrid('excepciones', Date.UTC(2026, 10, 9, 14), 60);
    const [m1, m2, m3, m4] = matches as [string, string, string, string];
    await publish({
      assignments: [
        { matchId: m1, slotId: grid.at(1, 0) },
        { matchId: m2, slotId: grid.at(2, 0) },
        { matchId: m3, slotId: grid.at(1, 120) },
        { matchId: m4, slotId: grid.at(2, 120) },
      ],
    });

    await publish({
      reason: { text: 'Court 1 without lights' },
      assignments: [
        { matchId: m1, slotId: grid.at(1, 60) },
        { matchId: m2, slotId: grid.at(2, 60) },
        {
          matchId: m3,
          slotId: grid.at(1, 180),
          reason: { text: 'Requested by the visiting club' },
        },
      ],
    });
    const latest = async (matchId: string) => (await schedules.listScheduleHistory(matchId)).at(-1);
    await expect(latest(m1)).resolves.toMatchObject({ reason: 'Court 1 without lights' });
    await expect(latest(m2)).resolves.toMatchObject({ reason: 'Court 1 without lights' });
    await expect(latest(m3)).resolves.toMatchObject({ reason: 'Requested by the visiting club' });

    await publish({
      assignments: [{ matchId: m4, slotId: grid.at(2, 180), reason: { text: 'Broadcast slot' } }],
    });
    await expect(latest(m4)).resolves.toMatchObject({ reason: 'Broadcast slot' });
  });

  it('withdraws a match atomically with a placement in the slot it frees', async () => {
    const { matches } = await seedTournament('copa-retiro');
    const grid = await seedGrid('retiro', Date.UTC(2026, 10, 10, 14), 60);
    const [m1, m2] = matches as [string, string];
    await publish({ assignments: [{ matchId: m1, slotId: grid.at(1, 0) }] });

    const preview = await schedules.previewSchedule({
      organizationId,
      assignments: [{ matchId: m2, slotId: grid.at(1, 0) }],
      withdrawals: [{ matchId: m1 }],
    });
    expect(preview).toMatchObject({
      committable: true,
      withdrawn: [m1],
      freedSlotIds: [grid.at(1, 0)],
      reasonRequiredMatches: [m1],
    });

    await publish({
      assignments: [{ matchId: m2, slotId: grid.at(1, 0) }],
      withdrawals: [{ matchId: m1, reason: { code: 'other', text: 'Other' } }],
    });
    const placed = await scratch.db
      .selectFrom('match_schedule_assignments')
      .select(['match_id', 'slot_id'])
      .where('match_id', 'in', [m1, m2])
      .execute();
    expect(placed).toEqual([{ match_id: m2, slot_id: grid.at(1, 0) }]);
    expect(await schedules.listScheduleHistory(m1)).toEqual([
      expect.objectContaining({ priorSlotId: grid.at(1, 0), reasonCode: 'other' }),
    ]);
    expect((await schedules.listScheduleHistory(m1))[0]?.resultingSlotId).toBeUndefined();
    const audit = await new AuditReader(scratch.db).historyFor('match', m1);
    expect(audit.map((entry) => entry.action)).toContain('schedule.placement-withdrawn');
    // The first placement of m2 needed no reason and wrote no history.
    await expect(schedules.listScheduleHistory(m2)).resolves.toEqual([]);
  });

  it('refuses to withdraw a match that holds no slot', async () => {
    const { matches } = await seedTournament('copa-retiro-vacio');
    await expect(
      publish({ assignments: [], withdrawals: [{ matchId: matches[0] as string }] }),
    ).rejects.toBeInstanceOf(InvariantViolationError);
  });

  it.each([
    ['finalized', 'match-finalized'],
    ['in-progress', 'match-in-progress'],
  ] as const)('refuses to move or withdraw a %s match', async (status, kind) => {
    const { matches } = await seedTournament(`copa-bloqueo-${status}`);
    const grid = await seedGrid(`bloqueo-${status}`, Date.UTC(2026, 10, 11, 14), 60);
    const [m1] = matches as [string];
    await publish({ assignments: [{ matchId: m1, slotId: grid.at(1, 0) }] });
    await setStatus(m1, status);

    for (const batch of [
      { assignments: [{ matchId: m1, slotId: grid.at(1, 120) }], reason: { text: 'Late' } },
      { assignments: [], withdrawals: [{ matchId: m1 }], reason: { text: 'Late' } },
    ]) {
      const refused = publish(batch);
      await expect(refused).rejects.toBeInstanceOf(ScheduleConflictError);
      await expect(refused).rejects.toMatchObject({
        conflicts: [expect.objectContaining({ kind, matchId: m1 })],
      });
    }
  });

  it('holds a match for its estimated duration even on a short-slot grid', async () => {
    const { matches } = await seedTournament('copa-duracion');
    const grid = await seedGrid('duracion', Date.UTC(2026, 10, 12, 14), 15);
    const [m1, m2] = matches as [string, string];
    const refused = publish({
      assignments: [
        { matchId: m1, slotId: grid.at(1, 0) },
        { matchId: m2, slotId: grid.at(1, 15) },
      ],
    });
    await expect(refused).rejects.toMatchObject({
      conflicts: [expect.objectContaining({ kind: 'venue-double-booked' })],
    });
    await expect(
      publish({
        assignments: [
          { matchId: m1, slotId: grid.at(1, 0) },
          { matchId: m2, slotId: grid.at(1, 60) },
        ],
      }),
    ).resolves.toHaveLength(2);
  });

  it('applies each tournament its own stored rest rule', async () => {
    const strict = await seedTournament('copa-descanso-estricto', 120);
    const relaxed = await seedTournament('copa-descanso-libre');
    const grid = await seedGrid('descanso', Date.UTC(2026, 10, 13, 14), 60);
    // Matches 0 and 2 of each tournament share their first entrant; a start 60 minutes after a
    // 50-minute match leaves 10 minutes of rest.
    const refused = publish({
      assignments: [
        { matchId: strict.matches[0] as string, slotId: grid.at(1, 0) },
        { matchId: strict.matches[2] as string, slotId: grid.at(2, 60) },
      ],
    });
    await expect(refused).rejects.toMatchObject({
      conflicts: [expect.objectContaining({ kind: 'rest-rule' })],
    });
    await expect(
      publish({
        assignments: [
          { matchId: relaxed.matches[0] as string, slotId: grid.at(1, 0) },
          { matchId: relaxed.matches[2] as string, slotId: grid.at(2, 60) },
        ],
      }),
    ).resolves.toHaveLength(2);
  });

  it('offers the organization recent typed reasons, newest first, without presets', async () => {
    const { matches } = await seedTournament('copa-motivos');
    const grid = await seedGrid('motivos', Date.UTC(2026, 10, 14, 14), 60);
    const [m1] = matches as [string];
    await publish({ assignments: [{ matchId: m1, slotId: grid.at(1, 0) }] });
    const move = (minutes: number, reason: { code?: string; text: string }) =>
      publish({ assignments: [{ matchId: m1, slotId: grid.at(1, minutes) }], reason });
    await move(60, { text: 'Lluvia' });
    await move(120, { code: 'weather', text: 'Weather' });
    await move(180, { text: 'Pedido del club visitante' });
    await move(240, { text: 'Lluvia' });

    const recent = await schedules.recentScheduleReasons(organizationId);
    expect(recent.slice(0, 2)).toEqual(['Lluvia', 'Pedido del club visitante']);
    expect(recent).not.toContain('Weather');
  });

  it('reads an organization schedule across tournaments with estimated ends, capped at 31 days', async () => {
    const first = await seedTournament('copa-agenda-a');
    const second = await seedTournament('copa-agenda-b');
    const opens = Date.UTC(2026, 10, 21, 14);
    const grid = await seedGrid('agenda', opens, 60);
    await publish({
      assignments: [
        { matchId: first.matches[0] as string, slotId: grid.at(1, 0) },
        { matchId: second.matches[0] as string, slotId: grid.at(1, 60) },
      ],
    });

    const entries = await schedules.listOrganizationSchedule({
      organizationId,
      from: opens,
      to: opens + 24 * HOUR,
      venueId: grid.venues[0]?.venueId as string,
    });
    expect(
      entries.map((entry) => [entry.tournamentId, entry.startsAt, entry.estimatedEnd]),
    ).toEqual([
      [first.tournament.tournamentId, opens, opens + 50 * 60_000],
      [second.tournament.tournamentId, opens + HOUR, opens + HOUR + 50 * 60_000],
    ]);
    expect(entries[0]).toMatchObject({ published: true, round: 1 });
    await expect(
      schedules.listOrganizationSchedule({
        organizationId,
        from: opens,
        to: opens + 32 * 24 * HOUR,
      }),
    ).rejects.toBeInstanceOf(InvariantViolationError);
  });

  it('generates slots on the organization wall clock across a daylight-saving change', async () => {
    const madrid = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-madrid',
        name: 'Liga Madrid',
        timezone: 'Europe/Madrid',
        ...AUDIT,
      }),
    );
    const slots = await withTransaction(scratch.db, async (uow) => {
      const venue = await schedules.createVenue(uow, {
        organizationId: madrid.organizationId,
        alias: 'pabellon',
        name: 'Pabellón',
        concurrentCapacity: 1,
        ...AUDIT,
      });
      const schedule = await schedules.createSchedule(uow, {
        organizationId: madrid.organizationId,
        name: 'Cambio de hora',
        startsAt: localToEpoch('2026-03-28T09:00', 'Europe/Madrid'),
        endsAt: localToEpoch('2026-03-29T15:00', 'Europe/Madrid'),
        slotMinutes: 120,
        turnaroundMinutes: 0,
        venueIds: [venue.venueId],
        ...AUDIT,
      });
      return schedules.listScheduleSlots(schedule.scheduleId, uow);
    });
    const localHours = slots.map((slot) =>
      Number(
        new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Europe/Madrid',
          hour: '2-digit',
          hourCycle: 'h23',
        }).format(new Date(slot.startsAt)),
      ),
    );
    expect(localHours.every((hour) => hour % 2 === 1)).toBe(true);
    expect(localHours.slice(-3)).toEqual([9, 11, 13]);
  });
});
