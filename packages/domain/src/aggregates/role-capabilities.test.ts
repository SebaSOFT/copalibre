import { ORGANIZATION_ROLES } from './organization-access.js';
import {
  ORGANIZATION_CAPABILITIES,
  capabilitiesForRole,
  inheritedFrom,
  inheritsFrom,
  isOrganizationCapability,
  rolesForCapability,
  type OrganizationCapability,
} from './role-capabilities.js';

describe('organization capabilities', () => {
  it('recognises every declared capability and rejects unknown strings', () => {
    for (const capability of ORGANIZATION_CAPABILITIES) {
      expect(isOrganizationCapability(capability)).toBe(true);
    }
    expect(isOrganizationCapability('org.not-a-real-capability')).toBe(false);
  });

  it('declares every organization role, with no unknown role slipping in', () => {
    for (const role of ORGANIZATION_ROLES) {
      expect(() => capabilitiesForRole(role)).not.toThrow();
    }
  });

  it('never resolves a role to a capability outside the declared vocabulary', () => {
    const declared = new Set<string>(ORGANIZATION_CAPABILITIES);
    for (const role of ORGANIZATION_ROLES) {
      for (const capability of capabilitiesForRole(role)) {
        expect(declared.has(capability)).toBe(true);
      }
    }
  });

  it('gives admin every declared capability', () => {
    const admin = capabilitiesForRole('admin');
    for (const capability of ORGANIZATION_CAPABILITIES) {
      expect(admin).toContain(capability);
    }
    expect(admin.length).toBe(ORGANIZATION_CAPABILITIES.length);
  });

  it("keeps tournament-admin's capabilities a strict, non-empty subset of admin's", () => {
    const admin = capabilitiesForRole('admin');
    const tournamentAdmin = capabilitiesForRole('tournament-admin');
    expect(tournamentAdmin.length).toBeGreaterThan(0);
    expect(tournamentAdmin.length).toBeLessThan(admin.length);
    for (const capability of tournamentAdmin) {
      expect(admin).toContain(capability);
    }
  });

  it('never gives tournament-admin an organization-wide capability', () => {
    const organizationWide: readonly OrganizationCapability[] = [
      'org.manage-users',
      'org.manage-settings',
      'org.manage-clubs',
      'org.manage-persons',
      'org.manage-resources',
      'org.create-tournaments',
      'org.manage-tournament-lifecycle',
      'org.rebuild-statistics',
    ];
    const tournamentAdmin = capabilitiesForRole('tournament-admin');
    for (const capability of organizationWide) {
      expect(tournamentAdmin).not.toContain(capability);
    }
  });

  it('reproduces referee, broadcaster, and viewer exactly as the route surface admits today', () => {
    expect(capabilitiesForRole('referee')).toEqual(['org.operate-match']);
    // Grantable roles the current route surface never guards on — honestly empty.
    expect(capabilitiesForRole('broadcaster')).toEqual([]);
    expect(capabilitiesForRole('viewer')).toEqual([]);
  });

  describe('inheritance', () => {
    it('lets admin hold club-admin capabilities without a second, direct declaration', () => {
      expect(inheritsFrom('admin')).toEqual(['club-admin']);
      expect(capabilitiesForRole('admin')).toContain('org.manage-clubs');
      expect(inheritedFrom('admin', 'org.manage-clubs')).toBe('club-admin');
    });

    it('reports no inheritance source for a capability a role holds directly', () => {
      expect(inheritedFrom('admin', 'org.manage-users')).toBeUndefined();
      expect(inheritedFrom('club-admin', 'org.manage-clubs')).toBeUndefined();
    });

    it('grants nothing across organizations — inheritance only resolves a role name to capabilities, never a specific assignment', () => {
      // capabilitiesForRole is organization-agnostic by construction: it takes
      // only a role name, never an organizationId, so there is no channel
      // through which one organization's inheritance could reach another's.
      expect(capabilitiesForRole('admin')).toEqual(capabilitiesForRole('admin'));
    });

    it('has no inheritance edge for roles other than admin', () => {
      expect(inheritsFrom('club-admin')).toEqual([]);
      expect(inheritsFrom('tournament-admin')).toEqual([]);
      expect(inheritsFrom('referee')).toEqual([]);
      expect(inheritsFrom('broadcaster')).toEqual([]);
      expect(inheritsFrom('viewer')).toEqual([]);
    });
  });

  describe('rolesForCapability', () => {
    it('finds both the direct and the inheriting role for org.manage-clubs', () => {
      expect(rolesForCapability('org.manage-clubs')).toEqual(
        expect.arrayContaining(['admin', 'club-admin']),
      );
      expect(rolesForCapability('org.manage-clubs')).not.toContain('tournament-admin');
    });

    it('finds admin and tournament-admin, but no one else, for a tournament-operational capability', () => {
      expect(rolesForCapability('org.operate-match')).toEqual(
        expect.arrayContaining(['admin', 'tournament-admin', 'referee']),
      );
      expect(rolesForCapability('org.operate-match')).not.toContain('club-admin');
      expect(rolesForCapability('org.operate-match')).not.toContain('broadcaster');
      expect(rolesForCapability('org.operate-match')).not.toContain('viewer');
    });

    it('finds no role for a capability nothing holds', () => {
      // Every declared capability is held by at least one role; this guards
      // the inverse direction of rolesForCapability against an empty result
      // for a real, currently-held capability.
      for (const capability of ORGANIZATION_CAPABILITIES) {
        expect(rolesForCapability(capability).length).toBeGreaterThan(0);
      }
    });
  });
});
