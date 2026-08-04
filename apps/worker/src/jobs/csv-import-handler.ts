import {
  CsvImportRepository,
  TournamentRepository,
  withTransaction,
  type ClaimedJob,
  type Database,
} from '@copalibre/persistence';
import { validateCsvImport, type CsvImportPreview } from '@copalibre/domain';
import type { Kysely } from 'kysely';
import type { JobHandler } from './dispatcher.js';
import { payloadOf } from './relay-runner.js';

export const CSV_IMPORT_VALIDATION_EVENT = 'csv-import.validation-requested';

/** Validates persisted sources after the outbox relay has durably accepted the job. */
export function csvImportValidationHandler(input: { readonly db: Kysely<Database> }): JobHandler {
  const imports = new CsvImportRepository(input.db);
  const tournaments = new TournamentRepository(input.db);

  return async (job: ClaimedJob): Promise<void> => {
    if (job.eventType !== CSV_IMPORT_VALIDATION_EVENT) return;
    const { importId } = payloadOf<{ importId?: unknown }>(job);
    if (typeof importId !== 'string') throw new Error('CSV import validation job has no importId');

    const session = await imports.find(importId);
    if (!session || session.status !== 'queued') return;

    const started = await withTransaction(input.db, async (uow) => {
      const updated = await imports.markValidating(uow, importId);
      if (!updated) return undefined;
      await uow.publishEvent({
        organizationId: updated.organizationId,
        stream: `csv-import:${updated.importId}`,
        entityId: updated.importId,
        eventType: 'csv-import.validation-started',
        projectionVersion: 1,
        payload: { importId: updated.importId, status: updated.status },
      });
      return updated;
    });
    if (!started) return;

    const tournament = await input.db
      .selectFrom('tournaments')
      .select(['descriptor_id', 'descriptor_version'])
      .where('tournament_id', '=', started.tournamentId)
      .executeTakeFirst();
    const descriptor = tournament
      ? await tournaments.findDescriptor(tournament.descriptor_id, tournament.descriptor_version)
      : undefined;
    const preview = descriptor
      ? validateCsvImport({
          csv: started.sourceCsv,
          target: started.target,
          allowedParticipantTypes: descriptor.participantTypes,
        })
      : unavailableDescriptorPreview(started.target);

    await withTransaction(input.db, async (uow) => {
      const updated = await imports.storePreview(uow, { importId, preview });
      if (!updated) return;
      await uow.publishEvent({
        organizationId: updated.organizationId,
        stream: `csv-import:${updated.importId}`,
        entityId: updated.importId,
        eventType: 'csv-import.validation-completed',
        projectionVersion: 1,
        payload: {
          importId: updated.importId,
          status: updated.status,
          valid: preview.valid,
          rowCount: preview.rows.length,
          invalidRowCount: preview.rows.filter((row) => row.errors.length > 0).length,
        },
      });
    });
  };
}

function unavailableDescriptorPreview(target: 'individual' | 'team'): CsvImportPreview {
  return {
    target,
    valid: false,
    rows: [],
    errors: [{ message: 'The active tournament discipline descriptor is unavailable' }],
  };
}
