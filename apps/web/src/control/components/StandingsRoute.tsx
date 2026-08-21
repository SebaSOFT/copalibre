import { useEffect, useMemo, useState } from 'react';
import { createControlApiClient, type ControlApiClient } from '../lib/api-client.js';
import type {
  GroupResponse,
  TableLayoutSummaryResponse,
  TableProjectionResponseData,
  ZoneResponse,
} from '../lib/api-client.js';
import { controlTokenStore } from '../session/token-store.js';
import { StandingsPage } from './StandingsPage.js';

interface GroupOption {
  readonly groupId: string;
  readonly label: string;
}

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
  const [groupOptions, setGroupOptions] = useState<readonly GroupOption[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>(undefined);

  // Every group across every zone of this stage (0108) — flat, since a
  // group-phase standings table has no zone axis of its own to nest under.
  // `listZones`/`listGroups` are optional client methods (older test doubles
  // and any client that never wires zone/group support omit them) — checked
  // once, outside the promise chain, so an absent method reads as "no
  // selector" instead of throwing on the un-guarded `.then` a bare `?.()`
  // call would leave dangling.
  useEffect(() => {
    let live = true;
    const load = async (): Promise<void> => {
      const listZones = api.listZones;
      const listGroups = api.listGroups;
      if (!listZones || !listGroups) {
        if (live) setGroupOptions([]);
        return;
      }
      try {
        const zones = await listZones(organizationAlias, tournamentAlias, stageNumber);
        const perZone = await Promise.all(
          zones.map(async (zone) => ({
            zone,
            groups: await listGroups(organizationAlias, tournamentAlias, stageNumber, zone.number),
          })),
        );
        if (!live) return;
        const options = perZone.flatMap(
          ({ zone, groups }: { zone: ZoneResponse; groups: readonly GroupResponse[] }) =>
            groups.map((group) => ({
              groupId: group.groupId,
              label: zones.length > 1 ? `${zone.name} / ${group.name}` : group.name,
            })),
        );
        setGroupOptions(options);
      } catch {
        // A stage with no zone/group management yet (or an unauthorized
        // subject for the admin-only zone routes) reads as "no selector" —
        // the same rendering a single-implicit-group stage already gets.
        if (live) setGroupOptions([]);
      }
    };
    void load();
    return () => {
      live = false;
    };
  }, [api, organizationAlias, tournamentAlias, stageNumber]);

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
        : layout?.target === 'group-phase' && selectedGroupId !== undefined
          ? { stageNumber, groupId: selectedGroupId }
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
  }, [
    api,
    organizationAlias,
    tournamentAlias,
    stageNumber,
    activeLayoutCode,
    layouts,
    selectedGroupId,
  ]);

  const activeLayout = layouts.find((layout) => layout.code === activeLayoutCode);
  const showGroupSelector = activeLayout?.target === 'group-phase' && groupOptions.length > 1;
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
                  stageScopedTarget
                    ? {
                        stageNumber,
                        ...(activeLayout?.target === 'group-phase' && selectedGroupId !== undefined
                          ? { groupId: selectedGroupId }
                          : {}),
                      }
                    : {},
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
      /* 0108: a group-phase table with more than one group offers a selector
         above the table; a single-implicit-group stage renders nothing
         extra, unchanged from before this capability existed. */
      groupSelector={
        showGroupSelector
          ? {
              options: groupOptions,
              selectedGroupId,
              onSelect: setSelectedGroupId,
            }
          : undefined
      }
      status={status}
      tournamentName={tournamentAlias}
    />
  );
}
