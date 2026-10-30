import {
  controlNavigationGroups,
  controlScopeAction,
  tournamentScopeStatus,
} from './control-shell-presentation.js';

describe('control shell presentation', () => {
  it('orders visible destinations by tournament lifecycle and keeps organization tools after broadcast', () => {
    const groups = controlNavigationGroups('admin');

    expect(groups.map(({ id }) => id)).toEqual([
      'overview',
      'venues',
      'broadcast',
      'administration',
    ]);
    expect(groups.flatMap(({ items }) => items.map(({ id }) => id))).toEqual([
      'dashboard',
      'tournaments',
      'analytics',
      'resources',
      'live-console',
      'roles',
      'organization',
      'audit-trail',
    ]);
  });

  it('uses only status values supplied by the tournament response', () => {
    expect(tournamentScopeStatus(undefined)).toBeUndefined();
    expect(tournamentScopeStatus('started')).toMatchObject({
      lifecycle: 'in-progress',
      color: 'text-muted',
    });
    expect(tournamentScopeStatus('draft')).toMatchObject({
      lifecycle: 'draft',
      color: 'state-upcoming',
    });
    expect(tournamentScopeStatus('finished')).toMatchObject({
      lifecycle: 'finished',
      color: 'state-positive',
    });
  });

  it('pins scope actions only when the current role has the required capability', () => {
    expect(controlScopeAction({ organizationAlias: 'liga-san-juan', role: 'admin' })).toMatchObject(
      {
        href: '/control/liga-san-juan/tournaments/new',
      },
    );
    expect(
      controlScopeAction({ organizationAlias: 'liga-san-juan', role: 'viewer' }),
    ).toBeUndefined();
    expect(
      controlScopeAction({ organizationAlias: 'liga-san-juan', role: undefined }),
    ).toBeUndefined();
    expect(
      controlScopeAction({
        organizationAlias: 'liga-san-juan',
        tournamentAlias: 'copa-premier',
        lifecycle: 'live',
        role: 'tournament-admin',
      }),
    ).toMatchObject({ href: '/control/liga-san-juan/live' });
    expect(
      controlScopeAction({
        organizationAlias: 'liga-san-juan',
        tournamentAlias: 'copa-premier',
        lifecycle: 'draft',
        role: 'tournament-admin',
      }),
    ).toBeUndefined();
  });
});
