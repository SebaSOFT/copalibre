import { isRefusal, type AuditRecord } from './audit.js';

const BASE: AuditRecord = {
  auditId: 'audit-1',
  organizationId: 'org-1',
  entityType: 'club',
  entityId: 'club-1',
  action: 'club.created',
  actor: 'user:1',
  authorizationContext: 'copalibre.control',
  occurredAt: '2026-08-29T00:00:00.000Z',
};

describe('isRefusal', () => {
  it('recognises a refusal: no resultingState, a reason present', () => {
    expect(isRefusal({ ...BASE, reason: 'blocked_after_results' })).toBe(true);
  });

  it('does not flag an applied change carrying a resultingState', () => {
    expect(isRefusal({ ...BASE, resultingState: { name: 'Talleres' } })).toBe(false);
  });

  it('does not flag a record with neither resultingState nor reason', () => {
    expect(isRefusal(BASE)).toBe(false);
  });
});
