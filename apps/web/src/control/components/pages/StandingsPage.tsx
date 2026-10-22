import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import { createControlApiClient, type ControlApiClient } from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { StandingsTemplate } from '../screens/StandingsTemplate.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { useResilientRead } from './use-resilient-read.js';

interface GroupOption {
  readonly groupId: string;
  readonly label: string;
}

export function StandingsPage({
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
  const [selectedLayout, setActiveLayoutCode] = useState<string | undefined>(undefined);
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>(undefined);
  const read = useResilientRead(
    `control-table-layouts:${organizationAlias}:${tournamentAlias}`,
    () => api.fetchTableLayouts(organizationAlias, tournamentAlias),
    { thing: intl.formatMessage(messages.standingsSectionLabel) },
  );
  const layouts = read.data ?? [];
  const activeLayoutCode =
    selectedLayout ??
    (layouts.find((layout) => layout.target === 'group-phase') ?? layouts[0])?.code;
  const groupsRead = useResilientRead<readonly GroupOption[]>(
    `control-table-groups:${organizationAlias}:${tournamentAlias}:${stageNumber}`,
    async () => {
      const { listZones, listGroups } = api;
      if (!listZones || !listGroups) return [];
      const zones = await listZones(organizationAlias, tournamentAlias, stageNumber);
      const perZone = await Promise.all(
        zones.map(async (zone) => ({
          zone,
          groups: await listGroups(organizationAlias, tournamentAlias, stageNumber, zone.number),
        })),
      );
      return perZone.flatMap(({ zone, groups }) =>
        groups.map((group) => ({
          groupId: group.groupId,
          label: zones.length > 1 ? `${zone.name} / ${group.name}` : group.name,
        })),
      );
    },
    { thing: intl.formatMessage(messages.zoneGroupTitle) },
  );
  const groupOptions = groupsRead.data ?? [];
  const projectionRead = useResilientRead(
    `control-table:${organizationAlias}:${tournamentAlias}:${stageNumber}:${activeLayoutCode}:${selectedGroupId}`,
    () => {
      if (activeLayoutCode === undefined) return Promise.resolve(undefined);
      const layout = layouts.find((candidate) => candidate.code === activeLayoutCode);
      const scope =
        layout?.target === 'team-ranking' || layout?.target === 'player-ranking'
          ? {}
          : layout?.target === 'group-phase' && selectedGroupId !== undefined
            ? { stageNumber, groupId: selectedGroupId }
            : { stageNumber };
      return api.fetchTableProjection(organizationAlias, tournamentAlias, activeLayoutCode, scope);
    },
    { thing: intl.formatMessage(messages.standingsSectionLabel), enabled: read.data !== undefined },
  );
  const projection = projectionRead.data;
  const activeLayout = layouts.find((layout) => layout.code === activeLayoutCode);
  const showGroupSelector = activeLayout?.target === 'group-phase' && groupOptions.length > 1;
  const stageScopedTarget =
    activeLayout?.target === 'group-phase' ||
    activeLayout?.target === 'match-roster' ||
    activeLayout?.target === 'schedule-timeframe';

  return (
    <ReadState {...read} title={intl.formatMessage(messages.standingsSectionLabel)}>
      <ReadState
        {...projectionRead}
        title={intl.formatMessage(messages.standingsSectionLabel)}
        variant="table-row"
      >
        <StandingsTemplate
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
                            ...(activeLayout?.target === 'group-phase' &&
                            selectedGroupId !== undefined
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
          projection={projection}
          /* a group-phase table with more than one group offers a selector
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
          stageNumber={stageNumber}
          status={undefined}
          tournamentAlias={tournamentAlias}
          tournamentName={tournamentAlias}
        />
      </ReadState>
    </ReadState>
  );
}
