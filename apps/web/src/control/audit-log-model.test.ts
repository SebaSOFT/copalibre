import { describe, expect, it } from '@jest/globals';
import type { AuditRecordResponse } from './lib/api-client.js';
import { changedKeys, summarizeState, toAuditLogItem } from './lib/audit-log.js';

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
    expect(item.diff).toEqual({ previous: 'homeScore: 1', current: 'homeScore: 2' });
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
