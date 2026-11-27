import assert from 'node:assert/strict';
import { footballDescriptor, type Venue } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import type { Database } from '../schema.js';
import { newId } from '../ids.js';
import { withTransaction } from '../transaction.js';
import { CompetitionRepository } from '../repositories/competition-repository.js';
import { EnrollmentRepository } from '../repositories/enrollment-repository.js';
import { ScheduleRepository } from '../repositories/schedule-repository.js';
import { TournamentRepository } from '../repositories/tournament-repository.js';

export const scheduleAudit = { actor: 'user:test-operator', authorizationContext: 'test:schedule' };

/** A published tournament with one unstarted match and two courts, each with four slots. */
export async function seedScheduledTournament(
  db: Kysely<Database>,
  organizationId: string,
  alias: string,
) {
  return withTransaction(db, async (uow) => {
    const audit = { organizationId, ...scheduleAudit };
    const tournaments = new TournamentRepository(uow.tx);
    const competition = new CompetitionRepository(uow.tx);
    const enrollment = new EnrollmentRepository(uow.tx);
    const schedules = new ScheduleRepository(uow.tx);
    const descriptorId = newId();
    const descriptor = footballDescriptor({ descriptorId, alias: `football-${descriptorId}` });
    await tournaments.saveDescriptor(uow, descriptor, audit);
    const tournament = await tournaments.create(uow, { ...audit, alias, name: alias, descriptor });
    await tournaments.publish(uow, { ...audit, tournamentId: tournament.tournamentId });
    const stage = await competition.createStageInTournament(uow, {
      ...audit,
      tournamentId: tournament.tournamentId,
      number: 1,
      name: 'Liga',
      format: 'round-robin',
    });
    const entrants: string[] = [];
    for (const name of ['Alfa', 'Bravo']) {
      const team = await enrollment.createTeam(uow, { ...audit, name });
      const entrant = await enrollment.registerEntrant(uow, {
        ...audit,
        tournamentId: tournament.tournamentId,
        entrantRef: { kind: 'team', teamId: team.teamId },
      });
      entrants.push(entrant.entrantId);
    }
    const home = entrants[0];
    const away = entrants[1];
    assert.ok(home && away);
    const fixtures = await competition.createFixtures(uow, {
      ...audit,
      stageId: stage.stageId,
      fixtures: [{ round: 1, homeEntrantId: home, awayEntrantId: away }],
    });
    const matches = await competition.listMatchesForStage(stage.stageId, uow);
    const match = matches[0];
    const fixture = fixtures[0];
    assert.ok(match && fixture);
    const matchId = match.matchId;
    const venues: Venue[] = [];
    for (const court of [1, 2])
      venues.push(
        await schedules.createVenue(uow, {
          ...audit,
          alias: `${alias}-court-${court}`,
          name: `Cancha ${court}`,
          concurrentCapacity: 1,
        }),
      );
    const startsAt = Date.UTC(2026, 10, 7, 14);
    const schedule = await schedules.createSchedule(uow, {
      ...audit,
      name: alias,
      startsAt,
      endsAt: startsAt + 8 * 60 * 60_000,
      slotMinutes: 120,
      turnaroundMinutes: 0,
      venueIds: venues.map((venue) => venue.venueId),
    });
    const slots = await schedules.listScheduleSlots(schedule.scheduleId, uow);
    const courtOne = venues[0];
    const courtTwo = venues[1];
    assert.ok(courtOne && courtTwo);
    const first = slots.find(
      (slot) => slot.venueId === courtOne.venueId && slot.startsAt === startsAt,
    );
    const second = slots.find(
      (slot) => slot.venueId === courtTwo.venueId && slot.startsAt === startsAt + 4 * 60 * 60_000,
    );
    assert.ok(first && second);
    return { tournament, stage, matchId, fixtureId: fixture.fixtureId, first, second };
  });
}
