import {
  canCreateOrganizationInvitation,
  normaliseEmail,
  validateOrganizationInvitation,
} from './organization-access.js';

describe('organization access', () => {
  it('requires the first organization invitation to assign admin', () => {
    const rejected = canCreateOrganizationInvitation(0, 'viewer');
    expect(rejected.ok).toBe(false);

    expect(canCreateOrganizationInvitation(0, 'admin')).toEqual({ ok: true, value: true });
    expect(canCreateOrganizationInvitation(1, 'viewer')).toEqual({ ok: true, value: true });
  });

  it('normalises and validates an invitation recipient', () => {
    expect(normaliseEmail(' Admin@Liga.Example ')).toBe('admin@liga.example');
    expect(
      validateOrganizationInvitation({
        invitationId: 'invite-1',
        organizationId: 'org-1',
        recipientEmail: ' Admin@Liga.Example ',
        role: 'admin',
        status: 'active',
        expiresAt: '2026-08-10T00:00:00.000Z',
      }),
    ).toEqual({
      ok: true,
      value: {
        invitationId: 'invite-1',
        organizationId: 'org-1',
        recipientEmail: 'admin@liga.example',
        role: 'admin',
        status: 'active',
        expiresAt: '2026-08-10T00:00:00.000Z',
      },
    });
  });
});
