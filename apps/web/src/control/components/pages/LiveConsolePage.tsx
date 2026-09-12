import { useEffect, useMemo, useState } from 'react';
import {
  createControlApiClient,
  type ControlApiClient,
  type TournamentResponse,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { LiveConsoleTemplate } from '../screens/LiveConsoleTemplate.js';

/**
 * Fetches (openspec 0225 task 6.2): the active-tournament load lives here;
 * `LiveConsoleTemplate` composes the screen from the resulting data.
 */
export function LiveConsolePage({
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const listTournaments = api.listActiveTournaments;
    (listTournaments ? listTournaments(organizationAlias) : Promise.resolve([]))
      .then((loaded) => {
        if (!active) return;
        setTournaments(loaded);
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setTournaments([]);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [api, organizationAlias]);

  return (
    <LiveConsoleTemplate
      loading={loading}
      organizationAlias={organizationAlias}
      tournaments={tournaments}
    />
  );
}
