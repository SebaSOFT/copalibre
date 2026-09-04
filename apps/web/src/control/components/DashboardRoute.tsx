import { useCallback, useEffect, useMemo, useState } from 'react';
import { RealtimeClient } from '@copalibre/realtime';
import { createControlApiClient, type ControlApiClient } from '../lib/api-client.js';
import { controlTokenStore } from '../session/token-store.js';
import {
  buildDashboard,
  classifyTournamentLifecycle,
  type ActivityEntry,
  type TournamentCard,
} from '../lib/dashboard.js';
import { Dashboard } from './Dashboard.js';

/**
 * The organization dashboard's real tournament list replaces the sample data
 * `ControlApp.tsx` rendered directly with `listActive` (the admin-scoped
 * tournament list, already
 * organization-scoped and already excluding archived tournaments).
 */
export function DashboardRoute({
  organizationAlias,
  client,
}: {
  readonly organizationAlias: string;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  const api = useMemo(
    () =>
      client ??
      createControlApiClient({
        fetch: globalThis.fetch.bind(globalThis),
        accessToken: () => controlTokenStore.read(),
      }),
    [client],
  );
  const [tournaments, setTournaments] = useState<readonly TournamentCard[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [activity, setActivity] = useState<readonly ActivityEntry[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let live = true;
    const listActiveTournaments = api.listActiveTournaments;
    const fetchTournaments = listActiveTournaments
      ? listActiveTournaments(organizationAlias)
      : Promise.resolve([]);
    const fetchAudit = api.fetchAuditTrail
      ? api.fetchAuditTrail(organizationAlias, { limit: 10 }).catch(() => undefined)
      : Promise.resolve(undefined);

    Promise.all([fetchTournaments, fetchAudit])
      .then(async ([loadedTournaments, auditData]) => {
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
              // No tournament-wide "matches scheduled today" read exists yet;
              // building one is backend work this change did not plan for
              // (design.md: no API change expected) — left at zero rather
              // than guessed, unlike pendingRegistrations below, which an
              // existing read already answers exactly.
              matchesToday: 0,
              pendingRegistrations: pending.length,
            };
          }),
        );

        if (!live) return;
        const resolvedOrgId =
          cards[0]?.organizationId || (auditData?.records?.[0]?.organizationId ?? '') || '';
        setTournaments(cards);
        setOrganizationId(resolvedOrgId);

        if (auditData?.records) {
          setActivity(
            auditData.records.map((r) => ({
              auditId: r.auditId,
              organizationId: r.organizationId ?? resolvedOrgId,
              action: r.action,
              actor: r.actor,
              occurredAt: r.occurredAt,
              reason: r.reason,
            })),
          );
        } else {
          setActivity([]);
        }
      })
      .catch(() => {
        if (live) {
          setTournaments([]);
          setActivity([]);
        }
      });
    return () => {
      live = false;
    };
  }, [api, organizationAlias, refreshKey]);

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
  return <Dashboard model={model} organizationAlias={organizationAlias} />;
}
