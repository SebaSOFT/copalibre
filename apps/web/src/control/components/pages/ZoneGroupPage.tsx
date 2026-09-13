import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { useIntl } from 'react-intl';
import {
  createControlApiClient,
  type ControlApiClient,
  type DrawAssignmentResponse,
  type GroupResponse,
  type RegistrationResponse,
  type ZoneResponse,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { messages } from '../../i18n/messages.en.js';
import { useToast } from '../ToastProvider.js';
import { ZoneGroupTemplate, type ManualPlacements } from '../screens/ZoneGroupTemplate.js';

/**
 * Zone/Group management, entrant assignment, and the doorway to a zone's
 * promotion plan (openspec 0225 task 6.1): every call into the API client —
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

  const [zones, setZones] = useState<readonly ZoneResponse[]>([]);
  const [entrants, setEntrants] = useState<readonly RegistrationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [selectedZoneNumber, setSelectedZoneNumber] = useState<number | undefined>(undefined);
  const [groups, setGroups] = useState<readonly GroupResponse[]>([]);
  const [zoneEntrantIds, setZoneEntrantIds] = useState<readonly string[]>([]);

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [loadedZones, loadedEntrants] = await Promise.all([
        api.listZones?.(organizationAlias, tournamentAlias, stageNumber) ?? Promise.resolve([]),
        api.listRegistrations(organizationAlias, tournamentAlias, 'accepted'),
      ]);
      setZones(loadedZones);
      setEntrants(loadedEntrants);
      setSelectedZoneNumber((current) => current ?? loadedZones[0]?.number);
      setLoadError(undefined);
    } catch {
      setLoadError(intl.formatMessage(messages.zoneGroupLoadFailed));
    } finally {
      setLoading(false);
    }
  }, [api, organizationAlias, tournamentAlias, stageNumber, intl]);

  useEffect(() => {
    let live = true;
    Promise.all([
      api.listZones?.(organizationAlias, tournamentAlias, stageNumber) ?? Promise.resolve([]),
      api.listRegistrations(organizationAlias, tournamentAlias, 'accepted'),
    ])
      .then(([loadedZones, loadedEntrants]) => {
        if (!live) return;
        setZones(loadedZones);
        setEntrants(loadedEntrants);
        setSelectedZoneNumber((current) => current ?? loadedZones[0]?.number);
        setLoadError(undefined);
      })
      .catch(() => {
        if (live) setLoadError(intl.formatMessage(messages.zoneGroupLoadFailed));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [api, organizationAlias, tournamentAlias, stageNumber, intl]);

  useEffect(() => {
    const load = async (): Promise<void> => {
      if (selectedZoneNumber === undefined) {
        setGroups([]);
        setZoneEntrantIds([]);
        return;
      }
      const [loadedGroups, loadedEntrantIds] = await Promise.all([
        api
          .listGroups?.(organizationAlias, tournamentAlias, stageNumber, selectedZoneNumber)
          .catch(() => []) ?? Promise.resolve([]),
        api
          .fetchZoneEntrants?.(organizationAlias, tournamentAlias, stageNumber, selectedZoneNumber)
          .catch(() => []) ?? Promise.resolve([]),
      ]);
      setGroups(loadedGroups ?? []);
      setZoneEntrantIds(loadedEntrantIds ?? []);
    };
    void load();
  }, [api, organizationAlias, tournamentAlias, stageNumber, selectedZoneNumber]);

  const reloadGroups = useCallback(async (): Promise<void> => {
    if (selectedZoneNumber === undefined) return;
    const loaded = await api.listGroups?.(
      organizationAlias,
      tournamentAlias,
      stageNumber,
      selectedZoneNumber,
    );
    setGroups(loaded ?? []);
  }, [api, organizationAlias, tournamentAlias, stageNumber, selectedZoneNumber]);

  function entrantLabel(entrantId: string): string {
    const entrant = entrants.find((candidate) => candidate.entrantId === entrantId);
    return entrant?.displayName ?? entrantId.slice(-8);
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

  if (loading) {
    return <Alert tone="info">{intl.formatMessage(messages.zoneGroupLoading)}</Alert>;
  }

  if (loadError) {
    return <Alert tone="destructive">{loadError}</Alert>;
  }

  return (
    <ZoneGroupTemplate
      api={api}
      entrantLabel={entrantLabel}
      entrants={entrants}
      groups={groups}
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
      stageNumber={stageNumber}
      tournamentAlias={tournamentAlias}
      zoneEntrantIds={zoneEntrantIds}
      zones={zones}
    />
  );
}
