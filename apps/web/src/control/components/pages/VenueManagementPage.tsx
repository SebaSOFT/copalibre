import { useMemo } from 'react';
import { useIntl } from 'react-intl';
import { messages } from '../../i18n/messages.en.js';
import {
  createControlApiClient,
  type ControlApiClient,
  type OfficialRole,
  type ScheduleDeletionResponse,
} from '../../lib/api-client.js';
import { controlTokenStore } from '../../session/token-store.js';
import { useToast } from '../ToastProvider.js';
import { VenueManagementTemplate } from '../screens/VenueManagementTemplate.js';
import { ReadState } from '../ui/layouts/read-state.js';
import { useResilientRead } from './use-resilient-read.js';

/**
 * Fetches and mutates: every call into the API
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

  const read = useResilientRead(
    `control-resources:${organizationAlias}`,
    async () => {
      const [venues, officials, schedules] = await Promise.all([
        api.listVenues?.(organizationAlias) ?? Promise.resolve([]),
        api.listOfficials?.(organizationAlias) ?? Promise.resolve([]),
        api.listSchedules?.(organizationAlias) ?? Promise.resolve([]),
      ]);
      return { venues, officials, schedules };
    },
    {
      thing: intl.formatMessage(messages.resourceManagementTitle),
      isEmpty: (data) =>
        data.venues.length === 0 && data.officials.length === 0 && data.schedules.length === 0,
    },
  );
  const { venues = [], officials = [], schedules = [] } = read.data ?? {};
  const reload = read.retry;

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

  async function restoreVenue(venueId: string): Promise<void> {
    if (!api.restoreVenue) return;
    try {
      await api.restoreVenue(organizationAlias, venueId);
      push({
        severity: 'success',
        message: intl.formatMessage(messages.resourceManagementVenueRestored),
      });
      void reload();
    } catch (error) {
      pushError(error);
    }
  }

  async function deleteVenue(venueId: string): Promise<boolean> {
    if (!api.deleteVenue) return false;
    try {
      const result = await api.deleteVenue(organizationAlias, venueId);
      if (!result.success) return false;
      push({
        severity: 'success',
        message: intl.formatMessage(messages.resourceManagementVenueDeleted),
        durationMs: 10_000,
        action: {
          label: intl.formatMessage(messages.seedingUndo),
          onAction: () => void restoreVenue(venueId),
        },
      });
      void reload();
      return true;
    } catch (error) {
      pushError(error);
      return false;
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

  async function deleteSchedule(scheduleId: string, confirmationName: string): Promise<boolean> {
    if (!api.deleteSchedule) return false;
    try {
      const result = await api.deleteSchedule(
        organizationAlias,
        scheduleId,
        false,
        confirmationName,
      );
      if (!result.success) return false;
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

  async function previewDeleteSchedule(
    scheduleId: string,
  ): Promise<ScheduleDeletionResponse | undefined> {
    if (!api.deleteSchedule) return undefined;
    try {
      return await api.deleteSchedule(organizationAlias, scheduleId, true);
    } catch (error) {
      pushError(error);
      return undefined;
    }
  }

  if (read.data === undefined)
    return <ReadState {...read} title={intl.formatMessage(messages.resourceManagementTitle)} />;

  return (
    <ReadState {...read} title={intl.formatMessage(messages.resourceManagementTitle)}>
      <VenueManagementTemplate
        api={api}
        officials={officials}
        onCreateOfficial={createOfficial}
        onCreateSchedule={createSchedule}
        onCreateVenue={createVenue}
        onDeleteSchedule={deleteSchedule}
        onDeleteVenue={deleteVenue}
        onPreviewDeleteSchedule={previewDeleteSchedule}
        onSaveOfficial={saveOfficial}
        onSaveSchedule={saveSchedule}
        onSaveVenue={saveVenue}
        organizationAlias={organizationAlias}
        schedules={schedules}
        venues={venues}
      />
    </ReadState>
  );
}
