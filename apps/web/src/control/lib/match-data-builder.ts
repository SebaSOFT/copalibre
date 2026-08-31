import Papa from 'papaparse';
import type {
  BulkLoadEventInput,
  BulkLoadMatchDataRequest,
  BulkLoadRosterMemberInput,
  RosterCandidate,
} from './api-client.js';

/** One entrant's roster, as the screen's own local (pre-submit) draft state holds it. */
export interface RosterDraft {
  readonly entrantId: string;
  readonly members: readonly BulkLoadRosterMemberInput[];
}

/** One event, as the screen's own local (pre-submit) draft state holds it — `occurredAt` in epoch ms. */
export interface EventDraft {
  readonly definitionCode: string;
  readonly segmentNumber: number;
  readonly occurredAt: number;
  readonly side?: string;
  readonly personId?: string;
  readonly notes?: string;
}

export interface SegmentDraft {
  readonly type: string;
  readonly elapsedSeconds?: number;
}

/**
 * The one place a manual submission and a CSV import both converge on the
 * exact same `BulkLoadMatchDataRequest` shape (design.md: "an import is a
 * way to fill the form, not a way to bypass it"). No statistics UI —
 * mirrors `MatchConsoleRoute.finalize()`'s own submission, which already
 * sends `statistics: {}` per side and lets the server derive the rest from
 * the recorded events.
 */
export function buildBulkLoadRequest(input: {
  readonly rosters: readonly RosterDraft[];
  readonly segments: readonly SegmentDraft[];
  readonly events: readonly EventDraft[];
  readonly entrantIds: readonly string[];
  readonly winnerEntrantId?: string;
}): BulkLoadMatchDataRequest {
  return {
    rosters: input.rosters.filter((roster) => roster.members.length > 0),
    segments: input.segments.map((segment) => ({
      type: segment.type,
      ...(segment.elapsedSeconds === undefined ? {} : { elapsedSeconds: segment.elapsedSeconds }),
    })),
    events: input.events.map((event): BulkLoadEventInput => ({
      definitionCode: event.definitionCode,
      segmentNumber: event.segmentNumber,
      occurredAt: event.occurredAt,
      ...(event.side === undefined ? {} : { side: event.side }),
      ...(event.personId === undefined ? {} : { personId: event.personId }),
      ...(event.notes === undefined ? {} : { notes: event.notes }),
    })),
    result: {
      sides: input.entrantIds.map((entrantId) => ({ entrantId, statistics: {} })),
      ...(input.winnerEntrantId ? { winnerEntrantId: input.winnerEntrantId } : {}),
    },
  };
}

/**
 * Column shape for the CSV import (task 3.2). One flat table; `type`
 * discriminates which columns a row actually uses — documented here as the
 * single source `matchDataCsvTemplate` and `parseMatchDataCsv` both read
 * against, so the template downloaded by an operator and the parser reading
 * it back can never drift apart.
 */
export const MATCH_DATA_CSV_COLUMNS = [
  'type',
  'entrantId',
  'personName',
  'number',
  'roles',
  'onField',
  'segmentType',
  'elapsedSeconds',
  'definitionCode',
  'segmentNumber',
  'occurredAt',
  'side',
  'notes',
  'winnerEntrantId',
] as const;

export interface CsvRowError {
  readonly row: number;
  readonly message: string;
}

export type MatchDataCsvResult =
  | {
      readonly ok: true;
      readonly value: {
        readonly rosters: readonly RosterDraft[];
        readonly segments: readonly SegmentDraft[];
        readonly events: readonly EventDraft[];
        readonly winnerEntrantId?: string;
      };
    }
  | { readonly ok: false; readonly errors: readonly CsvRowError[] };

/**
 * Parses the CSV shape `MATCH_DATA_CSV_COLUMNS` documents into exactly the
 * structured submission the manual builder produces (design.md). A roster or
 * event row names a person by `personName`, not a raw id — resolved here
 * against that entrant's already-fetched roster candidates, the same list
 * the manual builder's roster step offers as checkboxes, so a spreadsheet
 * only ever needs names a registrar already recognizes.
 *
 * Every row is checked before any error is reported (task 3.4): a malformed
 * file reports every bad row, not the first one.
 */
export function parseMatchDataCsv(
  csvText: string,
  rosterCandidatesByEntrant: ReadonlyMap<string, readonly RosterCandidate[]>,
): MatchDataCsvResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length > 0) {
    return {
      ok: false,
      errors: parsed.errors.map((error) => ({
        row: (error.row ?? 0) + 2,
        message: error.message,
      })),
    };
  }
  const records = parsed.data;

  const errors: CsvRowError[] = [];
  const rostersByEntrant = new Map<string, BulkLoadRosterMemberInput[]>();
  const segments: SegmentDraft[] = [];
  const events: EventDraft[] = [];
  let winnerEntrantId: string | undefined;
  let segmentRowCount = 0;

  const resolvePersonId = (
    row: number,
    entrantId: string,
    personName: string,
  ): string | undefined => {
    const candidates = rosterCandidatesByEntrant.get(entrantId);
    if (!candidates) {
      errors.push({ row, message: `Unknown entrant "${entrantId}"` });
      return undefined;
    }
    const matches = candidates.filter(
      (candidate) => candidate.name.trim().toLowerCase() === personName.trim().toLowerCase(),
    );
    if (matches.length === 0) {
      errors.push({ row, message: `No registered candidate named "${personName}"` });
      return undefined;
    }
    if (matches.length > 1) {
      errors.push({ row, message: `"${personName}" matches more than one registered candidate` });
      return undefined;
    }
    return matches[0]?.personId;
  };

  records.forEach((record, index) => {
    const row = index + 2; // header is row 1
    const type = record.type?.trim();
    switch (type) {
      case 'roster': {
        const entrantId = record.entrantId?.trim();
        const personName = record.personName?.trim();
        if (!entrantId || !personName) {
          errors.push({ row, message: 'A roster row needs entrantId and personName' });
          return;
        }
        const personId = resolvePersonId(row, entrantId, personName);
        if (personId === undefined) return;
        const roles = record.roles?.trim();
        const number = record.number?.trim();
        const members = rostersByEntrant.get(entrantId) ?? [];
        members.push({
          personId,
          onField: record.onField?.trim().toLowerCase() === 'true',
          ...(number ? { number } : {}),
          ...(roles ? { roles: roles.split(';').map((role) => role.trim()) } : {}),
        });
        rostersByEntrant.set(entrantId, members);
        return;
      }
      case 'segment': {
        segmentRowCount += 1;
        const segmentType = record.segmentType?.trim();
        if (!segmentType) {
          errors.push({ row, message: 'A segment row needs segmentType' });
          return;
        }
        const elapsedSeconds = record.elapsedSeconds?.trim();
        segments.push({
          type: segmentType,
          ...(elapsedSeconds ? { elapsedSeconds: Number(elapsedSeconds) } : {}),
        });
        return;
      }
      case 'event': {
        const definitionCode = record.definitionCode?.trim();
        const segmentNumber = Number(record.segmentNumber?.trim());
        const occurredAtRaw = record.occurredAt?.trim();
        if (!definitionCode || !occurredAtRaw) {
          errors.push({ row, message: 'An event row needs definitionCode and occurredAt' });
          return;
        }
        if (!Number.isInteger(segmentNumber) || segmentNumber < 1) {
          errors.push({ row, message: `"${record.segmentNumber}" is not a valid segment number` });
          return;
        }
        const occurredAt = new Date(occurredAtRaw).getTime();
        if (Number.isNaN(occurredAt)) {
          errors.push({ row, message: `"${occurredAtRaw}" is not a valid date/time` });
          return;
        }
        const side = record.side?.trim();
        const personName = record.personName?.trim();
        const personId = personName && side ? resolvePersonId(row, side, personName) : undefined;
        if (personName && side && personId === undefined) return;
        const notes = record.notes?.trim();
        events.push({
          definitionCode,
          segmentNumber,
          occurredAt,
          ...(side ? { side } : {}),
          ...(personId ? { personId } : {}),
          ...(notes ? { notes } : {}),
        });
        return;
      }
      case 'result': {
        const value = record.winnerEntrantId?.trim();
        if (value) winnerEntrantId = value;
        return;
      }
      default:
        errors.push({
          row,
          message: `Unknown row type "${record.type ?? ''}" (expected roster, segment, event, or result)`,
        });
    }
  });

  events.forEach((event, index) => {
    if (event.segmentNumber > segmentRowCount) {
      errors.push({
        row: index,
        message: `Event "${event.definitionCode}" names segment ${event.segmentNumber}, but only ${segmentRowCount} segment row(s) were provided`,
      });
    }
  });

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      rosters: [...rostersByEntrant.entries()].map(([entrantId, members]) => ({
        entrantId,
        members,
      })),
      segments,
      events,
      ...(winnerEntrantId ? { winnerEntrantId } : {}),
    },
  };
}

/**
 * Builds a CSV string from partial row objects, explicitly aligned to
 * `MATCH_DATA_CSV_COLUMNS` (an array-of-arrays form, not array-of-objects —
 * `Papa.unparse` infers columns from the *first* object's own keys only,
 * which breaks the moment two rows use a different subset of columns, as
 * every row here does by row `type`). The one place that alignment logic
 * lives, reused by the template below and by every test fixture that needs
 * a well-formed CSV file.
 */
export function buildMatchDataCsv(
  rows: readonly Partial<Record<(typeof MATCH_DATA_CSV_COLUMNS)[number], string>>[],
): string {
  return Papa.unparse(
    {
      fields: [...MATCH_DATA_CSV_COLUMNS],
      data: rows.map((row) => MATCH_DATA_CSV_COLUMNS.map((column) => row[column] ?? '')),
    },
    { newline: '\n' },
  );
}

/** A downloadable template matching `MATCH_DATA_CSV_COLUMNS` exactly (task 3.7). */
export function matchDataCsvTemplate(): string {
  return buildMatchDataCsv([
    {
      type: 'roster',
      entrantId: 'ENTRANT_ID_HERE',
      personName: 'Player name, as registered',
      number: '10',
      roles: '',
      onField: 'true',
    },
    { type: 'segment', segmentType: 'half', elapsedSeconds: '2700' },
    {
      type: 'event',
      definitionCode: 'goal',
      segmentNumber: '1',
      occurredAt: '2025-03-15T15:32:00Z',
      side: 'ENTRANT_ID_HERE',
      personName: 'Player name, as registered',
      notes: '',
    },
    { type: 'result', winnerEntrantId: 'ENTRANT_ID_HERE' },
  ]);
}
