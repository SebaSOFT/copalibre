import { describe, expect, it } from '@jest/globals';
import { createIntl, createIntlCache } from 'react-intl';
import type { AuditRecordResponse } from './lib/api-client.js';
import { auditFieldLabel, changedKeys, summarizeState, toAuditLogItem } from './lib/audit-log.js';

const intl = createIntl({ locale: 'en' }, createIntlCache());

const base: AuditRecordResponse = {
  auditId: '01936f4a-9001-7000-8000-000000000001',
  entityType: 'match',
  entityId: '01936f4a-1002-7000-8000-000000000002',
  action: 'SCORE_CORRECTION',
  actor: 'tournament_director',
  authorizationContext: 'organization:reference-league',
  outcome: 'applied',
  occurredAt: '2026-09-05T16:45:32.000Z',
};

describe('audit records as ledger entries', () => {
  it('reduces a correction to the fields that actually differ', () => {
    expect(changedKeys({ homeScore: 1, awayScore: 1 }, { homeScore: 2, awayScore: 1 })).toEqual([
      'homeScore',
    ]);
  });

  it('counts a field present on one side only as a difference', () => {
    expect(changedKeys({}, { reason: 'confirmed by the report' })).toEqual(['reason']);
  });

  it('keeps a zero and a false visible rather than reading them as absent', () => {
    expect(summarizeState({ awayScore: 0, disputed: false }, ['awayScore', 'disputed'])).toBe(
      'awayScore: 0, disputed: false',
    );
  });

  it('renders an absent field as an absence, not as the string undefined', () => {
    expect(summarizeState({}, ['homeScore'])).toBe('homeScore: —');
  });

  it('reads a record carrying both states as a correction', () => {
    const item = toAuditLogItem({
      ...base,
      previousState: { homeScore: 1 },
      resultingState: { homeScore: 2 },
    });
    expect(item.type).toBe('correction');
    expect(item.diff).toEqual([{ field: 'homeScore', previous: '1', current: '2' }]);
  });

  it('names each changed field as itself, one row per field — a reschedule is two rows, not one mislabelled row', () => {
    const item = toAuditLogItem({
      ...base,
      previousState: { startTime: '2026-09-05T18:00:00.000Z', venue: 'Court 1' },
      resultingState: { startTime: '2026-09-05T19:00:00.000Z', venue: 'Court 2' },
    });
    expect(item.diff).toEqual([
      {
        field: 'startTime',
        previous: '2026-09-05T18:00:00.000Z',
        current: '2026-09-05T19:00:00.000Z',
      },
      { field: 'venue', previous: 'Court 1', current: 'Court 2' },
    ]);
  });

  it('reads a record with no previous state as an ordinary entry', () => {
    const item = toAuditLogItem({ ...base, resultingState: { homeScore: 1 } });
    expect(item.type).toBe('standard');
    expect(item.diff).toBeUndefined();
  });

  it('draws no diff for a correction that changed nothing', () => {
    const item = toAuditLogItem({
      ...base,
      previousState: { homeScore: 1 },
      resultingState: { homeScore: 1 },
    });
    expect(item.diff).toBeUndefined();
  });

  it('carries the record’s own actor, action and time through unchanged', () => {
    const item = toAuditLogItem(base);
    expect(item.actor).toBe('tournament_director');
    expect(item.action).toBe('SCORE_CORRECTION');
    expect(item.timestamp).toBe('2026-09-05T16:45:32.000Z');
    expect(item.id).toBe(base.auditId);
  });
});

describe('auditFieldLabel', () => {
  it('resolves a recognized field through the message catalogue', () => {
    expect(auditFieldLabel('score', intl)).toBe('Score');
    expect(auditFieldLabel('venueId', intl)).toBe('Venue');
  });

  it('humanizes an unrecognized camelCase field rather than showing the raw key', () => {
    expect(auditFieldLabel('venueCapacity', intl)).toBe('Venue Capacity');
  });

  it('capitalizes an unrecognized single-word field', () => {
    expect(auditFieldLabel('capacity', intl)).toBe('Capacity');
  });
});
