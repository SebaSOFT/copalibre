import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * How much of a collector-threshold rule's total each actor has already
 * answered with a firing — the `since-last-consequence` window's
 * durable state, read once per evaluation and written on every firing, kept
 * apart from the collector total it never edits.
 *
 * Keyed by stage as well as rule and actor: the `carriedIn` total this rule
 * evaluates against is itself stage-scoped (0074's bridging query only sums a
 * stage's own matches), so a consumed baseline that ignored the stage would
 * compare a number from one stage's scale against another's — the same
 * player crossing a threshold in two different stages of one tournament must
 * answer two separate windows, not share one.
 */
export const collectorThresholdConsumption: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('collector_threshold_consumption')
      .addColumn('rule_id', 'text', (col) => col.notNull())
      .addColumn('actor_id', 'text', (col) => col.notNull())
      .addColumn('stage_id', 'uuid', (col) => col.notNull().references('stages.stage_id'))
      .addColumn('consumed_total', 'double precision', (col) => col.notNull())
      .addColumn('updated_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addPrimaryKeyConstraint('collector_threshold_consumption_pk', [
        'rule_id',
        'actor_id',
        'stage_id',
      ])
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('collector_threshold_consumption').execute();
  },
};
