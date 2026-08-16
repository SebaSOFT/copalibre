import { useEffect, useMemo, useState } from 'react';
import { createControlApiClient, type ControlApiClient } from '../lib/api-client.js';
import type { TableLayoutSummaryResponse, TableProjectionResponseData } from '../lib/api-client.js';
import { controlTokenStore } from '../session/token-store.js';
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
    () =>
      client ??
      createControlApiClient({
        fetch: globalThis.fetch.bind(globalThis),
        accessToken: () => controlTokenStore.read(),
      }),
    [client],
  );
  const [layouts, setLayouts] = useState<readonly TableLayoutSummaryResponse[]>([]);
  const [layoutsLoaded, setLayoutsLoaded] = useState(false);
  const [activeLayoutCode, setActiveLayoutCode] = useState<string | undefined>(undefined);
  const [projection, setProjection] = useState<TableProjectionResponseData | undefined>(undefined);
  const [errorStatus, setErrorStatus] = useState<string | undefined>(undefined);

  useEffect(() => {
    let live = true;
    api
      .fetchTableLayouts(organizationAlias, tournamentAlias)
      .then((loaded) => {
        if (!live) return;
        setLayouts(loaded);
        setLayoutsLoaded(true);
        // 'group-phase' first, matching this screen's historical default —
        // any other declared layout otherwise, so a tournament with none
        // still lands on something.
        const first = loaded.find((layout) => layout.target === 'group-phase') ?? loaded[0];
        setActiveLayoutCode(first?.code);
      })
      .catch(() => {
        if (live) setErrorStatus('No se pudieron cargar las tablas.');
      });
    return () => {
      live = false;
    };
  }, [api, organizationAlias, tournamentAlias]);

  useEffect(() => {
    if (activeLayoutCode === undefined) return;
    const layout = layouts.find((candidate) => candidate.code === activeLayoutCode);
    const scope =
      layout?.target === 'team-ranking' || layout?.target === 'player-ranking'
        ? {}
        : { stageNumber };
    let live = true;
    api
      .fetchTableProjection(organizationAlias, tournamentAlias, activeLayoutCode, scope)
      .then((loaded) => {
        if (!live) return;
        setProjection(loaded);
        setErrorStatus(undefined);
      })
      .catch(() => {
        if (live) setErrorStatus('No se pudieron cargar las posiciones.');
      });
    return () => {
      live = false;
    };
  }, [api, organizationAlias, tournamentAlias, stageNumber, activeLayoutCode, layouts]);

  const activeLayout = layouts.find((layout) => layout.code === activeLayoutCode);
  const stageScopedTarget =
    activeLayout?.target === 'group-phase' ||
    activeLayout?.target === 'match-roster' ||
    activeLayout?.target === 'schedule-timeframe';
  // A pending fetch, derived rather than tracked as its own flag: either the
  // layout list hasn't resolved yet, or the displayed projection still
  // belongs to a tab the operator has since switched away from.
  const projectionStale =
    activeLayoutCode !== undefined && projection?.layoutCode !== activeLayoutCode;
  const status =
    errorStatus ?? (!layoutsLoaded || projectionStale ? 'Cargando posiciones...' : undefined);

  return (
    <StandingsPage
      activeLayoutCode={activeLayoutCode}
      layouts={layouts}
      onExpand={
        activeLayout?.target === 'group-phase'
          ? (entrantId) =>
              api
                .fetchTiebreakTrace(organizationAlias, tournamentAlias, stageNumber, entrantId)
                .then((response) => response.lines)
          : undefined
      }
      onExportCsv={
        api.downloadTableProjectionCsv && activeLayoutCode !== undefined
          ? () =>
              void api
                .downloadTableProjectionCsv?.(
                  organizationAlias,
                  tournamentAlias,
                  activeLayoutCode,
                  stageScopedTarget ? { stageNumber } : {},
                )
                .then((csv) => {
                  const link = document.createElement('a');
                  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
                  link.download = `${tournamentAlias}-${activeLayoutCode}.csv`;
                  link.click();
                  URL.revokeObjectURL(link.href);
                })
          : undefined
      }
      onSelectLayout={setActiveLayoutCode}
      organizationAlias={organizationAlias}
      projection={projectionStale ? undefined : projection}
      status={status}
      tournamentName={tournamentAlias}
    />
  );
}
