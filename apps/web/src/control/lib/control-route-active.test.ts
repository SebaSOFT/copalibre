import type { ControlRoute } from '@copalibre/routing';
import { controlNavItemForScreen, type ControlNavItem } from './control-route-active.js';
import { SIDENAV } from './dashboard.js';

const expected: Record<ControlRoute['screen'], ControlNavItem | undefined> = {
  root: undefined,
  callback: undefined,
  'silent-renew-callback': undefined,
  login: undefined,
  'forgot-password': undefined,
  'reset-password': undefined,
  platformAdministration: 'platform',
  disciplineDocument: 'platform',
  dashboard: 'dashboard',
  tournaments: 'dashboard',
  liveConsole: 'live-console',
  organization: 'organization',
  analytics: 'analytics',
  roles: 'roles',
  auditTrail: 'audit-trail',
  preferences: 'organization',
  newTournament: 'dashboard',
  clubs: 'clubs',
  resources: 'resources',
  personProfile: 'clubs',
  tournamentHub: 'dashboard',
  registrations: 'dashboard',
  tournamentSettings: 'dashboard',
  tournamentRuleset: 'dashboard',
  reports: 'dashboard',
  matchConsole: 'live-console',
  loadMatchData: 'live-console',
  stageHub: 'dashboard',
  seeding: 'dashboard',
  standings: 'dashboard',
  zoneGroups: 'dashboard',
  qualification: 'dashboard',
  promotionPlan: 'dashboard',
  schedule: 'dashboard',
  matchesView: 'dashboard',
  broadcaster: 'live-console',
  clubPortalMembers: 'clubs',
  clubPortalRoster: 'clubs',
};

describe('control navigation active item by route', () => {
  it.each(Object.entries(expected) as [ControlRoute['screen'], ControlNavItem | undefined][])(
    '%s selects its own navigation section',
    (screen, active) => {
      expect(controlNavItemForScreen(screen)).toBe(active);
    },
  );

  it('leaves navigation inactive before a route resolves', () => {
    expect(controlNavItemForScreen(undefined)).toBeUndefined();
  });
});

describe('control navigation entries', () => {
  it('opens a distinct screen from every rail entry', () => {
    const paths = SIDENAV.map((item) => item.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('has a rail entry for every section a route can mark', () => {
    const entries = new Set<string>(SIDENAV.map((item) => item.id));
    for (const item of Object.values(expected)) {
      if (item !== undefined && item !== 'platform') expect(entries.has(item)).toBe(true);
    }
  });
});
