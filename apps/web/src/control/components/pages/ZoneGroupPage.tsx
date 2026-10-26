import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import {
  createControlApiClient,
  type ControlApiClient,
  type DrawAssignmentResponse,
  type ZoneConfigurationRequest,
  type ZoneResponse,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { useToast } from '../ToastProvider.js';
import { ZoneGroupTemplate, type ManualPlacements } from '../screens/ZoneGroupTemplate.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { useResilientRead } from './use-resilient-read.js';
import { formatEntrant } from '../../lib/presentation-formatting.js';

/**
 * Zone/Group management, entrant assignment, and the doorway to a zone's
 * promotion plan: every call into the API client —
 * including the zone-selection-driven groups/entrants fetch, since which
 * zone is selected gates what this page loads — lives here.
 * `ZoneGroupTemplate` composes the draw and manual-placement forms from the
 * resulting data and the callbacks below.
 */
export function ZoneGroupPage({
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
  const { push, pushError } = useToast();
  const api = useMemo(
    () =>
      client ??
      createControlApiClient({
        fetch: globalThis.fetch.bind(globalThis),
        accessToken: () => controlTokenStore.read(),
      }),
    [client],
  );

  const [selectedZoneOverride, setSelectedZoneNumber] = useState<number | undefined>(undefined);
  const read = useResilientRead(
    `control-zones:${organizationAlias}:${tournamentAlias}:${stageNumber}`,
    async () => {
      const [zones, entrants, stages] = await Promise.all([
        api.listZones?.(organizationAlias, tournamentAlias, stageNumber) ?? Promise.resolve([]),
        api.listRegistrations(organizationAlias, tournamentAlias, 'accepted'),
        api.listStages?.(organizationAlias, tournamentAlias) ?? Promise.resolve([]),
      ]);
      return {
        zones,
        entrants,
        stage: stages.find((candidate) => candidate.number === stageNumber),
      };
    },
    {
      thing: intl.formatMessage(messages.zoneGroupTitle),
      isEmpty: (data) => data.zones.length === 0,
    },
  );
  const { zones = [], entrants = [], stage } = read.data ?? {};
  const selectedZoneNumber = selectedZoneOverride ?? zones[0]?.number;
  const setZones = (change: (zones: readonly ZoneResponse[]) => readonly ZoneResponse[]): void =>
    read.update((current) => ({ ...current, zones: change(current.zones) }));
  const reload = read.retry;
  const groupsRead = useResilientRead(
    `control-zone-groups:${organizationAlias}:${tournamentAlias}:${stageNumber}:${selectedZoneNumber ?? 'none'}`,
    async () => {
      if (selectedZoneNumber === undefined) return { groups: [], zoneEntrantIds: [] };
      const [groups, zoneEntrantIds] = await Promise.all([
        api.listGroups?.(organizationAlias, tournamentAlias, stageNumber, selectedZoneNumber) ??
          Promise.resolve([]),
        api.fetchZoneEntrants?.(
          organizationAlias,
          tournamentAlias,
          stageNumber,
          selectedZoneNumber,
        ) ?? Promise.resolve([]),
      ]);
      return { groups, zoneEntrantIds };
    },
    {
      thing: intl.formatMessage(messages.zoneGroupTitle),
      isEmpty: (data) => data.groups.length === 0,
    },
  );
  const { groups = [], zoneEntrantIds = [] } = groupsRead.data ?? {};
  const reloadGroups = groupsRead.retry;
  const groupEntrants = new Map(
    groups.flatMap((group) => group.entrants ?? []).map((entrant) => [entrant.entrantId, entrant]),
  );

  function entrantLabel(entrantId: string): string {
    const groupEntrant = groupEntrants.get(entrantId);
    const registeredEntrant = entrants.find((candidate) => candidate.entrantId === entrantId);
    return formatEntrant(intl, {
      displayName: groupEntrant?.displayName ?? registeredEntrant?.displayName,
      abbreviation: groupEntrant?.abbreviation ?? registeredEntrant?.abbreviation,
    }).fullName;
  }

  async function createZone(name: string): Promise<boolean> {
    if (!api.createZone || name.trim() === '') return false;
    try {
      await api.createZone(organizationAlias, tournamentAlias, stageNumber, { name: name.trim() });
      void reload();
      return true;
    } catch (error) {
      pushError(error);
      return false;
    }
  }

  async function renameZone(zoneNumber: number, name: string): Promise<void> {
    if (!api.renameZone || name.trim() === '') return;
    try {
      await api.renameZone(organizationAlias, tournamentAlias, stageNumber, zoneNumber, {
        name: name.trim(),
      });
      void reload();
    } catch (error) {
      pushError(error);
    }
  }

  async function configureZone(
    zoneNumber: number,
    request: ZoneConfigurationRequest,
  ): Promise<void> {
    if (!api.configureZone) return;
    try {
      const updated = await api.configureZone(
        organizationAlias,
        tournamentAlias,
        stageNumber,
        zoneNumber,
        request,
      );
      push({ severity: 'success', message: intl.formatMessage(messages.zoneGroupZoneConfigSaved) });
      // Replaced in place rather than reloaded, so the override section the operator is working in
      // stays open and keeps what they typed.
      setZones((current) =>
        current.map((zone) => (zone.number === updated.number ? updated : zone)),
      );
    } catch (error) {
      pushError(error);
    }
  }

  async function deleteZone(zoneNumber: number): Promise<void> {
    if (!api.deleteZone) return;
    try {
      await api.deleteZone(organizationAlias, tournamentAlias, stageNumber, zoneNumber);
      void reload();
    } catch (error) {
      pushError(error);
    }
  }

  async function renameGroup(groupNumber: number, name: string): Promise<void> {
    if (!api.renameGroup || selectedZoneNumber === undefined || name.trim() === '') return;
    try {
      await api.renameGroup(
        organizationAlias,
        tournamentAlias,
        stageNumber,
        selectedZoneNumber,
        groupNumber,
        { name: name.trim() },
      );
      void reloadGroups();
    } catch (error) {
      pushError(error);
    }
  }

  async function deleteGroup(groupNumber: number): Promise<void> {
    if (!api.deleteGroup || selectedZoneNumber === undefined) return;
    try {
      await api.deleteGroup(
        organizationAlias,
        tournamentAlias,
        stageNumber,
        selectedZoneNumber,
        groupNumber,
      );
      void reloadGroups();
    } catch (error) {
      pushError(error);
    }
  }

  async function createGroup(name: string): Promise<boolean> {
    if (!api.createGroup || selectedZoneNumber === undefined || name.trim() === '') return false;
    try {
      await api.createGroup(organizationAlias, tournamentAlias, stageNumber, selectedZoneNumber, {
        name: name.trim(),
      });
      void reloadGroups();
      return true;
    } catch (error) {
      pushError(error);
      return false;
    }
  }

  async function previewZoneDraw(
    zoneCount: number,
    seed: number,
  ): Promise<DrawAssignmentResponse | undefined> {
    if (!api.previewZoneDraw) return undefined;
    try {
      const result = await api.previewZoneDraw(organizationAlias, tournamentAlias, stageNumber, {
        zoneCount,
        seed,
      });
      return result.assignment;
    } catch (error) {
      pushError(error);
      return undefined;
    }
  }

  async function confirmZoneDraw(zoneCount: number, seed: number): Promise<boolean> {
    if (!api.confirmZoneDraw) return false;
    try {
      await api.confirmZoneDraw(organizationAlias, tournamentAlias, stageNumber, {
        zoneCount,
        seed,
      });
      push({ severity: 'success', message: intl.formatMessage(messages.zoneGroupAssignmentSaved) });
      void reload();
      return true;
    } catch (error) {
      pushError(error);
      return false;
    }
  }

  async function saveZoneManualAssignment(
    placements: ManualPlacements,
    zoneCount: number,
  ): Promise<boolean> {
    if (!api.assignZonesManually) return false;
    const groupsMap: Record<string, number> = {};
    for (const [entrantId, value] of Object.entries(placements)) {
      const number = Number(value);
      if (value.trim() !== '' && Number.isInteger(number)) groupsMap[entrantId] = number;
    }
    try {
      await api.assignZonesManually(organizationAlias, tournamentAlias, stageNumber, {
        assignment: { groups: groupsMap },
        zoneCount,
      });
      push({ severity: 'success', message: intl.formatMessage(messages.zoneGroupAssignmentSaved) });
      void reload();
      return true;
    } catch (error) {
      pushError(error);
      return false;
    }
  }

  async function previewGroupDraw(
    groupCount: number,
    seed: number,
  ): Promise<DrawAssignmentResponse | undefined> {
    if (!api.previewGroupDraw || selectedZoneNumber === undefined) return undefined;
    try {
      const result = await api.previewGroupDraw(
        organizationAlias,
        tournamentAlias,
        stageNumber,
        selectedZoneNumber,
        { groupCount, seed },
      );
      return result.assignment;
    } catch (error) {
      pushError(error);
      return undefined;
    }
  }

  async function confirmGroupDraw(groupCount: number, seed: number): Promise<boolean> {
    if (!api.confirmGroupDraw || selectedZoneNumber === undefined) return false;
    try {
      await api.confirmGroupDraw(
        organizationAlias,
        tournamentAlias,
        stageNumber,
        selectedZoneNumber,
        { groupCount, seed },
      );
      push({ severity: 'success', message: intl.formatMessage(messages.zoneGroupAssignmentSaved) });
      void reloadGroups();
      return true;
    } catch (error) {
      pushError(error);
      return false;
    }
  }

  async function saveGroupManualAssignment(
    placements: ManualPlacements,
    groupCount: number,
  ): Promise<boolean> {
    if (!api.assignGroupsManually || selectedZoneNumber === undefined) return false;
    const groupsMap: Record<string, number> = {};
    for (const [entrantId, value] of Object.entries(placements)) {
      const number = Number(value);
      if (value.trim() !== '' && Number.isInteger(number)) groupsMap[entrantId] = number;
    }
    try {
      await api.assignGroupsManually(
        organizationAlias,
        tournamentAlias,
        stageNumber,
        selectedZoneNumber,
        { assignment: { groups: groupsMap }, groupCount },
      );
      push({ severity: 'success', message: intl.formatMessage(messages.zoneGroupAssignmentSaved) });
      void reloadGroups();
      return true;
    } catch (error) {
      pushError(error);
      return false;
    }
  }

  if (read.data === undefined)
    return <ReadState {...read} title={intl.formatMessage(messages.zoneGroupTitle)} />;

  return (
    <ReadState {...read} title={intl.formatMessage(messages.zoneGroupTitle)}>
      <ReadState {...groupsRead} title={intl.formatMessage(messages.zoneGroupTitle)}>
        <ZoneGroupTemplate
          api={api}
          entrantLabel={entrantLabel}
          entrants={entrants}
          groups={groups}
          availableFormats={stage?.availableFormats ?? []}
          onConfigureZone={configureZone}
          onConfirmGroupDraw={confirmGroupDraw}
          onConfirmZoneDraw={confirmZoneDraw}
          onCreateGroup={createGroup}
          onCreateZone={createZone}
          onDeleteGroup={deleteGroup}
          onDeleteZone={deleteZone}
          onPreviewGroupDraw={previewGroupDraw}
          onPreviewZoneDraw={previewZoneDraw}
          onRenameGroup={renameGroup}
          onRenameZone={renameZone}
          onSaveGroupManualAssignment={saveGroupManualAssignment}
          onSaveZoneManualAssignment={saveZoneManualAssignment}
          onSelectZone={setSelectedZoneNumber}
          organizationAlias={organizationAlias}
          selectedZoneNumber={selectedZoneNumber}
          stageFormat={stage?.format}
          stageNumber={stageNumber}
          stageSeeded={stage?.seeded ?? false}
          tournamentAlias={tournamentAlias}
          zoneEntrantIds={zoneEntrantIds}
          zones={zones}
        />
      </ReadState>
    </ReadState>
  );
}
