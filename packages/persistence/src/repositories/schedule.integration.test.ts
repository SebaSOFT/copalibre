import {
  classifyScheduleMutation,
  winConditionScript,
  type DisciplineDescriptor,
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
const window = (startMinutes: number, durationMinutes = 60) => ({
  startsAt: BASE + startMinutes * 60_000,
  durationMinutes,
});

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

  /** A stage with four fixtures, two clubs each, plus a court and two referees. */
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

      return { stage, fixtures, entrants, venue, referee };
    });
  }

  it('creates venues and officials with an audit record', async () => {
    const { venue, referee } = await seedStage('copa-recursos');

    expect(venue.concurrentCapacity).toBe(1);
    expect(referee.roles).toEqual(['referee']);

    const audit = await new AuditReader(scratch.db).historyFor('venue', venue.venueId);
    expect(audit.map((entry) => entry.action)).toEqual(['venue.created']);
    expect(audit[0]?.resultingState).toMatchObject({ name: 'Cancha 1' });
  });

  it('refuses a venue that could not hold a fixture, writing nothing', async () => {
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

  it('publishes a whole schedule and emits one event', async () => {
    const { stage, fixtures, venue, referee } = await seedStage('copa-publicada');

    const assignments: ResourceAssignment[] = [
      {
        fixtureId: fixtures[0]?.fixtureId ?? '',
        window: window(0),
        venueId: venue.venueId,
        officialIds: [referee.officialId],
      },
      { fixtureId: fixtures[1]?.fixtureId ?? '', window: window(60), venueId: venue.venueId },
    ];

    await withTransaction(scratch.db, (uow) =>
      schedules.publishSchedule(uow, {
        stageId: stage.stageId,
        assignments,
        ...{ organizationId },
        ...AUDIT,
      }),
    );

    const stored = await schedules.listSchedule(stage.stageId);
    expect(stored).toHaveLength(2);
    expect(stored.find((a) => a.fixtureId === assignments[0]?.fixtureId)?.officialIds).toEqual([
      referee.officialId,
    ]);

    const outbox = await new OutboxReader(scratch.db).pending(50);
    expect(outbox.some((record) => record.eventType === 'schedule.published')).toBe(true);
  });

  it('publishes nothing when one assignment in the batch conflicts', async () => {
    const { stage, fixtures, venue } = await seedStage('copa-atomica');

    await expect(
      withTransaction(scratch.db, (uow) =>
        schedules.publishSchedule(uow, {
          stageId: stage.stageId,
          assignments: [
            { fixtureId: fixtures[0]?.fixtureId ?? '', window: window(0), venueId: venue.venueId },
            // Overlaps the first at a single-capacity venue.
            { fixtureId: fixtures[1]?.fixtureId ?? '', window: window(30), venueId: venue.venueId },
          ],
          organizationId,
          ...AUDIT,
        }),
      ),
    ).rejects.toThrow(/conflict/);

    // Not "most of" the schedule — none of it.
    await expect(schedules.listSchedule(stage.stageId)).resolves.toEqual([]);
  });

  it('sees a fixture scheduled earlier in the same transaction', async () => {
    const { stage, fixtures, venue } = await seedStage('copa-misma-tx');

    // Both writes in one unit of work: the second must see the first, which a
    // check reading through the pool could not.
    await expect(
      withTransaction(scratch.db, async (uow) => {
        await schedules.publishSchedule(uow, {
          stageId: stage.stageId,
          assignments: [
            { fixtureId: fixtures[0]?.fixtureId ?? '', window: window(0), venueId: venue.venueId },
          ],
          organizationId,
          ...AUDIT,
        });
        await schedules.publishSchedule(uow, {
          stageId: stage.stageId,
          assignments: [
            { fixtureId: fixtures[1]?.fixtureId ?? '', window: window(15), venueId: venue.venueId },
          ],
          organizationId,
          ...AUDIT,
        });
      }),
    ).rejects.toThrow(/conflict/);

    await expect(schedules.listSchedule(stage.stageId)).resolves.toEqual([]);
  });

  it('reschedules a fixture without clashing with its own earlier slot', async () => {
    const { stage, fixtures, venue } = await seedStage('copa-reprogramada');
    const fixtureId = fixtures[0]?.fixtureId ?? '';

    await withTransaction(scratch.db, (uow) =>
      schedules.publishSchedule(uow, {
        stageId: stage.stageId,
        assignments: [{ fixtureId, window: window(0), venueId: venue.venueId }],
        organizationId,
        ...AUDIT,
      }),
    );
    await withTransaction(scratch.db, (uow) =>
      schedules.publishSchedule(uow, {
        stageId: stage.stageId,
        assignments: [{ fixtureId, window: window(30), venueId: venue.venueId }],
        organizationId,
        ...AUDIT,
      }),
    );

    const stored = await schedules.listSchedule(stage.stageId);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.window.startsAt).toBe(window(30).startsAt);
  });

  it('lets a three-court venue host three fixtures at once', async () => {
    const { stage, fixtures, venue } = await seedStage('copa-tres-canchas', 3);

    await withTransaction(scratch.db, (uow) =>
      schedules.publishSchedule(uow, {
        stageId: stage.stageId,
        assignments: fixtures.slice(0, 3).map((fixture) => ({
          fixtureId: fixture.fixtureId,
          window: window(0),
          venueId: venue.venueId,
        })),
        organizationId,
        ...AUDIT,
      }),
    );

    await expect(schedules.listSchedule(stage.stageId)).resolves.toHaveLength(3);
  });

  it('enforces a rest rule across fixtures an entrant plays in', async () => {
    const { stage, fixtures, venue } = await seedStage('copa-descanso');

    // Fixtures 0 and 2 share entrant Alfa.
    await expect(
      withTransaction(scratch.db, (uow) =>
        schedules.publishSchedule(uow, {
          stageId: stage.stageId,
          assignments: [
            { fixtureId: fixtures[0]?.fixtureId ?? '', window: window(0), venueId: venue.venueId },
            { fixtureId: fixtures[2]?.fixtureId ?? '', window: window(70), venueId: venue.venueId },
          ],
          restRule: { minimumMinutes: 30 },
          organizationId,
          ...AUDIT,
        }),
      ),
    ).rejects.toThrow(/10 minute\(s\)/);
  });

  it('previews a batch without writing it, and agrees with the commit', async () => {
    const { stage, fixtures, venue } = await seedStage('copa-preview');
    const clashing: ResourceAssignment[] = [
      { fixtureId: fixtures[0]?.fixtureId ?? '', window: window(0), venueId: venue.venueId },
      { fixtureId: fixtures[1]?.fixtureId ?? '', window: window(10), venueId: venue.venueId },
    ];

    const preview = await schedules.previewSchedule({
      stageId: stage.stageId,
      assignments: clashing,
    });

    expect(preview.committable).toBe(false);
    expect(preview.conflicts).toHaveLength(1);
    await expect(schedules.listSchedule(stage.stageId)).resolves.toEqual([]);

    // The commit refuses for exactly the reason the preview reported.
    await expect(
      withTransaction(scratch.db, (uow) =>
        schedules.publishSchedule(uow, {
          stageId: stage.stageId,
          assignments: clashing,
          organizationId,
          ...AUDIT,
        }),
      ),
    ).rejects.toThrow(preview.conflicts[0]?.detail);
  });

  it('names the published fixtures a batch would move', async () => {
    const { stage, fixtures, venue } = await seedStage('copa-impacto');
    const fixtureId = fixtures[0]?.fixtureId ?? '';

    await withTransaction(scratch.db, (uow) =>
      schedules.publishSchedule(uow, {
        stageId: stage.stageId,
        assignments: [{ fixtureId, window: window(0), venueId: venue.venueId }],
        organizationId,
        ...AUDIT,
      }),
    );

    const preview = await schedules.previewSchedule({
      stageId: stage.stageId,
      assignments: [{ fixtureId, window: window(120), venueId: venue.venueId }],
    });

    expect(preview.committable).toBe(true);
    expect(preview.affectedPublishedFixtures).toEqual([fixtureId]);
  });

  it('blocks rescheduling a match that has been played, and points at the correction workflow', async () => {
    const { stage, fixtures, venue } = await seedStage('copa-jugada');
    const competition = new CompetitionRepository(scratch.db);
    const fixtureId = fixtures[0]?.fixtureId ?? '';

    await withTransaction(scratch.db, (uow) =>
      schedules.publishSchedule(uow, {
        stageId: stage.stageId,
        assignments: [{ fixtureId, window: window(0), venueId: venue.venueId }],
        organizationId,
        ...AUDIT,
      }),
    );

    // Play it: a match with a result has a time and a place as a fact.
    const match = await withTransaction(scratch.db, (uow) =>
      competition.createMatch(uow, { fixtureId, number: 1, organizationId, ...AUDIT }),
    );
    await withTransaction(scratch.db, (uow) =>
      competition.recordResult(uow, {
        matchId: match.matchId,
        result: {
          sides: [{ entrantId: 'e1', statistics: { goals: 2 } }],
          recordedAt: '2026-08-01T16:00:00.000Z',
        },
        organizationId,
        ...AUDIT,
      }),
    );

    const played = await competition.findMatch(match.matchId);
    const decision = classifyScheduleMutation({
      published: true,
      matchConcluded: played?.result !== undefined,
    });

    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.error.message).toContain('audited correction workflow');

    // And the stored schedule is untouched by the attempt.
    const stored = await schedules.listSchedule(stage.stageId);
    expect(stored[0]?.window.startsAt).toBe(window(0).startsAt);
  });

  it('classifies an unpublished edit as safe and a published one as a rebuild', async () => {
    const { stage, fixtures, venue } = await seedStage('copa-clasificacion');
    const fixtureId = fixtures[0]?.fixtureId ?? '';

    // Nothing published yet.
    const beforePublish = await schedules.previewSchedule({
      stageId: stage.stageId,
      assignments: [{ fixtureId, window: window(0), venueId: venue.venueId }],
    });
    expect(
      classifyScheduleMutation({ published: beforePublish.affectedPublishedFixtures.length > 0 })
        .ok,
    ).toBe(true);
    expect(beforePublish.affectedPublishedFixtures).toEqual([]);

    await withTransaction(scratch.db, (uow) =>
      schedules.publishSchedule(uow, {
        stageId: stage.stageId,
        assignments: [{ fixtureId, window: window(0), venueId: venue.venueId }],
        organizationId,
        ...AUDIT,
      }),
    );

    const afterPublish = await schedules.previewSchedule({
      stageId: stage.stageId,
      assignments: [{ fixtureId, window: window(120), venueId: venue.venueId }],
    });
    const decision = classifyScheduleMutation({
      published: afterPublish.affectedPublishedFixtures.length > 0,
      affectedPublishedFixtures: afterPublish.affectedPublishedFixtures.map((id) => ({
        fixtureId: id,
        stageId: stage.stageId,
        hasResult: false,
      })),
    });

    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.value).toMatchObject({
      mutationClass: 'requires_rebuild',
      invalidates: [{ fixtureId }],
    });
  });

  it('lets exactly one of two concurrent publishes win the same slot', async () => {
    const { stage, fixtures, venue } = await seedStage('copa-concurrente');

    // Two operators, two connections, one court, overlapping windows. Without
    // the row lock both would read "no conflict" and both would write.
    const publish = (fixtureId: string, startMinutes: number) =>
      withTransaction(scratch.db, (uow) =>
        schedules.publishSchedule(uow, {
          stageId: stage.stageId,
          assignments: [{ fixtureId, window: window(startMinutes), venueId: venue.venueId }],
          organizationId,
          ...AUDIT,
        }),
      );

    const results = await Promise.allSettled([
      publish(fixtures[0]?.fixtureId ?? '', 0),
      publish(fixtures[1]?.fixtureId ?? '', 30),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    // And the database holds the winner alone, not both and not neither.
    await expect(schedules.listSchedule(stage.stageId)).resolves.toHaveLength(1);
  });

  it('runs publishes touching different venues in parallel', async () => {
    const { stage, fixtures, venue } = await seedStage('copa-paralela');
    const second = await withTransaction(scratch.db, (uow) =>
      schedules.createVenue(uow, {
        organizationId,
        alias: 'court-paralela-2',
        name: 'Cancha 2',
        concurrentCapacity: 1,
        ...AUDIT,
      }),
    );

    // Same instant, different courts: nothing contends, so both commit.
    const results = await Promise.allSettled([
      withTransaction(scratch.db, (uow) =>
        schedules.publishSchedule(uow, {
          stageId: stage.stageId,
          assignments: [
            { fixtureId: fixtures[0]?.fixtureId ?? '', window: window(0), venueId: venue.venueId },
          ],
          organizationId,
          ...AUDIT,
        }),
      ),
      withTransaction(scratch.db, (uow) =>
        schedules.publishSchedule(uow, {
          stageId: stage.stageId,
          assignments: [
            { fixtureId: fixtures[1]?.fixtureId ?? '', window: window(0), venueId: second.venueId },
          ],
          organizationId,
          ...AUDIT,
        }),
      ),
    ]);

    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    await expect(schedules.listSchedule(stage.stageId)).resolves.toHaveLength(2);
  });

  it('refuses an empty batch rather than publishing nothing quietly', async () => {
    const { stage } = await seedStage('copa-vacia');

    await expect(
      withTransaction(scratch.db, (uow) =>
        schedules.publishSchedule(uow, {
          stageId: stage.stageId,
          assignments: [],
          organizationId,
          ...AUDIT,
        }),
      ),
    ).rejects.toBeInstanceOf(InvariantViolationError);
  });
});
