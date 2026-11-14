import type { ControlRoute } from '@copalibre/routing';

export type ControlNavItem =
  | 'live-console'
  | 'dashboard'
  | 'clubs'
  | 'roles'
  | 'resources'
  | 'organization'
  | 'analytics'
  | 'audit-trail'
  | 'platform';

const ACTIVE_ITEM_BY_SCREEN = {
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
} satisfies Record<ControlRoute['screen'], ControlNavItem | undefined>;

export function controlNavItemForScreen(
  screen: ControlRoute['screen'] | undefined,
): ControlNavItem | undefined {
  return screen === undefined ? undefined : ACTIVE_ITEM_BY_SCREEN[screen];
}
