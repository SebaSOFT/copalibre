import { useEffect, useMemo, useState } from 'react';
import { createControlApiClient, type ControlApiClient } from '../lib/api-client.js';
import type { StandingsData } from '../lib/standings.js';
import { StandingsPage } from './StandingsPage.js';

export function StandingsRoute({
  organizationAlias,
  tournamentAlias,
  stageNumber,
  client,
}: {
  readonly organizationAlias: string;
  readonly tournamentAlias: string;
  readonly stageNumber: number;
  readonly client?: ControlApiClient;
}): React.JSX.Element {
  const api = useMemo(
    () => client ?? createControlApiClient({ fetch: globalThis.fetch.bind(globalThis) }),
    [client],
  );
  const [standings, setStandings] = useState<StandingsData | undefined>(undefined);
  const [status, setStatus] = useState('Cargando posiciones...');

  useEffect(() => {
    let live = true;
    api
      .fetchStandings(organizationAlias, tournamentAlias, stageNumber)
      .then((loaded) => {
        if (!live) return;
        setStandings(loaded);
        setStatus('');
      })
      .catch(() => {
        if (live) setStatus('No se pudieron cargar las posiciones.');
      });
    return () => {
      live = false;
    };
  }, [api, organizationAlias, tournamentAlias, stageNumber]);

  if (standings === undefined) return <p className="cl-inline-alert">{status}</p>;

  return (
    <StandingsPage
      names={{}}
      onExpand={(entrantId) =>
        api
          .fetchTiebreakTrace(organizationAlias, tournamentAlias, stageNumber, entrantId)
          .then((response) => response.lines)
      }
      organizationAlias={organizationAlias}
      standings={standings}
      tournamentName={tournamentAlias}
    />
  );
}
