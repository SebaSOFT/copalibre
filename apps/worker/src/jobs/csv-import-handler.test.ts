import { jest } from '@jest/globals';
import type { ClaimedJob, CsvImportSession } from '@copalibre/persistence';
import type { CsvImportPreview } from '@copalibre/domain';

const uow = { publishEvent: jest.fn<() => void>() };
const imports = {
  find: jest.fn<() => Promise<unknown>>(),
  markValidating: jest.fn<() => Promise<unknown>>(),
  storePreview: jest.fn<() => Promise<unknown>>(),
};
const tournaments = { findDescriptor: jest.fn<() => Promise<unknown>>() };
const validateCsvImport = jest.fn<() => unknown>();
const withTransaction = jest.fn(
  async (_db: unknown, callback: (transaction: typeof uow) => unknown) => callback(uow),
);

await jest.unstable_mockModule('@copalibre/persistence', () => ({
  CsvImportRepository: jest.fn(() => imports),
  TournamentRepository: jest.fn(() => tournaments),
  withTransaction,
}));
await jest.unstable_mockModule('@copalibre/domain', () => ({ validateCsvImport }));

const { CSV_IMPORT_VALIDATION_EVENT, csvImportValidationHandler } =
  await import('./csv-import-handler.js');

const db = {
  selectFrom: jest.fn<() => unknown>(),
};

function job(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    eventId: 'event-1',
    organizationId: 'org-1',
    stream: 'csv-import:import-1',
    entityId: 'import-1',
    eventType: CSV_IMPORT_VALIDATION_EVENT,
    projectionVersion: 1,
    payload: { importId: 'import-1' },
    createdAt: '2026-08-04T12:00:00.000Z',
    attempts: 1,
    claimedBy: 'worker-1',
    failures: [],
    ...overrides,
  };
}

function session(overrides: Partial<CsvImportSession> = {}): CsvImportSession {
  return {
    importId: 'import-1',
    organizationId: 'org-1',
    tournamentId: 'tournament-1',
    target: 'team',
    sourceCsv: 'alias,name\nclub-atletico,Club Atletico\n',
    sourceHash: 'source-hash',
    status: 'queued',
    createdBy: 'user:operator',
    createdAt: new Date('2026-08-04T12:00:00.000Z'),
    updatedAt: new Date('2026-08-04T12:00:00.000Z'),
    ...overrides,
  };
}

function configureTournament(
  row: { descriptor_id: string; descriptor_version: string } | undefined,
) {
  const executeTakeFirst = jest.fn<() => Promise<unknown>>().mockResolvedValue(row);
  const where = jest.fn<() => unknown>(() => ({ executeTakeFirst }));
  const select = jest.fn<() => unknown>(() => ({ where }));
  db.selectFrom.mockReturnValue({ select });
}

beforeEach(() => {
  jest.clearAllMocks();
  imports.find.mockResolvedValue(session());
  imports.markValidating.mockResolvedValue(session({ status: 'validating' }));
  imports.storePreview.mockResolvedValue(session({ status: 'review-ready' }));
  configureTournament({ descriptor_id: 'descriptor-1', descriptor_version: '1.0.0' });
  tournaments.findDescriptor.mockResolvedValue({ participantTypes: ['team'] });
  validateCsvImport.mockReturnValue({ target: 'team', valid: true, rows: [], errors: [] });
});

describe('CSV import validation handler', () => {
  it('ignores events owned by another handler', async () => {
    await csvImportValidationHandler({ db: db as never })(job({ eventType: 'match.finalized' }));

    expect(imports.find).not.toHaveBeenCalled();
  });

  it('rejects a validation event without an import identifier', async () => {
    await expect(
      csvImportValidationHandler({ db: db as never })(job({ payload: {} })),
    ).rejects.toThrow('CSV import validation job has no importId');
  });

  it.each([undefined, session({ status: 'review-ready' })])(
    'does not reprocess an unavailable or non-queued session',
    async (found) => {
      imports.find.mockResolvedValue(found);

      await csvImportValidationHandler({ db: db as never })(job());

      expect(imports.markValidating).not.toHaveBeenCalled();
    },
  );

  it('stops when another worker claimed the queued session first', async () => {
    imports.markValidating.mockResolvedValue(undefined);

    await csvImportValidationHandler({ db: db as never })(job());

    expect(validateCsvImport).not.toHaveBeenCalled();
    expect(imports.storePreview).not.toHaveBeenCalled();
  });

  it('stores a descriptor-validated preview and only publishes metadata', async () => {
    const preview: CsvImportPreview = {
      target: 'team',
      valid: false,
      rows: [
        {
          rowNumber: 2,
          values: { alias: 'club-atletico' },
          errors: [{ message: 'name is required' }],
        },
      ],
      errors: [],
    };
    validateCsvImport.mockReturnValue(preview);

    await csvImportValidationHandler({ db: db as never })(job());

    expect(validateCsvImport).toHaveBeenCalledWith({
      csv: 'alias,name\nclub-atletico,Club Atletico\n',
      target: 'team',
      allowedParticipantTypes: ['team'],
    });
    expect(imports.storePreview).toHaveBeenCalledWith(uow, { importId: 'import-1', preview });
    expect(uow.publishEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        eventType: 'csv-import.validation-completed',
        payload: {
          importId: 'import-1',
          status: 'review-ready',
          valid: false,
          rowCount: 1,
          invalidRowCount: 1,
        },
      }),
    );
  });

  it('stores an actionable preview when the active descriptor is unavailable', async () => {
    configureTournament(undefined);

    await csvImportValidationHandler({ db: db as never })(job());

    expect(validateCsvImport).not.toHaveBeenCalled();
    expect(imports.storePreview).toHaveBeenCalledWith(
      uow,
      expect.objectContaining({
        preview: {
          target: 'team',
          valid: false,
          rows: [],
          errors: [{ message: 'The active tournament discipline descriptor is unavailable' }],
        },
      }),
    );
  });
});
