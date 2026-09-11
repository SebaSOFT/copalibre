import { useEffect, useMemo, useState } from 'react';
import {
  createControlApiClient,
  type ControlApiClient,
  type OrganizationStorageUsageResponse,
  type TournamentResponse,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { AnalyticsTemplate } from '../screens/AnalyticsTemplate.js';

/**
 * Fetches (openspec 0225 task 6.2): the tournament and storage-usage loads
 * live here; `AnalyticsTemplate` composes the screen from the resulting
 * data.
 */
export function AnalyticsPage({
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

  const [tournaments, setTournaments] = useState<readonly TournamentResponse[]>([]);
  const [storage, setStorage] = useState<OrganizationStorageUsageResponse | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const listTournaments = api.listActiveTournaments;
    const getStorage = api.getStorageUsage;

    Promise.all([
      listTournaments ? listTournaments(organizationAlias) : Promise.resolve([]),
      getStorage
        ? getStorage(organizationAlias).catch(() => undefined)
        : Promise.resolve(undefined),
    ])
      .then(([loadedTournaments, loadedStorage]) => {
        if (!active) return;
        setTournaments(loadedTournaments);
        setStorage(loadedStorage);
        setLoading(false);
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [api, organizationAlias]);

  return <AnalyticsTemplate loading={loading} storage={storage} tournaments={tournaments} />;
}
