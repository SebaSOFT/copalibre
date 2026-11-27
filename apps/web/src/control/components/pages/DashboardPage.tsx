import { useContext, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { RealtimeClient } from '@copalibre/realtime';
import { capabilitiesForRole, type OrganizationRole } from '@copalibre/domain';
import { createControlApiClient, type ControlApiClient } from '../../lib/api-client.js';
import { messages } from '../../i18n/messages.en.js';
import { useResilientRead } from './use-resilient-read.js';
import {
  buildDashboard,
  classifyTournamentLifecycle,
  countKickoffsOnDay,
  type TournamentCard,
} from '../../lib/dashboard.js';
import { Dashboard } from '../Dashboard.js';
import { PageHeaderContext } from '../ui/organisms/page-header.js';

/** The current time, refreshed each minute so a count of "today" turns over at midnight. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);
  return now;
}

/** How far either side of now the schedule is read: wider than any zone's offset from UTC. */
const SCHEDULE_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

interface Kickoff {
  readonly tournamentId: string;
  readonly startsAt: number;
}

/**
 * The published kick-offs around now, across every tournament of the organization, in one request.
 *
 * `undefined` is "not known", never "none": the organization schedule is readable only with the
 * schedule capability, and a failed read is not retried or toasted, because the dashboard is
 * complete without it. Without the numbers the matches-today count stays off the page, rather
 * than reading as zero.
 */
function useScheduledKickoffs(
  api: ControlApiClient,
  organizationAlias: string,
  enabled: boolean,
  refreshOn: unknown,
): readonly Kickoff[] | undefined {
  const [kickoffs, setKickoffs] = useState<readonly Kickoff[] | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return undefined;
    const readSchedule = api.fetchOrganizationSchedule;
    if (readSchedule === undefined) return undefined;
    let current = true;
    const now = Date.now();
    readSchedule(organizationAlias, {
      from: now - SCHEDULE_WINDOW_MS,
      to: now + SCHEDULE_WINDOW_MS,
    })
      .then(({ assignments }) => {
        if (!current) return;
        setKickoffs(
          assignments
            .filter(({ published }) => published)
            .map(({ tournamentId, startsAt }) => ({ tournamentId, startsAt })),
        );
      })
      .catch(() => {
        if (current) setKickoffs(undefined);
      });
    return () => {
      current = false;
    };
  }, [api, organizationAlias, enabled, refreshOn]);
  return enabled ? kickoffs : undefined;
}

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
      if (!listActiveTournaments) throw new Error('Tournament listing is unavailable');
      const fetchTournaments = listActiveTournaments(organizationAlias);
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
            ...(tournament.status === undefined
              ? {}
              : { lifecycle: classifyTournamentLifecycle({ status: tournament.status }) }),
            // The dashboard API exposes no schedule count. Omitting it keeps both the card fact
            // and KPI out of the view until an authoritative value exists.
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
  const scheduledKickoffs = useScheduledKickoffs(
    api,
    organizationAlias,
    roleRead.data !== undefined &&
      capabilitiesForRole(roleRead.data).includes('org.manage-schedule'),
    read.data,
  );
  const organizationTimeZone = useContext(PageHeaderContext)?.organizationTimeZone;
  const now = useNow();
  // Counted at render, against today's date in the organization's zone, so the day rolls over
  // without a reload. With no schedule to count, both the card fact and the summary tile stay
  // out of the view until an authoritative value exists.
  const tournaments = (read.data?.tournaments ?? []).map((card): TournamentCard =>
    scheduledKickoffs === undefined
      ? card
      : {
          ...card,
          matchesToday: countKickoffsOnDay(
            scheduledKickoffs
              .filter(({ tournamentId }) => tournamentId === card.tournamentId)
              .map(({ startsAt }) => startsAt),
            now,
            organizationTimeZone,
          ),
        },
  );
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
