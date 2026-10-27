import { useEffect, useMemo } from 'react';
import { useIntl } from 'react-intl';
import { RealtimeClient } from '@copalibre/realtime';
import { capabilitiesForRole, type OrganizationRole } from '@copalibre/domain';
import { createControlApiClient, type ControlApiClient } from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { messages } from '../../i18n/messages.en.js';
import { useResilientRead } from './use-resilient-read.js';
import {
  buildDashboard,
  classifyTournamentLifecycle,
  type TournamentCard,
} from '../../lib/dashboard.js';
import { Dashboard } from '../Dashboard.js';

/**
 * The organization dashboard's real tournament list replaces the sample data
 * `ControlApp.tsx` rendered directly with `listActive` (the admin-scoped
 * tournament list, already
 * organization-scoped and already excluding archived tournaments).
 */
export function DashboardPage({
  organizationAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  const intl = useIntl();
  const api = useMemo(
    () =>
      client ??
      createControlApiClient({
        fetch: globalThis.fetch.bind(globalThis),
        accessToken: () => controlTokenStore.read(),
      }),
    [client],
  );
  const roleRead = useResilientRead(
    `control-dashboard-role:${organizationAlias}`,
    async () =>
      (await api.listMyOrganizations()).find((one) => one.organizationAlias === organizationAlias)
        ?.role,
    {
      thing: intl.formatMessage(messages.navDashboard),
      isEmpty: (role) => role === undefined,
    },
  );
  const read = useResilientRead(
    `control-dashboard:${organizationAlias}`,
    async () => {
      const listActiveTournaments = api.listActiveTournaments;
      const fetchTournaments = listActiveTournaments
        ? listActiveTournaments(organizationAlias)
        : Promise.resolve([]);
      const fetchAudit = api.fetchAuditTrail
        ? api.fetchAuditTrail(organizationAlias, { limit: 10 }).catch(() => undefined)
        : Promise.resolve(undefined);
      const [loadedTournaments, auditData] = await Promise.all([fetchTournaments, fetchAudit]);
      const cards = await Promise.all(
        loadedTournaments.map(async (tournament): Promise<TournamentCard> => {
          const pending =
            (await api.listRegistrations(organizationAlias, tournament.alias, 'pending')) ?? [];
          return {
            tournamentId: tournament.tournamentId,
            organizationId: tournament.organizationId ?? '',
            alias: tournament.alias,
            name: tournament.name,
            lifecycle: classifyTournamentLifecycle({ status: tournament.status }),
            // No tournament-wide scheduled-today read exists; keep the metric at zero until the
            // API exposes authoritative data rather than infer a misleading value.
            matchesToday: 0,
            pendingRegistrations: pending.length,
          };
        }),
      );
      const organizationId =
        cards[0]?.organizationId || (auditData?.records?.[0]?.organizationId ?? '') || '';
      const activity = (auditData?.records ?? []).map((record) => ({
        auditId: record.auditId,
        organizationId: record.organizationId ?? organizationId,
        action: record.action,
        actor: record.actor,
        occurredAt: record.occurredAt,
        reason: record.reason,
      }));
      return { tournaments: cards, organizationId, activity };
    },
    {
      thing: intl.formatMessage(messages.navDashboard),
      isEmpty: ({ tournaments }) => tournaments.length === 0,
    },
  );
  const tournaments = read.data?.tournaments ?? [];
  const organizationId = read.data?.organizationId ?? '';
  const activity = read.data?.activity ?? [];
  const role: OrganizationRole | undefined = roleRead.data;

  // Client-side guard only — `role === undefined`
  // (not yet resolved) defaults to visible, matching `visibleSidenav`'s own
  // "unknown role sees everything" convention; the wizard route stays
  // server-enforced regardless.
  const canCreateTournament =
    role === undefined || capabilitiesForRole(role).includes('org.create-tournaments');
  // Same guard, same capability the Broadcaster Studio's own backend
  // endpoints already require — gates the dashboard's
  // per-tournament entry point into it.
  const canManageDisplayTokens =
    role === undefined || capabilitiesForRole(role).includes('org.manage-display-tokens');
  const canManageTournamentLifecycle =
    role === undefined || capabilitiesForRole(role).includes('org.manage-tournament-lifecycle');

  const reload = read.retry;

  useEffect(() => {
    const stream =
      api.controlStream?.(organizationAlias) ?? api.matchConsoleStream?.(organizationAlias);
    if (!stream) return undefined;

    const realtime = new RealtimeClient({
      url: stream.url,
      accessToken: stream.accessToken,
      heartbeatTimeoutMs: 15_000,
    });
    void realtime.connect({
      onEvent: () => reload(),
      onProjectionRequired: () => reload(),
    });
    return () => realtime.close();
  }, [api, organizationAlias, reload]);

  const model = buildDashboard({ organizationId, tournaments, activity });
  return (
    <Dashboard
      canCreateTournament={canCreateTournament}
      canManageDisplayTokens={canManageDisplayTokens}
      canManageTournamentLifecycle={canManageTournamentLifecycle}
      client={api}
      failed={read.status === 'failed-empty'}
      loading={read.status === 'loading'}
      model={model}
      onRetry={read.retry}
      onPublishComplete={read.retry}
      organizationAlias={organizationAlias}
      staleSince={read.status === 'stale' ? read.staleSince : undefined}
    />
  );
}
