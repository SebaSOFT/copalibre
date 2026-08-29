import {
  canCreateOrganizationInvitation,
  canGrantRole,
  isClubScopedRole,
  isTournamentScopedRole,
  normaliseEmail,
  validateOrganizationInvitation,
  wouldLeaveInstallationWithoutSuperAdmin,
  wouldLeaveOrganizationWithoutAdmin,
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

  describe('canGrantRole', () => {
    it('lets a super-admin grant super-admin or any organization role', () => {
      const superAdmin = { isSuperAdmin: true };
      expect(canGrantRole(superAdmin, 'super-admin').ok).toBe(true);
      expect(canGrantRole(superAdmin, 'admin').ok).toBe(true);
      expect(canGrantRole(superAdmin, 'club-admin').ok).toBe(true);
      expect(canGrantRole(superAdmin, 'referee').ok).toBe(true);
      expect(canGrantRole(superAdmin, 'broadcaster').ok).toBe(true);
      expect(canGrantRole(superAdmin, 'viewer').ok).toBe(true);
    });

    it('lets an organization admin grant any organization role within their own organization', () => {
      const orgAdmin = { isSuperAdmin: false, organizationAdminOf: 'org-1' };
      expect(canGrantRole(orgAdmin, 'admin', 'org-1').ok).toBe(true);
      expect(canGrantRole(orgAdmin, 'club-admin', 'org-1').ok).toBe(true);
      expect(canGrantRole(orgAdmin, 'referee', 'org-1').ok).toBe(true);
      expect(canGrantRole(orgAdmin, 'broadcaster', 'org-1').ok).toBe(true);
      expect(canGrantRole(orgAdmin, 'viewer', 'org-1').ok).toBe(true);
    });

    it('refuses an organization admin granting super-admin', () => {
      const orgAdmin = { isSuperAdmin: false, organizationAdminOf: 'org-1' };
      expect(canGrantRole(orgAdmin, 'super-admin', 'org-1').ok).toBe(false);
    });

    it("refuses an organization admin's grant crossing into another organization", () => {
      const orgAdmin = { isSuperAdmin: false, organizationAdminOf: 'org-1' };
      expect(canGrantRole(orgAdmin, 'admin', 'org-2').ok).toBe(false);
    });

    it('refuses a club-admin or referee (no organizationAdminOf, not super-admin) any grant', () => {
      const noAuthority = { isSuperAdmin: false };
      expect(canGrantRole(noAuthority, 'referee', 'org-1').ok).toBe(false);
      expect(canGrantRole(noAuthority, 'club-admin', 'org-1').ok).toBe(false);
    });
  });

  describe('wouldLeaveOrganizationWithoutAdmin', () => {
    it('is true only when the remaining count would be zero', () => {
      expect(wouldLeaveOrganizationWithoutAdmin(0)).toBe(true);
      expect(wouldLeaveOrganizationWithoutAdmin(1)).toBe(false);
      expect(wouldLeaveOrganizationWithoutAdmin(2)).toBe(false);
    });
  });

  describe('wouldLeaveInstallationWithoutSuperAdmin', () => {
    it('is true only when the remaining count would be zero', () => {
      expect(wouldLeaveInstallationWithoutSuperAdmin(0)).toBe(true);
      expect(wouldLeaveInstallationWithoutSuperAdmin(1)).toBe(false);
      expect(wouldLeaveInstallationWithoutSuperAdmin(2)).toBe(false);
    });
  });

  describe('isTournamentScopedRole', () => {
    it('is true only for tournament-admin', () => {
      expect(isTournamentScopedRole('tournament-admin')).toBe(true);
      expect(isTournamentScopedRole('admin')).toBe(false);
      expect(isTournamentScopedRole('club-admin')).toBe(false);
      expect(isTournamentScopedRole('referee')).toBe(false);
      expect(isTournamentScopedRole('broadcaster')).toBe(false);
      expect(isTournamentScopedRole('viewer')).toBe(false);
    });
  });

  describe('validateOrganizationInvitation tournament scoping', () => {
    const base = {
      invitationId: 'invite-1',
      organizationId: 'org-1',
      recipientEmail: 'admin@liga.example',
      status: 'active' as const,
      expiresAt: '2026-08-10T00:00:00.000Z',
    };

    it('requires a tournamentId when the role is tournament-scoped', () => {
      const rejected = validateOrganizationInvitation({
        ...base,
        role: 'tournament-admin',
      });
      expect(rejected.ok).toBe(false);
    });

    it('accepts a tournament-admin invitation naming a tournament', () => {
      const accepted = validateOrganizationInvitation({
        ...base,
        role: 'tournament-admin',
        tournamentId: 'tournament-1',
      });
      expect(accepted).toEqual({
        ok: true,
        value: { ...base, role: 'tournament-admin', tournamentId: 'tournament-1' },
      });
    });

    it('refuses a tournamentId on a non-tournament-scoped role', () => {
      const rejected = validateOrganizationInvitation({
        ...base,
        role: 'admin',
        tournamentId: 'tournament-1',
      });
      expect(rejected.ok).toBe(false);
    });
  });

  describe('isClubScopedRole', () => {
    it('is true only for club-admin', () => {
      expect(isClubScopedRole('club-admin')).toBe(true);
      expect(isClubScopedRole('admin')).toBe(false);
      expect(isClubScopedRole('tournament-admin')).toBe(false);
      expect(isClubScopedRole('referee')).toBe(false);
      expect(isClubScopedRole('broadcaster')).toBe(false);
      expect(isClubScopedRole('viewer')).toBe(false);
    });
  });

  describe('validateOrganizationInvitation club scoping', () => {
    const base = {
      invitationId: 'invite-1',
      organizationId: 'org-1',
      recipientEmail: 'admin@liga.example',
      status: 'active' as const,
      expiresAt: '2026-08-10T00:00:00.000Z',
    };

    it('requires a clubId when the role is club-scoped', () => {
      const rejected = validateOrganizationInvitation({ ...base, role: 'club-admin' });
      expect(rejected.ok).toBe(false);
    });

    it('accepts a club-admin invitation naming a club', () => {
      const accepted = validateOrganizationInvitation({
        ...base,
        role: 'club-admin',
        clubId: 'club-1',
      });
      expect(accepted).toEqual({
        ok: true,
        value: { ...base, role: 'club-admin', clubId: 'club-1' },
      });
    });

    it('refuses a clubId on a non-club-scoped role', () => {
      const rejected = validateOrganizationInvitation({
        ...base,
        role: 'admin',
        clubId: 'club-1',
      });
      expect(rejected.ok).toBe(false);
    });
  });
});
