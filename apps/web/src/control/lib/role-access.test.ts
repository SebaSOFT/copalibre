import { roleMayUse, rolesWithCapability } from './role-access.js';

describe('role access', () => {
  it('allows a role that has not resolved yet', () => {
    expect(roleMayUse(undefined, 'org.manage-settings')).toBe(true);
  });

  it('allows a role that holds the capability and refuses one that does not', () => {
    expect(roleMayUse('admin', 'org.manage-settings')).toBe(true);
    expect(roleMayUse('referee', 'org.manage-settings')).toBe(false);
    expect(roleMayUse('viewer', 'org.rebuild-statistics')).toBe(false);
  });

  it('names the roles that hold a capability, in the domain role order', () => {
    expect(rolesWithCapability('org.manage-settings')).toEqual(['admin']);
    expect(rolesWithCapability('org.operate-match')).toContain('referee');
    expect(rolesWithCapability('org.operate-match')[0]).toBe('admin');
  });

  it('never names a role that lacks the capability', () => {
    for (const role of rolesWithCapability('org.rebuild-statistics')) {
      expect(roleMayUse(role, 'org.rebuild-statistics')).toBe(true);
    }
  });
});
