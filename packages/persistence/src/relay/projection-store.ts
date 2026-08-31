import { sql, type Kysely } from 'kysely';
import { newId } from '../ids.js';
import { toIsoString } from '../mapping.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';

/**
 * Projection versions and the durable cursor.
 *
 * A projection version is **per projection**, not global: a monotonic counter
 * over the whole platform would make every consumer's version jump whenever an
 * unrelated tournament recalculated, and the SSE tier reading it would
 * resend everything on every bump. So `(projection_type, entity_id)` carries
 * its own sequence, allocated in the same statement that increments it —
 * read-then-write would hand the same number to two workers.
 *
 * The cursor is written **in the same transaction as the projection it
 * describes**. Advanced separately, a crash between the two leaves a cursor
 * saying work was done that was not, and that is a gap nobody notices until
 * somebody asks why a standing is stale.
 */

export interface ProjectionVersion {
  readonly projectionType: string;
  readonly entityId: string;
  readonly version: number;
  readonly updatedAt: string;
}

export class ProjectionStore {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Allocates the next version for one projection, atomically.
   *
   * Takes a `UnitOfWork` so the allocation shares the transaction that writes
   * what the version describes: a version that outlives a rolled-back rebuild
   * is a number pointing at data that was never written.
   */
  async nextVersion(
    uow: UnitOfWork,
    input: { readonly projectionType: string; readonly entityId: string },
  ): Promise<number> {
    const { rows } = await sql<{ version: number }>`
      insert into projection_versions (projection_id, projection_type, entity_id, version, updated_at)
      values (${newId()}, ${input.projectionType}, ${input.entityId}, 1, now())
      on conflict (projection_type, entity_id) do update
      set version = projection_versions.version + 1,
          updated_at = now()
      returning version
    `.execute(uow.tx);

    return Number(rows[0]?.version ?? 1);
  }

  async versionOf(
    projectionType: string,
    entityId: string,
  ): Promise<ProjectionVersion | undefined> {
    const row = await this.db
      .selectFrom('projection_versions')
      .selectAll()
      .where('projection_type', '=', projectionType)
      .where('entity_id', '=', entityId)
      .executeTakeFirst();

    return row
      ? {
          projectionType: row.projection_type,
          entityId: row.entity_id,
          version: row.version,
          updatedAt: toIsoString(row.updated_at),
        }
      : undefined;
  }

  /** Records how far a consumer has read, inside the caller's transaction. */
  async advanceCursor(
    uow: UnitOfWork,
    input: { readonly consumer: string; readonly lastEventId: string },
  ): Promise<void> {
    await uow.tx
      .insertInto('event_cursors')
      .values({
        cursor_id: newId(),
        consumer: input.consumer,
        last_event_id: input.lastEventId,
        updated_at: new Date(),
      })
      .onConflict((conflict) =>
        conflict
          .column('consumer')
          .doUpdateSet({ last_event_id: input.lastEventId, updated_at: new Date() }),
      )
      .execute();
  }

  async cursorOf(consumer: string): Promise<string | undefined> {
    const row = await this.db
      .selectFrom('event_cursors')
      .select('last_event_id')
      .where('consumer', '=', consumer)
      .executeTakeFirst();
    return row?.last_event_id;
  }
}
