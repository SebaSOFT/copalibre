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
import { defineMessages, type IntlShape } from 'react-intl';
import type { AuditRecordResponse } from './api-client.js';
import type { AuditLogItem } from '../components/ui/organisms/audit-log-panel.js';

// Common audit-diff field names, translated (openspec 0225 task 8.3, found
// by /impeccable critique): a correction's changed keys come from whatever
// entity the record touched, so this covers the frequent ones and
// `auditFieldLabel` below humanizes anything else from its own raw camelCase
// key rather than leaving it untranslated AND unreadable. Local rather than
// in `messages.en.ts` — see `LiveConsoleTemplate.tsx`'s identical note on
// why a local `defineMessages` block, not the shared catalogue, is the
// right home for an id with no locale translation yet.
const fieldMessages = defineMessages({
  score: { id: 'control.auditField.score', defaultMessage: 'Score' },
  startsAt: { id: 'control.auditField.startsAt', defaultMessage: 'Start time' },
  venueId: { id: 'control.auditField.venueId', defaultMessage: 'Venue' },
  name: { id: 'control.auditField.name', defaultMessage: 'Name' },
  status: { id: 'control.auditField.status', defaultMessage: 'Status' },
  winnerEntrantId: { id: 'control.auditField.winnerEntrantId', defaultMessage: 'Winner' },
  reason: { id: 'control.auditField.reason', defaultMessage: 'Reason' },
});

/**
 * A changed field's display label (openspec 0225 task 8.3, found by
 * `/impeccable critique`): a correction's field is any key the touched
 * entity declares, so this cannot be an exhaustive catalogue. A recognized
 * field resolves through the message catalogue; anything else is humanized
 * from its own camelCase name (`venueCapacity` → "Venue Capacity") rather
 * than shown as a raw API key, and stays unlocalized since no catalogue
 * entry exists for a field this function has never seen.
 */
export function auditFieldLabel(field: string, intl: IntlShape): string {
  const known = (fieldMessages as Record<string, (typeof fieldMessages)['score']>)[field];
  if (known) return intl.formatMessage(known);
  return field.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (char) => char.toUpperCase());
}

function formatResult(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const res = result as Record<string, unknown>;
  if (Array.isArray(res.sides) && res.sides.length > 0) {
    const scores = res.sides.map((side: unknown) => {
      if (side && typeof side === 'object') {
        const s = side as Record<string, unknown>;
        if (typeof s.score === 'number' || typeof s.score === 'string') return String(s.score);
        if (s.statistics && typeof s.statistics === 'object') {
          const stats = s.statistics as Record<string, unknown>;
          if (typeof stats.score === 'number' || typeof stats.score === 'string')
            return String(stats.score);
          if (typeof stats.points === 'number' || typeof stats.points === 'string')
            return String(stats.points);
          if (typeof stats.goals === 'number' || typeof stats.goals === 'string')
            return String(stats.goals);
        }
      }
      return '0';
    });
    return scores.join(' - ');
  }
  return null;
}

/** A scalar rendering that formats primitives and structured objects cleanly. */
function render(value: unknown): string {
  if (value === undefined) return '—';
  if (value === null) return 'null';
  if (typeof value === 'object') {
    const formattedResult = formatResult(value);
    if (formattedResult !== null) return formattedResult;
    if (Array.isArray(value)) {
      return value.map((item) => render(item)).join(', ');
    }
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return '{}';
    return entries
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(', ');
  }
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
