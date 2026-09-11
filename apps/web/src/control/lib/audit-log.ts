/**
 * Audit records, as ledger entries.
 *
 * The record carries whole states; a reader wants the change. So this reduces
 * the pair to the fields that actually differ — a correction that moved one
 * score reads as one line, not as two dumps of an object with a digit
 * different somewhere in the middle.
 *
 * It adds nothing and hides nothing else: a field present in one state and
 * absent from the other is a difference and appears as such, and a record with
 * no previous state is not a correction and is not presented as one.
 */
import type { AuditRecordResponse } from './api-client.js';
import type { AuditLogItem } from '../components/ui/organisms/audit-log-panel.js';

/** A scalar rendering that keeps a `0` and a `false` visible. */
function render(value: unknown): string {
  if (value === undefined) return '—';
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** The keys whose values differ between the two states, in a stable order. */
export function changedKeys(
  previous: Readonly<Record<string, unknown>>,
  resulting: Readonly<Record<string, unknown>>,
): readonly string[] {
  return [...new Set([...Object.keys(previous), ...Object.keys(resulting)])]
    .filter((key) => render(previous[key]) !== render(resulting[key]))
    .sort();
}

/** One state, reduced to the keys that changed. */
export function summarizeState(
  state: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): string {
  return keys.map((key) => `${key}: ${render(state[key])}`).join(', ');
}

export function toAuditLogItem(record: AuditRecordResponse): AuditLogItem {
  const previous = record.previousState;
  const resulting = record.resultingState;
  const isCorrection = previous !== undefined && resulting !== undefined;
  const keys = isCorrection ? changedKeys(previous, resulting) : [];

  return {
    id: record.auditId,
    type: isCorrection ? 'correction' : 'standard',
    timestamp: record.occurredAt,
    actor: record.actor,
    action: record.action,
    // A "correction" that changed nothing is not a diff worth drawing. One
    // row per field, named for itself — a reschedule that moved a start time
    // and a venue is two rows, "startTime" and "venue", never one row
    // labelled for a field that did not change.
    ...(isCorrection && keys.length > 0
      ? {
          diff: keys.map((field) => ({
            field,
            previous: render(previous[field]),
            current: render(resulting[field]),
          })),
        }
      : {}),
  };
}
