import { sql, type Kysely } from 'kysely';
import type { Migration } from 'kysely/migration';

/**
 * Participant self-service reports/disputes — a new fact type,
 * never a mutation path. `evidence` files reference the object-storage
 * adapter by bucket/key; no bytes live in this database.
 */
export const participantReports: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('participant_reports')
      .addColumn('report_id', 'uuid', (col) => col.primaryKey())
      .addColumn('organization_id', 'uuid', (col) =>
        col.notNull().references('organizations.organization_id'),
      )
      .addColumn('match_id', 'uuid', (col) => col.notNull().references('matches.match_id'))
      .addColumn('kind', 'text', (col) => col.notNull())
      .addColumn('submitted_by_person_id', 'uuid', (col) =>
        col.notNull().references('persons.person_id'),
      )
      .addColumn('submitted_at', 'timestamptz', (col) => col.notNull())
      .addColumn('reason', 'text')
      .addColumn('proposed_result', 'jsonb')
      .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
      .addColumn('reviewed_by', 'text')
      .addColumn('reviewed_at', 'timestamptz')
      .addColumn('review_note', 'text')
      .addColumn('created_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .execute();

    await db.schema
      .createIndex('participant_reports_match_idx')
      .on('participant_reports')
      .columns(['match_id'])
      .execute();
    await db.schema
      .createIndex('participant_reports_status_idx')
      .on('participant_reports')
      .columns(['organization_id', 'status'])
      .execute();

    await db.schema
      .createTable('report_evidence')
      .addColumn('evidence_id', 'uuid', (col) => col.primaryKey())
      .addColumn('report_id', 'uuid', (col) =>
        col.notNull().references('participant_reports.report_id'),
      )
      .addColumn('organization_id', 'uuid', (col) =>
        col.notNull().references('organizations.organization_id'),
      )
      .addColumn('filename', 'text', (col) => col.notNull())
      .addColumn('content_type', 'text', (col) => col.notNull())
      .addColumn('size_bytes', 'bigint', (col) => col.notNull())
      .addColumn('storage_bucket', 'text', (col) => col.notNull())
      .addColumn('storage_key', 'text', (col) => col.notNull())
      .addColumn('uploaded_by', 'text', (col) => col.notNull())
      .addColumn('uploaded_at', 'timestamptz', (col) =>
        col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
      )
      .addColumn('validation_status', 'text', (col) => col.notNull().defaultTo('pending'))
      .execute();

    await db.schema
      .createIndex('report_evidence_report_idx')
      .on('report_evidence')
      .columns(['report_id'])
      .execute();
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('report_evidence').ifExists().execute();
    await db.schema.dropTable('participant_reports').ifExists().execute();
  },
};
