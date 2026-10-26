import type { ControlRoute } from '@copalibre/routing';

export type ControlNavItem =
  | 'dashboard'
  | 'live-console'
  | 'tournaments'
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
} satisfies Record<ControlRoute['screen'], ControlNavItem | undefined>;

export function controlNavItemForScreen(
  screen: ControlRoute['screen'] | undefined,
): ControlNavItem | undefined {
  return screen === undefined ? undefined : ACTIVE_ITEM_BY_SCREEN[screen];
}
