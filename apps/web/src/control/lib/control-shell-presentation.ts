import type { SemanticColor } from '@copalibre/design-tokens';
import { capabilitiesForRole, type OrganizationRole } from '@copalibre/domain';
import type { MessageDescriptor } from 'react-intl';
import { messages } from '../i18n/messages.en.js';
import {
  classifyTournamentLifecycle,
  LIFECYCLE_PRESENTATION,
  SIDENAV,
  visibleSidenav,
  type TournamentLifecycle,
} from './dashboard.js';

type SidenavItem = (typeof SIDENAV)[number];

const CONTROL_NAV_GROUPS: readonly {
  readonly id: string;
  readonly label: MessageDescriptor;
  readonly itemIds: readonly string[];
}[] = [
  {
    id: 'overview',
    label: messages.shellNavGroupOverview,
    itemIds: ['dashboard', 'tournaments', 'analytics'],
  },
  { id: 'teams-rosters', label: messages.shellNavGroupTeamsRosters, itemIds: [] },
  { id: 'zones-groups', label: messages.shellNavGroupZonesGroups, itemIds: [] },
  { id: 'seeding-brackets', label: messages.shellNavGroupSeedingBrackets, itemIds: [] },
  { id: 'schedule', label: messages.shellNavGroupSchedule, itemIds: [] },
  { id: 'venues', label: messages.shellNavGroupVenues, itemIds: ['resources'] },
  { id: 'officials', label: messages.shellNavGroupOfficials, itemIds: [] },
  { id: 'broadcast', label: messages.shellNavGroupBroadcast, itemIds: ['live-console'] },
  {
    id: 'administration',
    label: messages.shellNavGroupAdministration,
    itemIds: ['roles', 'organization', 'audit-trail'],
  },
];

export interface ControlNavigationGroup {
  readonly id: string;
  readonly label: MessageDescriptor;
  readonly items: readonly SidenavItem[];
}

export function controlNavigationGroups(
  role: OrganizationRole | undefined,
): readonly ControlNavigationGroup[] {
  const visibleItems = new Map(visibleSidenav(role).map((item) => [item.id, item] as const));
  return CONTROL_NAV_GROUPS.flatMap(({ id, label, itemIds }) => {
    const items = itemIds.flatMap((itemId) => {
      const item = visibleItems.get(itemId);
      return item === undefined ? [] : [item];
    });
    return items.length === 0 ? [] : [{ id, label, items }];
  });
}

export interface ControlScopeStatus {
  readonly lifecycle: TournamentLifecycle;
  readonly label: MessageDescriptor;
  readonly color: SemanticColor;
}

const LIFECYCLE_COLORS: Readonly<Record<TournamentLifecycle, SemanticColor>> = {
  live: 'state-live',
  'in-progress': 'text-muted',
  upcoming: 'state-upcoming',
  draft: 'state-upcoming',
  finished: 'state-positive',
};

export function tournamentScopeStatus(
  status: 'draft' | 'published' | 'started' | 'finished' | 'archived' | undefined,
): ControlScopeStatus | undefined {
  if (status === undefined) return undefined;
  const lifecycle = classifyTournamentLifecycle({ status });
  return {
    lifecycle,
    label: LIFECYCLE_PRESENTATION[lifecycle].label,
    color: LIFECYCLE_COLORS[lifecycle],
  };
}

export interface ControlScopeAction {
  readonly label: MessageDescriptor;
  readonly href: string;
}

export function controlScopeAction(input: {
  readonly organizationAlias: string;
  readonly role: OrganizationRole | undefined;
  readonly tournamentAlias?: string;
  readonly lifecycle?: TournamentLifecycle;
}): ControlScopeAction | undefined {
  const { organizationAlias, role, tournamentAlias, lifecycle } = input;
  if (role === undefined) return undefined;

  const capabilities = new Set(capabilitiesForRole(role));
  const organizationPath = `/control/${encodeURIComponent(organizationAlias)}`;

  if (tournamentAlias === undefined) {
    return capabilities.has('org.create-tournaments')
      ? {
          label: messages.dashboardCreateTournament,
          href: `${organizationPath}/tournaments/new`,
        }
      : undefined;
  }

  if (lifecycle === 'live' && capabilities.has('org.operate-match')) {
    return {
      label: messages.shellScopeActionOpenLiveConsole,
      href: `${organizationPath}/live`,
    };
  }

  return capabilities.has('org.manage-tournament-lifecycle')
    ? {
        label: messages.shellScopeActionEditTournamentSettings,
        href: `${organizationPath}/tournaments/${encodeURIComponent(tournamentAlias)}/settings`,
      }
    : undefined;
}
