import { ForbiddenException } from '@nestjs/common';
import { jest } from '@jest/globals';
import type { AuthenticatedSubject } from '../auth/request-context.js';
import {
  enforceMatchCommand,
  enforcePolicy,
  enforceReportSubmission,
  evaluateAdminControl,
  evaluateAuthenticatedInteraction,
  evaluateIntegration,
  evaluatePolicy,
  evaluatePublicRead,
} from './resource-policy.js';

function subject(overrides?: Partial<AuthenticatedSubject>): AuthenticatedSubject {
  return {
    subjectId: 'oidc-participant-1',
    participantPersonId: 'participant-1',
    organizationId: 'org-1',
    scopes: ['copalibre.participant'],
    ...overrides,
  };
}

describe('public-read plane', () => {
  it('allows without a subject', () => {
    expect(evaluatePublicRead()).toEqual({ allowed: true });
    expect(evaluatePolicy({ plane: 'public-read', resource: { organizationId: 'org-1' } })).toEqual(
      { allowed: true },
    );
  });
});

describe('authenticated-interaction plane (resource ownership)', () => {
  it('allows a participant acting on their own record', () => {
    const decision = evaluateAuthenticatedInteraction(subject(), {
      organizationId: 'org-1',
      ownerParticipantId: 'participant-1',
    });
    expect(decision.allowed).toBe(true);
  });

  it("denies a participant acting on another participant's record", () => {
    const decision = evaluateAuthenticatedInteraction(subject(), {
      organizationId: 'org-1',
      ownerParticipantId: 'participant-2',
    });
    expect(decision).toEqual({
      allowed: false,
      reason: 'subject may only act on their own records',
    });
  });

  it('does not treat an external OIDC subject as a participant identifier', () => {
    const decision = evaluateAuthenticatedInteraction(
      subject({ subjectId: 'participant-1', participantPersonId: 'participant-9' }),
      {
        organizationId: 'org-1',
        ownerParticipantId: 'participant-1',
      },
    );
    expect(decision).toEqual({
      allowed: false,
      reason: 'subject may only act on their own records',
    });
  });

  it('denies across organizations even for a matching participant id', () => {
    const decision = evaluateAuthenticatedInteraction(subject({ organizationId: 'org-9' }), {
      organizationId: 'org-1',
      ownerParticipantId: 'participant-1',
    });
    expect(decision.allowed).toBe(false);
  });

  it('denies a token with no organization scope', () => {
    const decision = evaluateAuthenticatedInteraction(subject({ organizationId: undefined }), {
      organizationId: 'org-1',
      ownerParticipantId: 'participant-1',
    });
    expect(decision.allowed).toBe(false);
  });

  it('denies operator-owned resources: they have no participant owner', () => {
    const decision = evaluateAuthenticatedInteraction(subject(), { organizationId: 'org-1' });
    expect(decision).toEqual({
      allowed: false,
      reason: 'resource has no participant owner; not reachable on this plane',
    });
  });
});

describe('admin-control plane', () => {
  const organizer = subject({ subjectId: 'organizer-1', scopes: ['copalibre.control'] });

  it('allows an organizer within their organization', () => {
    expect(evaluateAdminControl(organizer, { organizationId: 'org-1' }).allowed).toBe(true);
  });

  it('denies an organizer from another organization', () => {
    expect(evaluateAdminControl(organizer, { organizationId: 'org-2' }).allowed).toBe(false);
  });

  it('denies a token with no organization claim', () => {
    expect(
      evaluateAdminControl(subject({ organizationId: undefined }), { organizationId: 'org-1' })
        .allowed,
    ).toBe(false);
  });

  it('denies an unconfirmed destructive action', () => {
    const decision = evaluateAdminControl(
      organizer,
      { organizationId: 'org-1' },
      { destructive: true },
    );
    expect(decision).toEqual({
      allowed: false,
      reason: 'destructive action requires explicit confirmation',
    });
  });

  it('allows a confirmed destructive action', () => {
    const decision = evaluateAdminControl(
      organizer,
      { organizationId: 'org-1' },
      { destructive: true, confirmed: true },
    );
    expect(decision.allowed).toBe(true);
  });

  it('ignores the confirmation flag for non-destructive actions', () => {
    expect(
      evaluateAdminControl(organizer, { organizationId: 'org-1' }, { destructive: false }).allowed,
    ).toBe(true);
  });
});

describe('integration plane', () => {
  const client = subject({
    subjectId: 'client-1',
    scopes: ['copalibre.integration', 'webhooks.write'],
  });

  it('allows an org-scoped client holding the required scopes', () => {
    expect(
      evaluateIntegration(client, { organizationId: 'org-1' }, ['webhooks.write']).allowed,
    ).toBe(true);
  });

  it('denies a client missing a narrow scope', () => {
    const decision = evaluateIntegration(client, { organizationId: 'org-1' }, ['exports.read']);
    expect(decision).toEqual({
      allowed: false,
      reason: 'integration token lacks scope: exports.read',
    });
  });

  it('denies a client scoped to another organization', () => {
    expect(evaluateIntegration(client, { organizationId: 'org-2' }).allowed).toBe(false);
  });

  it('allows when no extra scopes are demanded', () => {
    expect(evaluateIntegration(client, { organizationId: 'org-1' }).allowed).toBe(true);
  });
});

describe('evaluatePolicy dispatch', () => {
  it('denies any authenticated plane reached without a verified subject', () => {
    for (const plane of ['authenticated-interaction', 'admin-control', 'integration'] as const) {
      expect(evaluatePolicy({ plane, resource: { organizationId: 'org-1' } })).toEqual({
        allowed: false,
        reason: 'authenticated plane reached without a verified subject',
      });
    }
  });

  it('routes each plane to its own evaluator', () => {
    expect(
      evaluatePolicy({
        plane: 'authenticated-interaction',
        subject: subject(),
        resource: { organizationId: 'org-1', ownerParticipantId: 'participant-1' },
      }).allowed,
    ).toBe(true);

    expect(
      evaluatePolicy({
        plane: 'admin-control',
        subject: subject({ scopes: ['copalibre.control'] }),
        resource: { organizationId: 'org-1' },
        destructive: true,
      }).allowed,
    ).toBe(false);

    expect(
      evaluatePolicy({
        plane: 'integration',
        subject: subject({ scopes: ['copalibre.integration'] }),
        resource: { organizationId: 'org-1' },
        requiredScopes: ['nope'],
      }).allowed,
    ).toBe(false);
  });
});

describe('enforcePolicy', () => {
  it('throws 403 on denial, never 401 — authentication already succeeded', () => {
    expect(() =>
      enforcePolicy({
        plane: 'authenticated-interaction',
        subject: subject(),
        resource: { organizationId: 'org-1', ownerParticipantId: 'someone-else' },
      }),
    ).toThrow(ForbiddenException);
  });

  it('returns quietly when allowed', () => {
    expect(() =>
      enforcePolicy({ plane: 'public-read', resource: { organizationId: 'org-1' } }),
    ).not.toThrow();
  });

  it('surfaces the denial reason in the 403 message', () => {
    try {
      enforcePolicy({
        plane: 'admin-control',
        subject: subject({ scopes: ['copalibre.control'] }),
        resource: { organizationId: 'org-1' },
        destructive: true,
      });
      throw new Error('expected a ForbiddenException');
    } catch (error) {
      expect((error as ForbiddenException).message).toMatch(/explicit confirmation/);
    }
  });
});

describe('hasScope helper', () => {
  it('reports scope presence and absence', async () => {
    const { hasScope } = await import('../auth/request-context.js');
    const s = subject({ scopes: ['a', 'b'] });
    expect(hasScope(s, 'a')).toBe(true);
    expect(hasScope(s, 'c')).toBe(false);
  });
});

describe('enforceReportSubmission', () => {
  const participant = subject();

  it('allows a participant who is a party to the match, and returns their person id', async () => {
    const isPartyToMatch = jest
      .fn<(organizationId: string, personId: string, matchId: string) => Promise<boolean>>()
      .mockResolvedValue(true);
    await expect(
      enforceReportSubmission({
        subject: participant,
        organizationId: 'org-1',
        matchId: 'm-1',
        isPartyToMatch,
      }),
    ).resolves.toBe('participant-1');
    expect(isPartyToMatch).toHaveBeenCalledWith('org-1', 'participant-1', 'm-1');
  });

  it('refuses a match the participant is not a party to (4.2)', async () => {
    const isPartyToMatch = jest
      .fn<(organizationId: string, personId: string, matchId: string) => Promise<boolean>>()
      .mockResolvedValue(false);
    await expect(
      enforceReportSubmission({
        subject: participant,
        organizationId: 'org-1',
        matchId: 'm-1',
        isPartyToMatch,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses across organizations before ever checking match membership', async () => {
    const isPartyToMatch = jest
      .fn<(organizationId: string, personId: string, matchId: string) => Promise<boolean>>()
      .mockResolvedValue(true);
    await expect(
      enforceReportSubmission({
        subject: subject({ organizationId: 'org-9' }),
        organizationId: 'org-1',
        matchId: 'm-1',
        isPartyToMatch,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(isPartyToMatch).not.toHaveBeenCalled();
  });

  it('refuses a non-participant (operator) subject with no participant person id', async () => {
    const isPartyToMatch = jest
      .fn<(organizationId: string, personId: string, matchId: string) => Promise<boolean>>()
      .mockResolvedValue(true);
    await expect(
      enforceReportSubmission({
        subject: {
          subjectId: 'organizer-1',
          organizationId: 'org-1',
          scopes: ['copalibre.control'],
        },
        organizationId: 'org-1',
        matchId: 'm-1',
        isPartyToMatch,
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(isPartyToMatch).not.toHaveBeenCalled();
  });

  it('refuses with no subject at all', async () => {
    await expect(
      enforceReportSubmission({
        organizationId: 'org-1',
        matchId: 'm-1',
        isPartyToMatch:
          jest.fn<
            (organizationId: string, personId: string, matchId: string) => Promise<boolean>
          >(),
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('enforceMatchCommand', () => {
  const match = { organizationId: 'org-1', matchId: 'm-1', stageId: 'st-1' } as const;
  const official: AuthenticatedSubject = {
    subjectId: 'user:referee-1',
    organizationId: 'org-1',
    scopes: [],
  };
  const appointment = {
    assignmentId: 'a-1',
    organizationId: 'org-1',
    subjectId: 'user:referee-1',
    scope: { kind: 'match', matchId: 'm-1' },
    capabilities: ['match.record-event'],
  } as const;

  function attempt(overrides: Record<string, unknown> = {}) {
    return () =>
      enforceMatchCommand({
        plane: 'admin-control',
        subject: official,
        resource: { organizationId: 'org-1' },
        assignments: [appointment],
        capability: 'match.record-event',
        match,
        ...overrides,
      });
  }

  it('allows a command the appointment names, and reports which one granted it', () => {
    expect(attempt()()).toEqual({ capability: 'match.record-event', grantedBy: 'a-1' });
  });

  it('refuses a capability the appointment does not name', () => {
    expect(attempt({ capability: 'match.finalize' })).toThrow(ForbiddenException);
  });

  it('refuses another match, so an appointment cannot leak across the fixture list', () => {
    expect(attempt({ match: { ...match, matchId: 'm-2' } })).toThrow(ForbiddenException);
  });

  it('refuses an organizer who was never appointed, whatever their org role', () => {
    expect(attempt({ assignments: [] })).toThrow(ForbiddenException);
  });

  it('refuses before the capability check when the subject is not in the organization', () => {
    expect(attempt({ subject: { ...official, organizationId: 'org-2' } })).toThrow(
      ForbiddenException,
    );
  });
});
