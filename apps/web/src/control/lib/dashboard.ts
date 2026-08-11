import type { MessageDescriptor } from 'react-intl';
import { messages } from '../i18n/messages.en.js';

/**
 * The organization dashboard's view models (0022).
 *
 * Pure, and separate from the components, so what the dashboard *says* is
 * testable without mounting React — and so the organization scoping is a
 * property of the data rather than of each component remembering to filter.
 */

export type TournamentLifecycle = 'live' | 'upcoming' | 'draft' | 'finished';

export interface TournamentCard {
  readonly tournamentId: string;
  readonly organizationId: string;
  readonly alias: string;
  readonly name: string;
  readonly lifecycle: TournamentLifecycle;
  readonly matchesToday: number;
  readonly pendingRegistrations: number;
}

export interface ActivityEntry {
  readonly auditId: string;
  readonly organizationId: string;
  readonly action: string;
  readonly actor: string;
  readonly occurredAt: string;
  readonly reason?: string;
}

export interface QuickStats {
  readonly activeTournaments: number;
  readonly pendingRegistrations: number;
  readonly matchesToday: number;
}

export interface DashboardModel {
  readonly organizationId: string;
  readonly stats: QuickStats;
  readonly tournaments: readonly TournamentCard[];
  readonly activity: readonly ActivityEntry[];
}

export const LIFECYCLE_PRESENTATION: Readonly<
  Record<TournamentLifecycle, { readonly label: MessageDescriptor; readonly accent: string }>
> = {
  live: { label: messages.lifecycleLive, accent: 'cl-state--live' },
  upcoming: { label: messages.lifecycleUpcoming, accent: 'cl-state--upcoming' },
  draft: { label: messages.lifecycleDraft, accent: 'cl-state--muted' },
  finished: { label: messages.lifecycleFinished, accent: 'cl-state--positive' },
};

/**
 * Builds the dashboard for **one** organization.
 *
 * The filter is here rather than in each fetch, because an operator who belongs
 * to two organizations is ordinary and a screen that shows both mixed together
 * is a screen where somebody approves the wrong registration.
 */
export function buildDashboard(input: {
  readonly organizationId: string;
  readonly tournaments: readonly TournamentCard[];
  readonly activity: readonly ActivityEntry[];
}): DashboardModel {
  const tournaments = input.tournaments.filter(
    (tournament) => tournament.organizationId === input.organizationId,
  );
  const activity = input.activity.filter((entry) => entry.organizationId === input.organizationId);

  return {
    organizationId: input.organizationId,
    tournaments,
    // Newest first: the last thing that happened is the thing being asked about.
    activity: [...activity].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)),
    stats: {
      activeTournaments: tournaments.filter((one) => one.lifecycle === 'live').length,
      pendingRegistrations: tournaments.reduce((sum, one) => sum + one.pendingRegistrations, 0),
      matchesToday: tournaments.reduce((sum, one) => sum + one.matchesToday, 0),
    },
  };
}

/** Whether this subject may see this organization at all. */
export function isMember(
  subject: { readonly organizationId?: string },
  organizationId: string,
): boolean {
  return subject.organizationId === organizationId;
}

export const SIDENAV: readonly {
  readonly id: string;
  readonly label: MessageDescriptor;
  readonly path: string;
}[] = [
  { id: 'dashboard', label: messages.navDashboard, path: '' },
  { id: 'live-console', label: messages.navLiveConsole, path: '/live' },
  { id: 'tournaments', label: messages.navTournaments, path: '/tournaments' },
  { id: 'roles', label: messages.navRoles, path: '/roles' },
  { id: 'organization', label: messages.navOrganization, path: '/organization' },
  { id: 'analytics', label: messages.navAnalytics, path: '/analytics' },
];
