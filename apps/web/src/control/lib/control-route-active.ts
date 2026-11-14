import type { ControlRoute } from '@copalibre/routing';

export type ControlNavItem =
  | 'live-console'
  | 'tournaments'
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
  dashboard: 'tournaments',
  tournaments: 'tournaments',
  liveConsole: 'live-console',
  organization: 'organization',
  analytics: 'analytics',
  roles: 'roles',
  auditTrail: 'audit-trail',
  preferences: 'organization',
  newTournament: 'tournaments',
  clubs: 'clubs',
  resources: 'resources',
  personProfile: 'clubs',
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
  clubPortalMembers: 'clubs',
  clubPortalRoster: 'clubs',
} satisfies Record<ControlRoute['screen'], ControlNavItem | undefined>;

export function controlNavItemForScreen(
  screen: ControlRoute['screen'] | undefined,
): ControlNavItem | undefined {
  return screen === undefined ? undefined : ACTIVE_ITEM_BY_SCREEN[screen];
}
