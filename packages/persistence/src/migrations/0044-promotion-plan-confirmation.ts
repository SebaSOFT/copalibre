import type { Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * The qualifier position → entrant map an organizer confirmed for a plan. Qualifier sides of a
 * stage generated ahead resolve from this stored fact, never from live standings, so finishing
 * the prior stage fills nothing on its own.
 */
export const promotionPlanConfirmation: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable('promotion_plans')
      .addColumn('confirmed_resolution', 'jsonb')
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('promotion_plans').dropColumn('confirmed_resolution').execute();
  },
};
