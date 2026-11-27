import { newId } from '../ids.js';
import assert from 'node:assert/strict';
import { OrganizationRepository } from './organization-repository.js';
import { ScheduleRepository } from './schedule-repository.js';
import { CompetitionRepository } from './competition-repository.js';
import { EventStreamReader } from '../relay/event-stream.js';
import { createMigratedDatabase, type ScratchDatabase } from '../test-support/scratch-database.js';
import { scheduleAudit, seedScheduledTournament } from '../test-support/scheduled-tournament.js';
import { withTransaction } from '../transaction.js';

let scratch: ScratchDatabase;
beforeAll(async () => {
  scratch = await createMigratedDatabase('schedule-propagation');
});
afterAll(async () => {
  await scratch?.drop();
});

it('publishes only changed placements, in their own tournament streams, with transactional versions and withdrawals', async () => {
  const db = scratch.db;
  const organization = await withTransaction(db, (uow) =>
    new OrganizationRepository(db).create(uow, {
      alias: 'liga-propagacion',
      name: 'Liga',
      ...scheduleAudit,
    }),
  );
  const organizationId = organization.organizationId;
  await db
    .insertInto('identity_principals')
    .values({
      principal_id: newId(),
      email: 'operator@example.test',
      name: 'María González',
      oidc_subject_id: 'test-operator',
      picture: null,
      password_hash: null,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .execute();
  const a = await seedScheduledTournament(db, organizationId, 'copa-alfa');
  const b = await seedScheduledTournament(db, organizationId, 'copa-bravo');
  const schedules = new ScheduleRepository(db);
  const publish = (
    assignments: { matchId: string; slotId: string }[],
    withdrawals?: { matchId: string }[],
  ) =>
    withTransaction(db, (uow) =>
      schedules.publishSchedule(uow, {
        organizationId,
        ...scheduleAudit,
        assignments,
        withdrawals,
        reason: { text: 'Cambio de cancha' },
      }),
    );
  const batch = [
    { matchId: a.matchId, slotId: a.first.slotId },
    { matchId: b.matchId, slotId: b.first.slotId },
  ];
  await schedules.previewSchedule({ organizationId, assignments: batch });
  const events = () =>
    db
      .selectFrom('outbox_events')
      .selectAll()
      .where('event_type', 'in', ['match.rescheduled', 'match.anulled'])
      .orderBy('event_id')
      .execute();
  expect(await events()).toHaveLength(0);
  await publish(batch);
  expect(await events()).toHaveLength(2);
  await publish(batch);
  expect(await events()).toHaveLength(2);
  await publish([
    { matchId: a.matchId, slotId: a.second.slotId },
    { matchId: b.matchId, slotId: b.second.slotId },
  ]);
  const reader = new EventStreamReader(db);
  for (const own of [a, b]) {
    const stream = await reader.resolve({
      organizationId,
      tournamentId: own.tournament.tournamentId,
    });
    expect(stream.kind).toBe('replay');
    if (stream.kind !== 'replay') throw new Error('Expected events');
    const changes = stream.events.filter((event) => event.eventType === 'match.rescheduled');
    expect(changes).toHaveLength(2);
    expect(
      changes.every(
        (event) => event.entityId === own.matchId && event.stream === `match:${own.matchId}`,
      ),
    ).toBe(true);
    expect(changes.map((event) => event.projectionVersion)).toEqual([1, 2]);
    expect(changes[1]?.payload).toMatchObject({
      matchId: own.matchId,
      stageId: own.stage.stageId,
      startsAt: own.second.startsAt,
      withdrawn: false,
      actorName: 'María González',
      previous: { startsAt: own.first.startsAt, venue: { name: 'Cancha 1' } },
    });
  }
  await publish([], [{ matchId: a.matchId }]);
  const withdrawn = (await events()).find(
    (event) => event.entity_id === a.matchId && Number(event.projection_version) === 3,
  );
  assert.ok(withdrawn);
  const payload =
    typeof withdrawn.payload === 'string' ? JSON.parse(withdrawn.payload) : withdrawn.payload;
  expect(payload).toMatchObject({
    withdrawn: true,
    startsAt: null,
    previous: { startsAt: a.second.startsAt },
  });
  await withTransaction(db, (uow) =>
    new CompetitionRepository(db).anullSurplusMatches(uow, {
      organizationId,
      ...scheduleAudit,
      fixtureId: b.fixtureId,
      anulledMatchNumbers: [1],
    }),
  );
  const anulled = (await events()).find((event) => event.event_type === 'match.anulled');
  assert.ok(anulled);
  expect(Number(anulled.projection_version)).toBe(3);
  await expect(
    withTransaction(db, async (uow) => {
      await schedules.publishSchedule(uow, {
        organizationId,
        ...scheduleAudit,
        assignments: [{ matchId: a.matchId, slotId: a.first.slotId }],
      });
      throw new Error('rollback');
    }),
  ).rejects.toThrow('rollback');
  expect((await events()).filter((event) => event.entity_id === a.matchId)).toHaveLength(3);
});
