import {
  ProjectionStore,
  StatisticProjection,
  StatisticRepository,
  withTransaction,
  type ClaimedJob,
  type Database,
  type Refold,
} from '@copalibre/persistence';
import type { Kysely } from 'kysely';
import type { JobHandler } from './dispatcher.js';

/**
 * The handler that keeps folded figures current (0017 × 0016).
 *
 * 0016 built the projection with its fold injected and nothing calling it in
 * production. This is the caller: the relay hands it a finalized or superseded
 * match, and it recomputes that match's figures inside one transaction with the
 * projection version and the cursor.
 *
 * The version is allocated in that same transaction rather than taken from the
 * outbox row. The row's `projectionVersion` is what the *producer* believed at
 * write time; what a reader needs is a number that increases every time the
 * projection actually changed, and only the recalculation knows that.
 */

export const STATISTICS_CONSUMER = 'statistics-projection';

export function statisticsHandler(input: {
  readonly db: Kysely<Database>;
  readonly refold: Refold;
}): JobHandler {
  const statistics = new StatisticRepository(input.db);
  const projections = new ProjectionStore(input.db);
  const projection = new StatisticProjection(statistics, input.refold);

  return async (job: ClaimedJob): Promise<void> => {
    if (!StatisticProjection.handles(job.eventType)) return;

    await withTransaction(input.db, async (uow) => {
      const version = await projections.nextVersion(uow, {
        projectionType: 'statistic-totals',
        entityId: job.entityId,
      });

      await projection.apply(uow, {
        eventType: job.eventType,
        organizationId: job.organizationId,
        entityId: job.entityId,
        projectionVersion: version,
      });

      // Same transaction as the rebuild: a cursor advanced separately says work
      // was done that a crash may have rolled back, and nobody notices until
      // somebody asks why a table is stale.
      await projections.advanceCursor(uow, {
        consumer: STATISTICS_CONSUMER,
        lastEventId: job.eventId,
      });
    });
  };
}
