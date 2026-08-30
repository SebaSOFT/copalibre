import { SIDENAV, visibleSidenav } from './dashboard.js';

describe('visibleSidenav', () => {
  it('shows every entry when the role has not resolved yet', () => {
    expect(visibleSidenav(undefined)).toEqual(SIDENAV);
  });

  it('shows every entry to admin, including user administration', () => {
    expect(visibleSidenav('admin').map((item) => item.id)).toEqual(SIDENAV.map((item) => item.id));
  });

  it('hides the user-administration entry from club-admin, following from the mapping', () => {
    expect(visibleSidenav('club-admin').map((item) => item.id)).not.toContain('roles');
  });

  it('hides the user-administration entry from referee', () => {
    expect(visibleSidenav('referee').map((item) => item.id)).not.toContain('roles');
  });

  it('hides the user-administration entry from broadcaster and viewer', () => {
    expect(visibleSidenav('broadcaster').map((item) => item.id)).not.toContain('roles');
    expect(visibleSidenav('viewer').map((item) => item.id)).not.toContain('roles');
  });

  it('keeps every ungated entry for every role', () => {
    for (const role of [
      'club-admin',
      'referee',
      'broadcaster',
      'viewer',
      'tournament-admin',
    ] as const) {
      const visibleIds = visibleSidenav(role).map((item) => item.id);
      for (const item of SIDENAV) {
        if (item.capability === undefined) expect(visibleIds).toContain(item.id);
      }
    }
  });
});
