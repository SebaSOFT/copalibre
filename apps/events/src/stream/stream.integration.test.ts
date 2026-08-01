import { EventStreamReader, withTransaction, type Database } from '@copalibre/persistence';
import {
  createMigratedDatabase,
  type ScratchDatabase,
} from '../../../../packages/persistence/src/test-support/scratch-database.js';
import type { Kysely } from 'kysely';
import { SubscriptionService } from './subscription.js';

/**
 * Replay against real PostgreSQL (0018).
 *
 * Every claim here is about ordering, cursors and windows — three things a fake
 * would get right by construction and a database gets right only if the query
 * does.
 */

const ORGANIZATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ORGANIZATION = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const TOURNAMENT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('cursor-based replay (integration)', () => {
  let scratch: ScratchDatabase;
  let db: Kysely<Database>;
  const ids: string[] = [];

  beforeAll(async () => {
    scratch = await createMigratedDatabase('events-stream');
    db = scratch.db;

    for (const organizationId of [ORGANIZATION, OTHER_ORGANIZATION]) {
      await db
        .insertInto('organizations')
        .values({
          organization_id: organizationId,
          alias: organizationId === ORGANIZATION ? 'liga' : 'otra-liga',
          name: 'Liga',
          created_at: new Date(),
        })
        .execute();
    }

    for (const [index, eventType] of [
      'match.finalized',
      'person.registered',
      'match.finalized',
    ].entries()) {
      const id = await withTransaction(db, (uow) =>
        uow.publishEvent({
          organizationId: ORGANIZATION,
          stream: `match:m-${index}`,
          entityId: TOURNAMENT,
          eventType,
          projectionVersion: index + 1,
          payload: { matchId: `m-${index}`, result: { home: index }, refereeNotes: 'privado' },
        }),
      );
      ids.push(id);
    }

    await withTransaction(db, (uow) =>
      uow.publishEvent({
        organizationId: OTHER_ORGANIZATION,
        stream: 'match:other',
        entityId: TOURNAMENT,
        eventType: 'match.finalized',
        projectionVersion: 1,
        payload: { matchId: 'other' },
      }),
    );
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  function service(windowSeconds = 3600): SubscriptionService {
    return new SubscriptionService(
      new EventStreamReader(db, { seconds: windowSeconds, maxEvents: 500 }),
    );
  }

  it('replays everything missed since a cursor, in order', async () => {
    const batch = await service().next({
      organizationId: ORGANIZATION,
      visibility: 'control',
      afterEventId: ids[0],
    });

    expect(batch.kind).toBe('events');
    if (batch.kind !== 'events') return;
    expect(batch.events.map((event) => event.eventId)).toEqual([ids[1], ids[2]]);
  });

  it('replays nothing when the cursor is already the latest', async () => {
    const batch = await service().next({
      organizationId: ORGANIZATION,
      visibility: 'control',
      afterEventId: ids[2],
    });

    expect(batch.kind === 'events' && batch.events).toEqual([]);
  });

  it('tells a client with an expired cursor to fetch the projection', async () => {
    // Zero-second window: everything is already too old, which is the same
    // situation as a client that was away for an hour.
    const batch = await service(0).next({
      organizationId: ORGANIZATION,
      visibility: 'control',
      afterEventId: ids[0],
    });

    // Not a silent partial replay: a partial replay presented as a complete one
    // is a scoreboard that is quietly wrong.
    expect(batch.kind).toBe('expired');
    if (batch.kind !== 'expired') return;
    expect(batch.reason).toContain('replay window');
  });

  it('tells a client whose cursor names nothing to fetch the projection', async () => {
    const batch = await service().next({
      organizationId: ORGANIZATION,
      visibility: 'control',
      afterEventId: '00000000-0000-4000-8000-000000000000',
    });

    expect(batch.kind).toBe('expired');
  });

  it('never includes another organization’s events', async () => {
    const batch = await service().next({ organizationId: ORGANIZATION, visibility: 'control' });

    expect(
      batch.kind === 'events' && batch.events.every((e) => e.organizationId === ORGANIZATION),
    ).toBe(true);
  });

  it('never includes an unpublished event type on the public stream', async () => {
    const batch = await service().next({ organizationId: ORGANIZATION, visibility: 'public' });

    expect(batch.kind).toBe('events');
    if (batch.kind !== 'events') return;
    expect(batch.events.map((event) => event.eventType)).toEqual([
      'match.finalized',
      'match.finalized',
    ]);
    // And the private field is gone from the ones it does publish.
    expect(batch.events.every((event) => !('refereeNotes' in event.payload))).toBe(true);
  });

  it('advances a public subscriber past the private events it skipped', async () => {
    const batch = await service().next({
      organizationId: ORGANIZATION,
      visibility: 'public',
      afterEventId: ids[0],
    });

    expect(batch.kind === 'events' && batch.cursor).toBe(ids[2]);
  });

  it('gives the long poll and a reconnect identical events for one cursor', async () => {
    // The fallback is a wrapper over this resolution, not a second
    // implementation — so "same cursor, same answer" is a property of the code
    // rather than of two things being kept in step by hand.
    const first = await service().next({
      organizationId: ORGANIZATION,
      visibility: 'control',
      afterEventId: ids[0],
    });
    const second = await service().next({
      organizationId: ORGANIZATION,
      visibility: 'control',
      afterEventId: ids[0],
    });

    expect(first).toEqual(second);
  });
});

describe('scoping to a tournament (integration)', () => {
  let scratch: ScratchDatabase;

  beforeAll(async () => {
    scratch = await createMigratedDatabase('events-scope');
  });

  afterAll(async () => {
    await scratch?.drop();
  });

  it('resolves a tournament to the entities its events are filed under', async () => {
    const reader = new EventStreamReader(scratch.db);

    // A tournament with nothing in it resolves to itself, which is what makes
    // an empty stream empty rather than an error.
    expect(await reader.entitiesOf(TOURNAMENT)).toEqual([TOURNAMENT]);
  });
});
