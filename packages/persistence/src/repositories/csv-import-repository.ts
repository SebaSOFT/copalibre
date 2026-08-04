import { createHash } from 'node:crypto';
import type { CsvImportPreview, ParticipantImportTarget } from '@copalibre/domain';
import type { Kysely, Selectable } from 'kysely';
import { newId } from '../ids.js';
import type { Database } from '../schema.js';
import type { UnitOfWork } from '../transaction.js';

export type CsvImportStatus =
  'queued' | 'validating' | 'review-ready' | 'invalid' | 'committing' | 'committed';

export interface CsvImportSession {
  readonly importId: string;
  readonly organizationId: string;
  readonly tournamentId: string;
  readonly target: ParticipantImportTarget;
  readonly sourceCsv: string;
  readonly sourceHash: string;
  readonly status: CsvImportStatus;
  readonly preview?: CsvImportPreview;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly reviewedAt?: Date;
  readonly committedAt?: Date;
}

/** Import sources stay in the database; the outbox carries only `importId`. */
export class CsvImportRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async create(
    uow: UnitOfWork,
    input: {
      readonly organizationId: string;
      readonly tournamentId: string;
      readonly target: ParticipantImportTarget;
      readonly sourceCsv: string;
      readonly actor: string;
    },
  ): Promise<CsvImportSession> {
    const importId = newId();
    const now = new Date();
    const sourceHash = hashSource(input.sourceCsv);
    const row = await uow.tx
      .insertInto('csv_import_sessions')
      .values({
        import_id: importId,
        organization_id: input.organizationId,
        tournament_id: input.tournamentId,
        target_type: input.target,
        source_csv: input.sourceCsv,
        source_hash: sourceHash,
        status: 'queued',
        preview: null,
        created_by: input.actor,
        created_at: now,
        updated_at: now,
        reviewed_at: null,
        committed_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toSession(row);
  }

  async find(importId: string): Promise<CsvImportSession | undefined> {
    const row = await this.db
      .selectFrom('csv_import_sessions')
      .selectAll()
      .where('import_id', '=', importId)
      .executeTakeFirst();
    return row ? toSession(row) : undefined;
  }

  async markValidating(uow: UnitOfWork, importId: string): Promise<CsvImportSession | undefined> {
    const row = await uow.tx
      .updateTable('csv_import_sessions')
      .set({ status: 'validating', updated_at: new Date() })
      .where('import_id', '=', importId)
      .where('status', '=', 'queued')
      .returningAll()
      .executeTakeFirst();
    return row ? toSession(row) : undefined;
  }

  async storePreview(
    uow: UnitOfWork,
    input: { readonly importId: string; readonly preview: CsvImportPreview },
  ): Promise<CsvImportSession | undefined> {
    const now = new Date();
    const row = await uow.tx
      .updateTable('csv_import_sessions')
      .set({
        status: input.preview.valid ? 'review-ready' : 'invalid',
        preview: JSON.stringify(input.preview),
        updated_at: now,
        reviewed_at: now,
      })
      .where('import_id', '=', input.importId)
      .where('status', 'in', ['queued', 'validating'])
      .returningAll()
      .executeTakeFirst();
    return row ? toSession(row) : undefined;
  }

  async markCommitting(
    uow: UnitOfWork,
    input: { readonly importId: string; readonly sourceHash: string },
  ): Promise<CsvImportSession | undefined> {
    const row = await uow.tx
      .updateTable('csv_import_sessions')
      .set({ status: 'committing', updated_at: new Date() })
      .where('import_id', '=', input.importId)
      .where('source_hash', '=', input.sourceHash)
      .where('status', '=', 'review-ready')
      .returningAll()
      .executeTakeFirst();
    return row ? toSession(row) : undefined;
  }

  async markCommitted(uow: UnitOfWork, importId: string): Promise<CsvImportSession> {
    const now = new Date();
    const row = await uow.tx
      .updateTable('csv_import_sessions')
      .set({ status: 'committed', updated_at: now, committed_at: now })
      .where('import_id', '=', importId)
      .where('status', '=', 'committing')
      .returningAll()
      .executeTakeFirstOrThrow();
    return toSession(row);
  }
}

export function hashSource(source: string): string {
  return createHash('sha256').update(source).digest('hex');
}

function toSession(row: Selectable<Database['csv_import_sessions']>): CsvImportSession {
  return {
    importId: row.import_id,
    organizationId: row.organization_id,
    tournamentId: row.tournament_id,
    target: row.target_type as ParticipantImportTarget,
    sourceCsv: row.source_csv,
    sourceHash: row.source_hash,
    status: row.status as CsvImportStatus,
    ...(row.preview === null ? {} : { preview: row.preview as unknown as CsvImportPreview }),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.reviewed_at === null ? {} : { reviewedAt: row.reviewed_at }),
    ...(row.committed_at === null ? {} : { committedAt: row.committed_at }),
  };
}
