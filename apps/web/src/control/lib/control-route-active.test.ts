import type { ControlRoute } from '@copalibre/routing';
import { controlNavItemForScreen, type ControlNavItem } from './control-route-active.js';

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
  tournaments: 'tournaments',
  liveConsole: 'live-console',
  organization: 'organization',
  analytics: 'analytics',
  roles: 'roles',
  auditTrail: 'audit-trail',
  preferences: 'organization',
  newTournament: 'tournaments',
  clubs: 'resources',
  resources: 'resources',
  personProfile: 'resources',
  tournamentHub: 'tournaments',
  registrations: 'tournaments',
  tournamentSettings: 'tournaments',
  tournamentRuleset: 'tournaments',
  reports: 'tournaments',
  matchConsole: 'live-console',
  loadMatchData: 'live-console',
  stageHub: 'tournaments',
  seeding: 'tournaments',
  standings: 'tournaments',
  zoneGroups: 'tournaments',
  qualification: 'tournaments',
  promotionPlan: 'tournaments',
  schedule: 'tournaments',
  matchesView: 'tournaments',
  broadcaster: 'live-console',
  clubPortalMembers: 'resources',
  clubPortalRoster: 'resources',
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
