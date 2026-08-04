import { parse } from 'csv-parse/sync';
import { Alias } from '../identifiers/alias.js';
import type { ParticipantType } from '../descriptors/discipline-descriptor.js';

export const MAX_CSV_IMPORT_BYTES = 4 * 1024 * 1024;

export type ParticipantImportTarget = ParticipantType;

export interface CsvImportError {
  readonly column?: string;
  readonly message: string;
}

export interface CsvImportPreviewRow {
  readonly rowNumber: number;
  readonly values: Readonly<Record<string, string>>;
  readonly errors: readonly CsvImportError[];
}

export interface CsvImportPreview {
  readonly target: ParticipantImportTarget;
  readonly valid: boolean;
  readonly rows: readonly CsvImportPreviewRow[];
  readonly errors: readonly CsvImportError[];
}

const INDIVIDUAL_COLUMNS = ['alias', 'displayName', 'naturalKeyKind', 'naturalKey'] as const;
const TEAM_COLUMNS = ['alias', 'name'] as const;
const ROSTER_COLUMNS = ['matchAlias', 'entrantAlias', 'playerAlias'] as const;

/**
 * Parses CopaLibre's deliberately small participant interchange. The worker
 * calls this pure function after resolving the active descriptor; controllers
 * only persist the source and enqueue the job.
 */
export function validateCsvImport(input: {
  readonly csv: string;
  readonly target: ParticipantImportTarget;
  readonly allowedParticipantTypes: readonly ParticipantType[];
}): CsvImportPreview {
  if (!input.allowedParticipantTypes.includes(input.target)) {
    return invalidPreview(
      input.target,
      `The active discipline does not accept ${input.target} participants`,
    );
  }

  let records: Record<string, string>[];
  try {
    records = parse(input.csv, {
      bom: true,
      columns: (header: string[]) => normaliseHeaders(header),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: false,
    }) as Record<string, string>[];
  } catch (error) {
    return invalidPreview(input.target, parseErrorMessage(error));
  }

  const headers = records[0] ? Object.keys(records[0]) : readHeaders(input.csv);
  if (ROSTER_COLUMNS.some((column) => headers.includes(column))) {
    return invalidPreview(
      input.target,
      'Roster columns are not accepted here; select a match roster in live match operations',
    );
  }

  const required = input.target === 'individual' ? INDIVIDUAL_COLUMNS : TEAM_COLUMNS;
  const missing = required.filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    return invalidPreview(input.target, `Missing required CSV column(s): ${missing.join(', ')}`);
  }

  const rows = records.map((values, index) => ({
    rowNumber: index + 2,
    values,
    errors: validateRow(input.target, values),
  }));
  return {
    target: input.target,
    valid: rows.every((row) => row.errors.length === 0),
    rows,
    errors: [],
  };
}

function normaliseHeaders(headers: string[]): string[] {
  return headers.map((header) => header.trim());
}

function readHeaders(csv: string): string[] {
  const [header = ''] = csv.replace(/^\uFEFF/, '').split(/\r?\n/, 1);
  return header.split(',').map((column) => column.trim());
}

function validateRow(
  target: ParticipantImportTarget,
  values: Readonly<Record<string, string>>,
): readonly CsvImportError[] {
  const errors: CsvImportError[] = [];
  const alias = values.alias?.trim();
  if (!alias) {
    errors.push({ column: 'alias', message: 'Alias is required' });
  } else if (!Alias.create('participant', alias).ok) {
    errors.push({ column: 'alias', message: 'Alias must be lowercase kebab-case' });
  }

  const nameColumn = target === 'individual' ? 'displayName' : 'name';
  if (!values[nameColumn]?.trim()) {
    errors.push({ column: nameColumn, message: `${nameColumn} is required` });
  }

  if (target === 'individual') {
    const kind = values.naturalKeyKind?.trim();
    const naturalKey = values.naturalKey?.trim();
    if ((kind && !naturalKey) || (!kind && naturalKey)) {
      errors.push({
        column: !kind ? 'naturalKeyKind' : 'naturalKey',
        message: 'naturalKeyKind and naturalKey must be supplied together',
      });
    }
  }
  return errors;
}

function invalidPreview(target: ParticipantImportTarget, message: string): CsvImportPreview {
  return { target, valid: false, rows: [], errors: [{ message }] };
}

function parseErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'lines' in error) {
    const lines = (error as { lines?: unknown }).lines;
    if (typeof lines === 'number') return `Malformed CSV near row ${lines}`;
  }
  return 'Malformed CSV; check quoting and column counts';
}
