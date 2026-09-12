import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from '../ui/atoms/alert.js';
import { useIntl } from 'react-intl';
import {
  createControlApiClient,
  type ControlApiClient,
  type OfficialResponse,
  type OfficialRole,
  type ScheduleDetailResponse,
  type VenueResponse,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { messages } from '../../i18n/messages.en.js';
import { useToast } from '../ToastProvider.js';
import { VenueManagementTemplate } from '../screens/VenueManagementTemplate.js';

/**
 * Fetches and mutates (openspec 0225 task 6.1): every call into the API
 * client lives here, `VenueManagementTemplate` composes the venue, schedule
 * and official sections from the resulting data and the callbacks below.
 */
export function VenueManagementPage({
  organizationAlias,
  client,
}: {
  readonly organizationAlias: string;
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

  const [venues, setVenues] = useState<readonly VenueResponse[]>([]);
  const [officials, setOfficials] = useState<readonly OfficialResponse[]>([]);
  const [schedules, setSchedules] = useState<readonly ScheduleDetailResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async (): Promise<void> => {
    try {
      const [loadedVenues, loadedOfficials, loadedSchedules] = await Promise.all([
        api.listVenues?.(organizationAlias) ?? Promise.resolve([]),
        api.listOfficials?.(organizationAlias) ?? Promise.resolve([]),
        api.listSchedules?.(organizationAlias) ?? Promise.resolve([]),
      ]);
      setVenues(loadedVenues);
      setOfficials(loadedOfficials);
      setSchedules(loadedSchedules);
    } catch {
      push({
        severity: 'error',
        message: intl.formatMessage(messages.resourceManagementLoadFailed),
      });
    }
  }, [api, intl, organizationAlias, push]);

  useEffect(() => {
    let live = true;
    Promise.all([
      api.listVenues?.(organizationAlias) ?? Promise.resolve([]),
      api.listOfficials?.(organizationAlias) ?? Promise.resolve([]),
      api.listSchedules?.(organizationAlias) ?? Promise.resolve([]),
    ])
      .then(([loadedVenues, loadedOfficials, loadedSchedules]) => {
        if (live) {
          setVenues(loadedVenues);
          setOfficials(loadedOfficials);
          setSchedules(loadedSchedules);
        }
      })
      .catch(() => {
        if (live) {
          push({
            severity: 'error',
            message: intl.formatMessage(messages.resourceManagementLoadFailed),
          });
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [api, intl, organizationAlias, push]);

  async function createVenue(name: string, alias: string, capacityText: string): Promise<boolean> {
    if (!api.createVenue || name.trim() === '' || alias.trim() === '') return false;
    const capacity = parseInt(capacityText, 10);
    try {
      await api.createVenue(organizationAlias, {
        name: name.trim(),
        alias: alias.trim(),
        concurrentCapacity: isNaN(capacity) ? 1 : capacity,
      });
      push({
        severity: 'success',
        message: intl.formatMessage(messages.resourceManagementVenueCreated),
      });
      void reload();
      return true;
    } catch (error) {
      pushError(error);
      return false;
    }
  }

  async function saveVenue(
    venueId: string,
    name: string,
    capacityText: string,
    address: string,
    details: readonly { readonly key: string; readonly value: string }[],
  ): Promise<void> {
    if (!api.updateVenue) return;
    const capacity = parseInt(capacityText, 10);
    const detailsObject: Record<string, string> = {};
    for (const entry of details) {
      if (entry.key.trim() !== '') {
        detailsObject[entry.key.trim()] = entry.value;
      }
    }
    try {
      await api.updateVenue(organizationAlias, venueId, {
        name: name.trim(),
        concurrentCapacity: isNaN(capacity) ? 1 : capacity,
        address: address.trim() === '' ? undefined : address.trim(),
        details: Object.keys(detailsObject).length > 0 ? detailsObject : undefined,
      });
      push({
        severity: 'success',
        message: intl.formatMessage(messages.resourceManagementVenueSaved),
      });
      void reload();
    } catch (error) {
      pushError(error);
    }
  }

  async function createOfficial(name: string, roles: readonly OfficialRole[]): Promise<boolean> {
    if (!api.createOfficial || name.trim() === '' || roles.length === 0) return false;
    try {
      await api.createOfficial(organizationAlias, { displayName: name.trim(), roles });
      push({
        severity: 'success',
        message: intl.formatMessage(messages.resourceManagementOfficialCreated),
      });
      void reload();
      return true;
    } catch (error) {
      pushError(error);
      return false;
    }
  }

  async function saveOfficial(
    officialId: string,
    name: string,
    roles: readonly OfficialRole[],
  ): Promise<void> {
    if (!api.updateOfficial) return;
    try {
      await api.updateOfficial(organizationAlias, officialId, { displayName: name.trim(), roles });
      push({
        severity: 'success',
        message: intl.formatMessage(messages.resourceManagementOfficialSaved),
      });
      void reload();
    } catch (error) {
      pushError(error);
    }
  }

  async function createSchedule(
    name: string,
    startsAtText: string,
    endsAtText: string,
    slotMinutesText: string,
    turnaroundMinutesText: string,
    venueIds: readonly string[],
  ): Promise<boolean> {
    if (
      !api.createSchedule ||
      name.trim() === '' ||
      startsAtText === '' ||
      endsAtText === '' ||
      venueIds.length === 0
    )
      return false;
    const startsAt = Date.parse(startsAtText);
    const endsAt = Date.parse(endsAtText);
    const slotMinutes = parseInt(slotMinutesText, 10);
    const turnaroundMinutes = parseInt(turnaroundMinutesText, 10);
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return false;
    try {
      await api.createSchedule(organizationAlias, {
        name: name.trim(),
        startsAt,
        endsAt,
        slotMinutes: isNaN(slotMinutes) ? 60 : slotMinutes,
        turnaroundMinutes: isNaN(turnaroundMinutes) ? 15 : turnaroundMinutes,
        venueIds,
      });
      push({
        severity: 'success',
        message: intl.formatMessage(messages.resourceManagementScheduleCreated),
      });
      void reload();
      return true;
    } catch (error) {
      pushError(error);
      return false;
    }
  }

  async function saveSchedule(scheduleId: string, name: string): Promise<void> {
    if (!api.updateSchedule) return;
    try {
      await api.updateSchedule(organizationAlias, scheduleId, { name: name.trim() });
      push({
        severity: 'success',
        message: intl.formatMessage(messages.resourceManagementScheduleSaved),
      });
      void reload();
    } catch (error) {
      pushError(error);
    }
  }

  async function deleteSchedule(scheduleId: string): Promise<boolean> {
    if (!api.deleteSchedule) return false;
    try {
      await api.deleteSchedule(organizationAlias, scheduleId);
      push({
        severity: 'success',
        message: intl.formatMessage(messages.resourceManagementScheduleDeleted),
      });
      void reload();
      return true;
    } catch (error) {
      pushError(error);
      return false;
    }
  }

  if (loading) {
    return <Alert tone="info">{intl.formatMessage(messages.resourceManagementLoading)}</Alert>;
  }

  return (
    <VenueManagementTemplate
      api={api}
      officials={officials}
      onCreateOfficial={createOfficial}
      onCreateSchedule={createSchedule}
      onCreateVenue={createVenue}
      onDeleteSchedule={deleteSchedule}
      onSaveOfficial={saveOfficial}
      onSaveSchedule={saveSchedule}
      onSaveVenue={saveVenue}
      organizationAlias={organizationAlias}
      schedules={schedules}
      venues={venues}
    />
  );
}
