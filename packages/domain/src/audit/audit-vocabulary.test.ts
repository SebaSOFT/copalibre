import { AUDIT_ACTIONS, isAuditAction } from './audit-actions.js';

describe('audited action vocabulary', () => {
  it('is enumerable from one declaration', () => {
    expect(AUDIT_ACTIONS.length).toBeGreaterThan(0);
    expect(Array.isArray(AUDIT_ACTIONS)).toBe(true);
  });

  it('declares no duplicate action', () => {
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
  });

  it('recognises every declared action as valid', () => {
    for (const action of AUDIT_ACTIONS) {
      expect(isAuditAction(action)).toBe(true);
    }
  });

  it('rejects an action the vocabulary does not declare', () => {
    expect(isAuditAction('organization.renamed')).toBe(false);
    expect(isAuditAction('')).toBe(false);
  });

  it('declares the actions every repository call site currently records', () => {
    // A representative sample spanning every prefix group, not the full 96 —
    // the compile-time check (AuditEntry.action: AuditAction) is what proves
    // every actual call site's literal is declared; this locks the vocabulary
    // against accidental removal of well-known entries.
    const expected = [
      'organization.created',
      'club.created',
      'person.registered',
      'entrant.registered',
      'entrant.accepted',
      'tournament.created',
      'match.finalized',
      'match.start',
      'segment.active',
      'tag.applied',
      'schedule.published',
      'display-token.issued',
      'pat.revoked',
      'rule.evaluation-failed',
      'object.scan-failed',
    ] as const;
    for (const action of expected) {
      expect(AUDIT_ACTIONS as readonly string[]).toContain(action);
    }
  });
});
