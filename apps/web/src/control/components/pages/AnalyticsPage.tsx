import { useEffect, useMemo, useState } from 'react';
import type { TournamentCompletionResponse } from '@copalibre/contracts';
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
  const [completionByTournament, setCompletionByTournament] = useState<
    Readonly<Record<string, TournamentCompletionResponse | undefined>>
  >({});
  const [storage, setStorage] = useState<OrganizationStorageUsageResponse | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const listTournaments = api.listActiveTournaments;
    const getStorage = api.getStorageUsage;
    const fetchCompletion = api.fetchCompletion;

    Promise.all([
      listTournaments ? listTournaments(organizationAlias) : Promise.resolve([]),
      getStorage
        ? getStorage(organizationAlias).catch(() => undefined)
        : Promise.resolve(undefined),
    ])
      .then(([loadedTournaments, loadedStorage]) => {
        if (!active) return;
        setCompletionByTournament({});
        setTournaments(loadedTournaments);
        setStorage(loadedStorage);
        setLoading(false);
        if (fetchCompletion) {
          for (const tournament of loadedTournaments) {
            void fetchCompletion(organizationAlias, tournament.alias)
              .then((completion) => {
                if (!active) return;
                setCompletionByTournament((current) => ({
                  ...current,
                  [tournament.alias]: completion,
                }));
              })
              .catch(() => undefined);
          }
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [api, organizationAlias]);

  return (
    <AnalyticsTemplate
      completionByTournament={completionByTournament}
      loading={loading}
      organizationAlias={organizationAlias}
      storage={storage}
      tournaments={tournaments}
    />
  );
}
