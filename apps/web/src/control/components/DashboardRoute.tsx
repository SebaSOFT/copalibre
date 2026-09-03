import { useEffect, useMemo, useState } from 'react';
import { createControlApiClient, type ControlApiClient } from '../lib/api-client.js';
import { controlTokenStore } from '../session/token-store.js';
import {
  buildDashboard,
  classifyTournamentLifecycle,
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

  useEffect(() => {
    let live = true;
    const listActiveTournaments = api.listActiveTournaments;
    (listActiveTournaments ? listActiveTournaments(organizationAlias) : Promise.resolve([]))
      .then((loaded) =>
        Promise.all(
          loaded.map(async (tournament): Promise<TournamentCard> => {
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
        ),
      )
      .then((cards) => {
        if (!live) return;
        setTournaments(cards);
        setOrganizationId(cards[0]?.organizationId ?? '');
      })
      .catch(() => {
        if (live) setTournaments([]);
      });
    return () => {
      live = false;
    };
  }, [api, organizationAlias]);

  const model = buildDashboard({ organizationId, tournaments, activity: [] });
  return <Dashboard model={model} organizationAlias={organizationAlias} />;
}
