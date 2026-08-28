import {
  classifyScheduleMutation,
  winConditionScript,
  type DisciplineDescriptor,
  type Match,
  type ResourceAssignment,
} from '@copalibre/domain';
import { AuditReader } from '../audit.js';
import { InvariantViolationError } from '../errors.js';
import { newId } from '../ids.js';
import { OutboxReader } from '../outbox.js';
import { createMigratedDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';
import { withTransaction } from '../transaction.js';
import { CompetitionRepository } from './competition-repository.js';
import { OrganizationRepository } from './organization-repository.js';
import { EnrollmentRepository } from './enrollment-repository.js';
import { ScheduleRepository } from './schedule-repository.js';
import { TournamentRepository } from './tournament-repository.js';

const AUDIT = { actor: 'user:organizer-1', authorizationContext: 'scope:tournament.write' };

const BASE = Date.UTC(2026, 7, 1, 14, 0, 0);

function item<T>(arr: readonly T[], index: number): T {
  const el = arr[index];
  if (el === undefined) throw new Error(`element at index ${index} not found`);
  return el;
}

function descriptor(): DisciplineDescriptor {
  const descriptorId = newId();
  return {
    descriptorId,
    alias: `liga-regional-${descriptorId}`,
    version: '1.0.0',
    name: 'Liga Regional',
    attribution: { author: 'CopaLibre tests', licence: 'AGPL-3.0-only' },
    participantTypes: ['team'],
    rosterConstraints: { minPlayers: 1, maxPlayers: 11 },
    segmentTypes: [{ name: 'half', label: 'Half', timed: true }],
    eventDefinitions: [],
    statistics: [],
    scoringInputs: [],
    availableFormats: ['round-robin'],
    winCondition: winConditionScript('higher-score-wins', { unit: 'goals' }),
    notificationRuleCapabilities: [],
    defaults: { scoring: { pointsPerWin: 3 } },
    fieldPolicies: {
      'scoring.pointsPerWin': {
        permission: { kind: 'replaced' },
        mutationClass: 'blocked_after_results',
      },
    },
  };
}

describe('scheduling (integration)', () => {
  let scratch: ScratchDatabase;
  let organizationId = '';
  let schedules: ScheduleRepository;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('schedule');
    schedules = new ScheduleRepository(scratch.db);
    const organization = await withTransaction(scratch.db, (uow) =>
      new OrganizationRepository(scratch.db).create(uow, {
        alias: 'liga-horarios',
        name: 'Liga Horarios',
        ...AUDIT,
      }),
    );
    organizationId = organization.organizationId;
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  /** A stage with four fixtures (and four materialized matches), two clubs each, plus a court, referee, and schedule grid. */
  async function seedStage(alias: string, concurrentCapacity = 1) {
    const tournaments = new TournamentRepository(scratch.db);
    const competition = new CompetitionRepository(scratch.db);
    const participants = new EnrollmentRepository(scratch.db);

    return withTransaction(scratch.db, async (uow) => {
      const disciplineDescriptor = descriptor();
      await tournaments.saveDescriptor(uow, disciplineDescriptor, { organizationId, ...AUDIT });
      const tournament = await tournaments.create(uow, {
        organizationId,
        alias,
        name: alias,
        descriptor: disciplineDescriptor,
        ...AUDIT,
      });
      const stage = await competition.createStageInTournament(uow, {
        tournamentId: tournament.tournamentId,
        number: 1,
        name: 'League',
        format: 'round-robin',
        organizationId,
        ...AUDIT,
      });

      const entrants = [];
      for (const name of ['Alfa', 'Bravo', 'Charlie', 'Delta']) {
        const team = await participants.createTeam(uow, { organizationId, name, ...AUDIT });
        entrants.push(
          await participants.registerEntrant(uow, {
            tournamentId: tournament.tournamentId,
            entrantRef: { kind: 'team', teamId: team.teamId },
            organizationId,
            ...AUDIT,
          }),
        );
      }

      const fixtures = await competition.createFixtures(uow, {
        stageId: stage.stageId,
        fixtures: [
          {
            round: 1,
            homeEntrantId: entrants[0]?.entrantId,
            awayEntrantId: entrants[1]?.entrantId,
          },
          {
            round: 1,
            homeEntrantId: entrants[2]?.entrantId,
            awayEntrantId: entrants[3]?.entrantId,
          },
          {
            round: 2,
            homeEntrantId: entrants[0]?.entrantId,
            awayEntrantId: entrants[2]?.entrantId,
          },
          {
            round: 2,
            homeEntrantId: entrants[1]?.entrantId,
            awayEntrantId: entrants[3]?.entrantId,
          },
        ],
        organizationId,
        ...AUDIT,
      });

      const matches: Match[] = [];
      const stageMatches = await competition.listMatchesForStage(stage.stageId, uow);
      for (const f of fixtures) {
        const m = stageMatches.find((match) => match.fixtureId === f.fixtureId);
        if (m) matches.push(m);
      }

      const venue = await schedules.createVenue(uow, {
        organizationId,
        alias: `court-${alias}`,
        name: 'Cancha 1',
        concurrentCapacity,
        ...AUDIT,
      });
      const referee = await schedules.createOfficial(uow, {
        organizationId,
        displayName: 'Ana Gómez',
        roles: ['referee'],
        ...AUDIT,
      });

      // Create a schedule grid with slots from 14:00 to 20:00 (6 hours)
      const schedule = await schedules.createSchedule(uow, {
        organizationId,
        name: `Schedule ${alias}`,
        startsAt: BASE,
        endsAt: BASE + 6 * 60 * 60_000,
        slotMinutes: 60,
        turnaroundMinutes: 15,
        venueIds: [venue.venueId],
        ...AUDIT,
      });

      const slots = await schedules.listScheduleSlots(schedule.scheduleId, uow);

      return { stage, fixtures, matches, entrants, venue, referee, schedule, slots };
    });
  }

  // ---------------------------------------------------------------------------
  // Venues & Officials
  // ---------------------------------------------------------------------------

  it('creates venues and officials with an audit record', async () => {
    const { venue, referee } = await seedStage('copa-recursos');

    expect(venue.concurrentCapacity).toBe(1);
    expect(referee.roles).toEqual(['referee']);

    const audit = await new AuditReader(scratch.db).historyFor('venue', venue.venueId);
    expect(audit.map((entry) => entry.action)).toEqual(['venue.created']);
    expect(audit[0]?.resultingState).toMatchObject({ name: 'Cancha 1' });
  });

  it('refuses a venue that could not hold a match, writing nothing', async () => {
    await expect(
      withTransaction(scratch.db, (uow) =>
        schedules.createVenue(uow, {
          organizationId,
          alias: 'court-invalid',
          name: 'Sin capacidad',
          concurrentCapacity: 0,
          ...AUDIT,
        }),
      ),
    ).rejects.toThrow(/at least one fixture at a time/);

    const rows = await scratch.db
      .selectFrom('venues')
      .select('venue_id')
      .where('alias', '=', 'court-invalid')
      .execute();
    expect(rows).toEqual([]);
  });

  it('creates a venue with operator-entered details, physical or virtual', async () => {
    const venue = await withTransaction(scratch.db, (uow) =>
      schedules.createVenue(uow, {
        organizationId,
        alias: 'servidor-cs',
        name: 'Servidor CS',
        concurrentCapacity: 1,
        details: { region: 'sa-east-1', map: 'de_dust2' },
        ...AUDIT,
      }),
    );

    expect(venue.details).toEqual({ region: 'sa-east-1', map: 'de_dust2' });
    const found = await schedules.findVenue(venue.venueId);
    expect(found?.details).toEqual({ region: 'sa-east-1', map: 'de_dust2' });
  });

  it('lists an organization’s venues and officials, newest schema fields included', async () => {
    const { venue, referee } = await seedStage('copa-listado');

    const venues = await schedules.listVenues(organizationId);
    expect(venues.some((v) => v.venueId === venue.venueId)).toBe(true);

    const officials = await schedules.listOfficials(organizationId);
    expect(officials.some((o) => o.officialId === referee.officialId)).toBe(true);
  });

  it('edits a venue, correcting a mistyped entry rather than creating a new one', async () => {
    const { venue } = await seedStage('copa-edicion-venue');

    const updated = await withTransaction(scratch.db, (uow) =>
      schedules.updateVenue(uow, {
        venueId: venue.venueId,
        organizationId,
        name: 'Cancha Renombrada',
        details: { surface: 'clay' },
        ...AUDIT,
      }),
    );

    expect(updated.name).toBe('Cancha Renombrada');
    expect(updated.details).toEqual({ surface: 'clay' });
    expect(updated.concurrentCapacity).toBe(venue.concurrentCapacity);

    const audit = await new AuditReader(scratch.db).historyFor('venue', venue.venueId);
    expect(audit.map((entry) => entry.action)).toEqual(['venue.created', 'venue.updated']);
  });

  it('edits an official, correcting a mistyped entry rather than creating a new one', async () => {
    const { referee } = await seedStage('copa-edicion-official');

    const updated = await withTransaction(scratch.db, (uow) =>
      schedules.updateOfficial(uow, {
        officialId: referee.officialId,
        organizationId,
        displayName: 'Ana Gómez Pérez',
        roles: ['referee', 'observer'],
        ...AUDIT,
      }),
    );

    expect(updated.displayName).toBe('Ana Gómez Pérez');
    expect(updated.roles).toEqual(['referee', 'observer']);

    const audit = await new AuditReader(scratch.db).historyFor('official', referee.officialId);
    expect(audit.map((entry) => entry.action)).toEqual(['official.created', 'official.updated']);
  });

  it('refuses a venue with a malformed alias, writing nothing', async () => {
    await expect(
      withTransaction(scratch.db, (uow) =>
        schedules.createVenue(uow, {
          organizationId,
          alias: 'Court One',
          name: 'Cancha Uno',
          concurrentCapacity: 1,
          ...AUDIT,
        }),
      ),
    ).rejects.toBeInstanceOf(InvariantViolationError);

    const rows = await scratch.db
      .selectFrom('venues')
      .select('venue_id')
      .where('alias', '=', 'Court One')
      .execute();
    expect(rows).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Schedule Grid & Management
  // ---------------------------------------------------------------------------

  it('creates a schedule with venues and generated slots, and lists occupancy', async () => {
    const { venue, schedule, slots } = await seedStage('copa-grid-crud');

    expect(schedule.name).toBe('Schedule copa-grid-crud');
    expect(schedule.venueIds).toEqual([venue.venueId]);
    expect(slots.length).toBeGreaterThanOrEqual(4);
    expect(slots.every((s) => s.matchCount === 0)).toBe(true);

    const list = await schedules.listSchedules(organizationId);
    expect(list.some((s) => s.scheduleId === schedule.scheduleId)).toBe(true);
  });

  it('refuses a schedule naming no venue at the write boundary', async () => {
    await expect(
      withTransaction(scratch.db, (uow) =>
        schedules.createSchedule(uow, {
          organizationId,
          name: 'Empty Venues Schedule',
          startsAt: BASE,
          endsAt: BASE + 3600_000,
          slotMinutes: 60,
          turnaroundMinutes: 0,
          venueIds: [],
          ...AUDIT,
        }),
      ),
    ).rejects.toThrow(/A schedule naming no venue/);

    const rows = await scratch.db
      .selectFrom('schedules')
      .select('schedule_id')
      .where('name', '=', 'Empty Venues Schedule')
      .execute();
    expect(rows).toEqual([]);
  });

  it('allows adding a venue to an occupied schedule and generates only empty slots', async () => {
    const { matches, venue, schedule, slots } = await seedStage('copa-add-venue');

    // Assign match 0 to slot 0
    await withTransaction(scratch.db, (uow) =>
      schedules.publishSchedule(uow, {
        organizationId,
        assignments: [{ matchId: item(matches, 0).matchId, slotId: item(slots, 0).slotId }],
        ...AUDIT,
      }),
    );

    // Create a second venue
    const venue2 = await withTransaction(scratch.db, (uow) =>
      schedules.createVenue(uow, {
        organizationId,
        alias: 'court-add-venue-2',
        name: 'Cancha 2',
        concurrentCapacity: 1,
        ...AUDIT,
      }),
    );

    // Add venue2 to schedule
    const updated = await withTransaction(scratch.db, (uow) =>
      schedules.updateSchedule(uow, {
        scheduleId: schedule.scheduleId,
        organizationId,
        venueIds: [venue.venueId, venue2.venueId],
        ...AUDIT,
      }),
    );

    expect(updated.venueIds).toEqual([venue.venueId, venue2.venueId]);

    const allSlots = await schedules.listScheduleSlots(schedule.scheduleId);
    const v2Slots = allSlots.filter((s) => s.venueId === venue2.venueId);
    expect(v2Slots.length).toBe(slots.length);
    expect(v2Slots.every((s) => s.matchCount === 0)).toBe(true);

    // Original assigned slot still holds the match
    const v1Slot0 = allSlots.find((s) => s.slotId === item(slots, 0).slotId);
    expect(v1Slot0?.matchCount).toBe(1);
  });

  it('refuses to reshape a schedule or remove a venue while affected slots hold matches', async () => {
    const { matches, schedule, slots } = await seedStage('copa-reshape-guard');

    // Assign match 0 to slot 0
    await withTransaction(scratch.db, (uow) =>
      schedules.publishSchedule(uow, {
        organizationId,
        assignments: [{ matchId: item(matches, 0).matchId, slotId: item(slots, 0).slotId }],
        ...AUDIT,
      }),
    );

    // Attempt to change slot duration (grid reshape) -> must be refused
    await expect(
      withTransaction(scratch.db, (uow) =>
        schedules.updateSchedule(uow, {
          scheduleId: schedule.scheduleId,
          organizationId,
          slotMinutes: 90,
          ...AUDIT,
        }),
      ),
    ).rejects.toThrow(/Cannot reshape schedule while its slots hold matches/);

    // Attempt to delete schedule -> must be refused
    await expect(
      withTransaction(scratch.db, (uow) =>
        schedules.removeSchedule(uow, {
          scheduleId: schedule.scheduleId,
          organizationId,
          ...AUDIT,
        }),
      ),
    ).rejects.toThrow(/Cannot delete schedule while its slots hold matches/);
  });

  // ---------------------------------------------------------------------------
  // Publishing & Match-Grain Assignments
  // ---------------------------------------------------------------------------

  it('publishes a whole schedule batch at match grain and emits one event', async () => {
    const { stage, matches, referee, slots } = await seedStage('copa-publicada');

    const assignments: ResourceAssignment[] = [
      {
        matchId: item(matches, 0).matchId,
        slotId: item(slots, 0).slotId,
        officialIds: [referee.officialId],
      },
      {
        matchId: item(matches, 1).matchId,
        slotId: item(slots, 1).slotId,
      },
    ];

    await withTransaction(scratch.db, (uow) =>
      schedules.publishSchedule(uow, {
        organizationId,
        assignments,
        ...AUDIT,
      }),
    );

    const stored = await schedules.listScheduleForStage(stage.stageId);
    expect(stored).toHaveLength(2);
    expect(stored.find((a) => a.matchId === item(matches, 0).matchId)?.officialIds).toEqual([
      referee.officialId,
    ]);

    const outbox = await new OutboxReader(scratch.db).pending(50);
    expect(outbox.some((record) => record.eventType === 'schedule.published')).toBe(true);
  });

  it('publishes nothing when one assignment in the batch conflicts', async () => {
    const { stage, matches, slots } = await seedStage('copa-atomica');

    // Single-capacity venue: assigning 2 matches to the same slot conflicts
    await expect(
      withTransaction(scratch.db, (uow) =>
        schedules.publishSchedule(uow, {
          organizationId,
          assignments: [
            { matchId: item(matches, 0).matchId, slotId: item(slots, 0).slotId },
            { matchId: item(matches, 1).matchId, slotId: item(slots, 0).slotId },
          ],
          ...AUDIT,
        }),
      ),
    ).rejects.toThrow(/conflict/);

    await expect(schedules.listScheduleForStage(stage.stageId)).resolves.toEqual([]);
  });

  it('reschedules a match without clashing with its own earlier slot', async () => {
    const { stage, matches, slots } = await seedStage('copa-reprogramada');
    const matchId = item(matches, 0).matchId;

    await withTransaction(scratch.db, (uow) =>
      schedules.publishSchedule(uow, {
        organizationId,
        assignments: [{ matchId, slotId: item(slots, 0).slotId }],
        ...AUDIT,
      }),
    );
    await withTransaction(scratch.db, (uow) =>
      schedules.publishSchedule(uow, {
        organizationId,
        assignments: [{ matchId, slotId: item(slots, 1).slotId }],
        ...AUDIT,
      }),
    );

    const stored = await schedules.listScheduleForStage(stage.stageId);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.slotId).toBe(item(slots, 1).slotId);
  });

  it('lets a multi-court venue host concurrent matches at slot grain', async () => {
    const { stage, matches, slots } = await seedStage('copa-tres-canchas', 3);

    await withTransaction(scratch.db, (uow) =>
      schedules.publishSchedule(uow, {
        organizationId,
        assignments: [
          { matchId: item(matches, 0).matchId, slotId: item(slots, 0).slotId },
          { matchId: item(matches, 1).matchId, slotId: item(slots, 0).slotId },
          { matchId: item(matches, 2).matchId, slotId: item(slots, 0).slotId },
        ],
        ...AUDIT,
      }),
    );

    await expect(schedules.listScheduleForStage(stage.stageId)).resolves.toHaveLength(3);
  });

  it('enforces a rest rule across matches an entrant plays in', async () => {
    const { matches, slots } = await seedStage('copa-descanso');

    // Matches 0 and 2 share entrant Alfa. Slots 0 (14:00-15:00) and 1 (15:15-16:15) have a 15m turnaround.
    // Rest rule requires minimum 30 minutes.
    await expect(
      withTransaction(scratch.db, (uow) =>
        schedules.publishSchedule(uow, {
          organizationId,
          assignments: [
            { matchId: item(matches, 0).matchId, slotId: item(slots, 0).slotId },
            { matchId: item(matches, 2).matchId, slotId: item(slots, 1).slotId },
          ],
          restRule: { minimumMinutes: 30 },
          ...AUDIT,
        }),
      ),
    ).rejects.toThrow(/15 minute\(s\)/);
  });

  it('previews a batch without writing it, and agrees with the commit', async () => {
    const { stage, matches, slots } = await seedStage('copa-preview');
    const clashing: ResourceAssignment[] = [
      { matchId: item(matches, 0).matchId, slotId: item(slots, 0).slotId },
      { matchId: item(matches, 1).matchId, slotId: item(slots, 0).slotId },
    ];

    const preview = await schedules.previewSchedule({
      organizationId,
      assignments: clashing,
    });

    expect(preview.committable).toBe(false);
    expect(preview.conflicts).toHaveLength(1);
    await expect(schedules.listScheduleForStage(stage.stageId)).resolves.toEqual([]);

    await expect(
      withTransaction(scratch.db, (uow) =>
        schedules.publishSchedule(uow, {
          organizationId,
          assignments: clashing,
          ...AUDIT,
        }),
      ),
    ).rejects.toThrow(preview.conflicts[0]?.detail);
  });

  it('names the published matches a batch would move', async () => {
    const { matches, slots } = await seedStage('copa-impacto');
    const matchId = item(matches, 0).matchId;

    await withTransaction(scratch.db, (uow) =>
      schedules.publishSchedule(uow, {
        organizationId,
        assignments: [{ matchId, slotId: item(slots, 0).slotId }],
        ...AUDIT,
      }),
    );

    const preview = await schedules.previewSchedule({
      organizationId,
      assignments: [{ matchId, slotId: item(slots, 1).slotId }],
    });

    expect(preview.committable).toBe(true);
    expect(preview.affectedPublishedMatches).toEqual([matchId]);
  });

  it('blocks rescheduling a match that has been played, and points at the correction workflow', async () => {
    const { stage, matches, slots } = await seedStage('copa-jugada');
    const competition = new CompetitionRepository(scratch.db);
    const matchId = item(matches, 0).matchId;

    await withTransaction(scratch.db, (uow) =>
      schedules.publishSchedule(uow, {
        organizationId,
        assignments: [{ matchId, slotId: item(slots, 0).slotId }],
        ...AUDIT,
      }),
    );

    // Play it: a match with a result has a time and a place as a fact.
    await withTransaction(scratch.db, (uow) =>
      competition.recordResult(uow, {
        matchId,
        result: {
          sides: [{ entrantId: 'e1', statistics: { goals: 2 } }],
          recordedAt: '2026-08-01T16:00:00.000Z',
        },
        organizationId,
        ...AUDIT,
      }),
    );

    const played = await competition.findMatch(matchId);
    const decision = classifyScheduleMutation({
      published: true,
      matchConcluded: played?.result !== undefined,
    });

    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.error.message).toContain('audited correction workflow');

    const preview = await schedules.previewSchedule({
      organizationId,
      assignments: [{ matchId, slotId: item(slots, 1).slotId }],
    });
    expect(preview.committable).toBe(false);
    expect(preview.conflicts).toEqual([
      expect.objectContaining({ kind: 'match-finalized', matchId }),
    ]);

    await expect(
      withTransaction(scratch.db, (uow) =>
        schedules.publishSchedule(uow, {
          organizationId,
          assignments: [{ matchId, slotId: item(slots, 1).slotId }],
          ...AUDIT,
        }),
      ),
    ).rejects.toThrow(/audited correction workflow/);

    const stored = await schedules.listScheduleForStage(stage.stageId);
    expect(stored[0]?.slotId).toBe(item(slots, 0).slotId);
  });

  it('leaves an unstarted match under the same fixture schedulable even if another match concluded', async () => {
    const { stage, fixtures, matches, slots } = await seedStage('copa-series-schedulable');
    const competition = new CompetitionRepository(scratch.db);
    const match1 = item(matches, 0);

    // Create match 2 under same fixture
    const match2 = await withTransaction(scratch.db, (uow) =>
      competition.createMatch(uow, {
        fixtureId: item(fixtures, 0).fixtureId,
        number: 2,
        organizationId,
        ...AUDIT,
      }),
    );

    // Conclude match 1
    await withTransaction(scratch.db, (uow) =>
      competition.recordResult(uow, {
        matchId: match1.matchId,
        result: {
          sides: [{ entrantId: 'e1', statistics: { goals: 1 } }],
          recordedAt: '2026-08-01T15:00:00.000Z',
        },
        organizationId,
        ...AUDIT,
      }),
    );

    // Rescheduling match 2 must succeed!
    await withTransaction(scratch.db, (uow) =>
      schedules.publishSchedule(uow, {
        organizationId,
        assignments: [{ matchId: match2.matchId, slotId: item(slots, 1).slotId }],
        ...AUDIT,
      }),
    );

    const stored = await schedules.listScheduleForStage(stage.stageId);
    expect(
      stored.some((a) => a.matchId === match2.matchId && a.slotId === item(slots, 1).slotId),
    ).toBe(true);
  });

  it('lets exactly one of two concurrent publishes win the same slot', async () => {
    const { stage, matches, slots } = await seedStage('copa-concurrente');

    const publish = (matchId: string) =>
      withTransaction(scratch.db, (uow) =>
        schedules.publishSchedule(uow, {
          organizationId,
          assignments: [{ matchId, slotId: item(slots, 0).slotId }],
          ...AUDIT,
        }),
      );

    const results = await Promise.allSettled([
      publish(item(matches, 0).matchId),
      publish(item(matches, 1).matchId),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    await expect(schedules.listScheduleForStage(stage.stageId)).resolves.toHaveLength(1);
  });

  it('refuses an empty batch rather than publishing nothing quietly', async () => {
    await expect(
      withTransaction(scratch.db, (uow) =>
        schedules.publishSchedule(uow, {
          organizationId,
          assignments: [],
          ...AUDIT,
        }),
      ),
    ).rejects.toBeInstanceOf(InvariantViolationError);
  });

  it('handles multi-match series, anulls surplus matches, frees slots atomically, and refuses scheduling not-required matches', async () => {
    const { stage, slots } = await seedStage('copa-series-sched');
    const competition = new CompetitionRepository(scratch.db);

    // Create a multi-match fixture with 3 matches (matchCount: 3)
    const fixtures = await withTransaction(scratch.db, (uow) =>
      competition.createFixtures(uow, {
        stageId: stage.stageId,
        matchCount: 3,
        fixtures: [{ round: 1 }],
        organizationId,
        ...AUDIT,
      }),
    );

    const fixture = item(fixtures, 0);
    const stageMatches = await scratch.db
      .selectFrom('matches')
      .selectAll()
      .where('fixture_id', '=', fixture.fixtureId)
      .orderBy('number')
      .execute();

    expect(stageMatches).toHaveLength(3);
    expect(stageMatches.map((m) => m.number)).toEqual([1, 2, 3]);

    const [m1, m2, m3] = stageMatches as [
      (typeof stageMatches)[0],
      (typeof stageMatches)[1],
      (typeof stageMatches)[2],
    ];

    // Assign all 3 matches to schedule slots
    await withTransaction(scratch.db, (uow) =>
      schedules.publishSchedule(uow, {
        organizationId,
        assignments: [
          { matchId: m1.match_id, slotId: item(slots, 0).slotId },
          { matchId: m2.match_id, slotId: item(slots, 1).slotId },
          { matchId: m3.match_id, slotId: item(slots, 2).slotId },
        ],
        ...AUDIT,
      }),
    );

    const initialAssignments = await schedules.listScheduleForStage(stage.stageId);
    expect(initialAssignments).toHaveLength(3);

    // Now anull surplus match 3 (e.g. series decided 2-0)
    const anulled = await withTransaction(scratch.db, (uow) =>
      competition.anullSurplusMatches(uow, {
        fixtureId: fixture.fixtureId,
        anulledMatchNumbers: [3],
        organizationId,
        ...AUDIT,
      }),
    );

    expect(anulled).toHaveLength(1);
    expect(anulled[0]?.status).toBe('not-required');

    // Verify slot for match 3 was atomically freed
    const afterAnullAssignments = await schedules.listScheduleForStage(stage.stageId);
    expect(afterAnullAssignments.map((a) => a.matchId).sort()).toEqual(
      [m1.match_id, m2.match_id].sort(),
    );

    // Verify publishing a schedule assignment for a not-required match is rejected
    await expect(
      withTransaction(scratch.db, (uow) =>
        schedules.publishSchedule(uow, {
          organizationId,
          assignments: [{ matchId: m3.match_id, slotId: item(slots, 2).slotId }],
          ...AUDIT,
        }),
      ),
    ).rejects.toBeInstanceOf(InvariantViolationError);
  });
});
