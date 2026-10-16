import {
  EventStreamReader,
  OrganizationRepository,
  ScheduleRepository,
  withTransaction,
} from '@copalibre/persistence';
import {
  createMigratedDatabase,
  type ScratchDatabase,
} from '../../../../packages/persistence/src/test-support/scratch-database.js';
import {
  seedScheduledTournament,
  scheduleAudit,
} from '../../../../packages/persistence/src/test-support/scheduled-tournament.js';
import { SubscriptionService } from './subscription.js';

let scratch: ScratchDatabase;
beforeAll(async () => {
  scratch = await createMigratedDatabase('events-reschedule');
});
afterAll(async () => {
  await scratch?.drop();
});

it('delivers a sanitized placement only to its tournament, with the same scope on replay', async () => {
  const db = scratch.db;
  const organization = await withTransaction(db, (uow) =>
    new OrganizationRepository(db).create(uow, {
      alias: 'liga-eventos',
      name: 'Liga',
      ...scheduleAudit,
    }),
  );
  const organizationId = organization.organizationId;
  const a = await seedScheduledTournament(db, organizationId, 'copa-alfa');
  const b = await seedScheduledTournament(db, organizationId, 'copa-bravo');
  await withTransaction(db, (uow) =>
    new ScheduleRepository(db).publishSchedule(uow, {
      organizationId,
      ...scheduleAudit,
      assignments: [
        { matchId: a.matchId, slotId: a.first.slotId },
        { matchId: b.matchId, slotId: b.first.slotId },
      ],
    }),
  );
  const service = new SubscriptionService(new EventStreamReader(db));
  for (const own of [a, b]) {
    const batch = await service.next({
      organizationId,
      tournamentId: own.tournament.tournamentId,
      visibility: 'public',
    });
    expect(batch.kind).toBe('events');
    if (batch.kind !== 'events') throw new Error('Expected events');
    const changes = batch.events.filter((event) => event.eventType === 'match.rescheduled');
    expect(changes).toHaveLength(1);
    expect(changes[0]?.payload).toEqual({
      matchId: own.matchId,
      stageId: own.stage.stageId,
      startsAt: own.first.startsAt,
      estimatedEnd: own.first.startsAt + 90 * 60_000,
      venue: { alias: `${own.tournament.alias}-court-1`, name: 'Cancha 1' },
      withdrawn: false,
      previous: null,
    });
    expect(changes[0]?.payload).not.toHaveProperty('actor');
    expect(changes[0]?.payload).not.toHaveProperty('officialIds');
    const replay = await service.next({
      organizationId,
      tournamentId: own.tournament.tournamentId,
      visibility: 'public',
    });
    expect(replay).toEqual(batch);
  }
});
