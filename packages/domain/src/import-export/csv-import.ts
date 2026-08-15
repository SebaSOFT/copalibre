import { parse } from 'csv-parse/sync';
import { Alias } from '../identifiers/alias.js';
import type { ParticipantType } from '../descriptors/discipline-descriptor.js';

export const MAX_CSV_IMPORT_BYTES = 4 * 1024 * 1024;

export type ParticipantImportTarget = ParticipantType;

/**
 * `team-membership` attaches CSV rows' people onto an already-
 * registered team's persistent membership — it does not register a new
 * entrant, so it is deliberately not folded into `ParticipantType`: that type
 * gates which entrant *kinds* a discipline accepts, an axis this target has
 * nothing to do with (see design.md, "Type: a new `CsvImportTarget` union").
 */
export type CsvImportTarget = ParticipantImportTarget | 'team-membership';

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
  readonly target: CsvImportTarget;
  readonly valid: boolean;
  readonly rows: readonly CsvImportPreviewRow[];
  readonly errors: readonly CsvImportError[];
}

const INDIVIDUAL_COLUMNS = ['alias', 'displayName', 'naturalKeyKind', 'naturalKey'] as const;
const TEAM_COLUMNS = ['alias', 'name'] as const;
const TEAM_MEMBERSHIP_COLUMNS = ['teamAlias', 'alias', 'displayName'] as const;
const ROSTER_COLUMNS = ['matchAlias', 'entrantAlias', 'playerAlias'] as const;

/**
 * Parses CopaLibre's deliberately small participant interchange. The worker
 * calls this pure function after resolving the active descriptor; controllers
 * only persist the source and enqueue the job.
 *
 * `knownTeamAliases` is meaningful only for `target: 'team-membership'`: the
 * worker resolves it from the tournament's already-registered team entrants
 * before calling this function, so a row naming an unregistered team
 * fails here, in the reviewed preview, rather than silently at commit.
 */
export function validateCsvImport(input: {
  readonly csv: string;
  readonly target: CsvImportTarget;
  readonly allowedParticipantTypes: readonly ParticipantType[];
  readonly knownTeamAliases?: readonly string[];
}): CsvImportPreview {
  if (input.target !== 'team-membership' && !input.allowedParticipantTypes.includes(input.target)) {
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

  const required =
    input.target === 'individual'
      ? INDIVIDUAL_COLUMNS
      : input.target === 'team-membership'
        ? TEAM_MEMBERSHIP_COLUMNS
        : TEAM_COLUMNS;
  const missing = required.filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    return invalidPreview(input.target, `Missing required CSV column(s): ${missing.join(', ')}`);
  }

  const knownTeamAliases = input.knownTeamAliases ?? [];
  const rows = records.map((values, index) => ({
    rowNumber: index + 2,
    values,
    errors: validateRow(input.target, values, knownTeamAliases),
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
  target: CsvImportTarget,
  values: Readonly<Record<string, string>>,
  knownTeamAliases: readonly string[],
): readonly CsvImportError[] {
  const errors: CsvImportError[] = [];
  const alias = values.alias?.trim();
  if (!alias) {
    errors.push({ column: 'alias', message: 'Alias is required' });
  } else if (!Alias.create('participant', alias).ok) {
    errors.push({ column: 'alias', message: 'Alias must be lowercase kebab-case' });
  }

  const nameColumn = target === 'team' ? 'name' : 'displayName';
  if (!values[nameColumn]?.trim()) {
    errors.push({ column: nameColumn, message: `${nameColumn} is required` });
  }

  if (target === 'individual' || target === 'team-membership') {
    const kind = values.naturalKeyKind?.trim();
    const naturalKey = values.naturalKey?.trim();
    if ((kind && !naturalKey) || (!kind && naturalKey)) {
      errors.push({
        column: !kind ? 'naturalKeyKind' : 'naturalKey',
        message: 'naturalKeyKind and naturalKey must be supplied together',
      });
    }
  }

  if (target === 'team-membership') {
    const teamAlias = values.teamAlias?.trim();
    if (!teamAlias) {
      errors.push({ column: 'teamAlias', message: 'teamAlias is required' });
    } else if (!Alias.create('participant', teamAlias).ok) {
      errors.push({ column: 'teamAlias', message: 'teamAlias must be lowercase kebab-case' });
    } else if (!knownTeamAliases.includes(teamAlias)) {
      errors.push({
        column: 'teamAlias',
        message: `No team registered as an entrant in this tournament has alias "${teamAlias}"`,
      });
    }
  }
  return errors;
}

function invalidPreview(target: CsvImportTarget, message: string): CsvImportPreview {
  return { target, valid: false, rows: [], errors: [{ message }] };
}

function parseErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'lines' in error) {
    const lines = (error as { lines?: unknown }).lines;
    if (typeof lines === 'number') return `Malformed CSV near row ${lines}`;
  }
  return 'Malformed CSV; check quoting and column counts';
}
