import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * A console command claims its idempotency key in the same transaction as its writes. The
 * claimed row carries `response_pending` until the response read after the commit replaces the
 * placeholder. Rows written before this migration are completed records.
 */
export const idempotencyClaim: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable('match_command_idempotency')
      .addColumn('response_pending', 'boolean', (col) => col.notNull().defaultTo(false))
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    // A pending row belongs to a command that committed. Kept, it is read as a completed record
    // with an empty response: a retry gets that empty answer instead of applying the command a
    // second time. Deleting it would free the key for exactly that second application.
    await db.schema
      .alterTable('match_command_idempotency')
      .dropColumn('response_pending')
      .execute();
  },
};
