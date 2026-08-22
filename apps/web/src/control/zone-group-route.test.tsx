import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ZoneGroupRoute } from './components/ZoneGroupRoute.js';
import { ControlApiError } from './lib/api-client.js';
import type {
  ControlApiClient,
  CreateZoneOrGroupRequest,
  DrawPreviewResponse,
  GroupResponse,
  RegistrationResponse,
  ZoneResponse,
} from './lib/api-client.js';
import { withIntl } from './i18n/test-support.js';

const entrants: readonly RegistrationResponse[] = [
  {
    entrantId: 'entrant-1',
    tournamentId: 'tournament-1',
    status: 'accepted',
    displayName: 'Team A',
  },
  {
    entrantId: 'entrant-2',
    tournamentId: 'tournament-1',
    status: 'accepted',
    displayName: 'Team B',
  },
];

const oneZone: readonly ZoneResponse[] = [
  { zoneId: 'zone-1', stageId: 'stage-1', number: 1, name: 'Zone 1' },
];

const oneGroup: readonly GroupResponse[] = [
  { groupId: 'group-1', zoneId: 'zone-1', number: 1, name: 'Group 1' },
];

function zoneAssignRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'Assign entrants to zones' });
}

function groupAssignRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'Assign entrants to groups' });
}

describe('ZoneGroupRoute', () => {
  it('renders zones, groups, and (in manual mode) entrants for the default stage', async () => {
    const client = stubClient({
      listZones: () => Promise.resolve(oneZone),
      listGroups: () => Promise.resolve(oneGroup),
      listRegistrations: () => Promise.resolve(entrants),
    });
    render(
      withIntl(
        <ZoneGroupRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findAllByText('Zone 1');
    await screen.findByText('Group 1');

    fireEvent.click(within(zoneAssignRegion()).getByText('Manual placement'));
    expect(screen.getByText('Team A')).toBeTruthy();
    expect(screen.getByText('Team B')).toBeTruthy();
  });

  it('creates a second zone and reloads the zone list', async () => {
    const zones: ZoneResponse[] = [...oneZone];
    const createZone = jest.fn(
      async (_org: string, _tournament: string, _stage: number, body: CreateZoneOrGroupRequest) => {
        const created: ZoneResponse = {
          zoneId: 'zone-2',
          stageId: 'stage-1',
          number: 2,
          name: body.name,
        };
        zones.push(created);
        return created;
      },
    );
    const client = stubClient({
      listZones: () => Promise.resolve(zones),
      listGroups: () => Promise.resolve(oneGroup),
      listRegistrations: () => Promise.resolve(entrants),
      createZone,
    });
    render(
      withIntl(
        <ZoneGroupRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findAllByText('Zone 1');

    // An empty name is a no-op — the guard short-circuits before any call.
    await act(async () => {
      fireEvent.click(screen.getByText('Add zone'));
    });
    expect(createZone).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('New zone name'), { target: { value: 'Zone 2' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Add zone'));
    });

    expect(createZone).toHaveBeenCalledWith('liga-mendocina', 'apertura', 1, { name: 'Zone 2' });
    await waitFor(() => expect(screen.getAllByText('Zone 2').length).toBeGreaterThan(0));
  });

  it('previews and confirms an automatic zone draw', async () => {
    const preview: DrawPreviewResponse = {
      assignment: { groups: { 'entrant-1': 1, 'entrant-2': 2 } },
      seed: 7,
      steps: 2,
    };
    const previewZoneDraw = jest.fn<NonNullable<ControlApiClient['previewZoneDraw']>>(
      async () => preview,
    );
    const confirmZoneDraw = jest.fn<NonNullable<ControlApiClient['confirmZoneDraw']>>(async () => ({
      ...preview,
      zones: oneZone,
    }));
    const client = stubClient({
      listZones: () => Promise.resolve(oneZone),
      listGroups: () => Promise.resolve(oneGroup),
      listRegistrations: () => Promise.resolve(entrants),
      previewZoneDraw,
      confirmZoneDraw,
    });
    render(
      withIntl(
        <ZoneGroupRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findAllByText('Zone 1');
    const region = zoneAssignRegion();
    fireEvent.change(within(region).getByLabelText('Number of zones'), {
      target: { value: '2' },
    });
    fireEvent.change(within(region).getByLabelText('Draw seed'), { target: { value: '7' } });
    await act(async () => {
      fireEvent.click(within(region).getByText('Preview draw'));
    });
    expect(previewZoneDraw).toHaveBeenCalledWith('liga-mendocina', 'apertura', 1, {
      zoneCount: 2,
      seed: 7,
    });
    await screen.findByText(/Preview ready/);

    await act(async () => {
      fireEvent.click(within(region).getByText('Confirm draw'));
    });
    expect(confirmZoneDraw).toHaveBeenCalledWith('liga-mendocina', 'apertura', 1, {
      zoneCount: 2,
      seed: 7,
    });
    await screen.findByText('Assignment saved.');
  });

  it('saves a manual zone assignment', async () => {
    const assignZonesManually = jest.fn<NonNullable<ControlApiClient['assignZonesManually']>>(
      async () => ({
        assignment: { groups: { 'entrant-1': 1 } },
        zones: oneZone,
      }),
    );
    const client = stubClient({
      listZones: () => Promise.resolve(oneZone),
      listGroups: () => Promise.resolve(oneGroup),
      listRegistrations: () => Promise.resolve(entrants),
      assignZonesManually,
    });
    render(
      withIntl(
        <ZoneGroupRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findAllByText('Zone 1');
    const region = zoneAssignRegion();
    fireEvent.click(within(region).getByText('Manual placement'));
    fireEvent.change(screen.getByLabelText('Team A — number'), { target: { value: '1' } });
    // A non-numeric entry is dropped rather than sent as a placement.
    fireEvent.change(screen.getByLabelText('Team B — number'), { target: { value: 'x' } });
    await act(async () => {
      fireEvent.click(within(region).getByText('Save assignment'));
    });

    expect(assignZonesManually).toHaveBeenCalledWith('liga-mendocina', 'apertura', 1, {
      assignment: { groups: { 'entrant-1': 1 } },
      zoneCount: 1,
    });
    await screen.findByText('Assignment saved.');
  });

  it('previews and confirms an automatic group draw', async () => {
    const preview: DrawPreviewResponse = {
      assignment: { groups: { 'entrant-1': 1, 'entrant-2': 2 } },
      seed: 3,
      steps: 1,
    };
    const previewGroupDraw = jest.fn<NonNullable<ControlApiClient['previewGroupDraw']>>(
      async () => preview,
    );
    const confirmGroupDraw = jest.fn<NonNullable<ControlApiClient['confirmGroupDraw']>>(
      async () => ({ ...preview, groups: oneGroup }),
    );
    const client = stubClient({
      listZones: () => Promise.resolve(oneZone),
      listGroups: () => Promise.resolve(oneGroup),
      listRegistrations: () => Promise.resolve(entrants),
      previewGroupDraw,
      confirmGroupDraw,
    });
    render(
      withIntl(
        <ZoneGroupRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findAllByText('Zone 1');
    const region = groupAssignRegion();
    fireEvent.change(within(region).getByLabelText('Number of groups'), {
      target: { value: '2' },
    });
    fireEvent.change(within(region).getByLabelText('Draw seed'), { target: { value: '3' } });
    await act(async () => {
      fireEvent.click(within(region).getByText('Preview draw'));
    });
    expect(previewGroupDraw).toHaveBeenCalledWith('liga-mendocina', 'apertura', 1, 1, {
      groupCount: 2,
      seed: 3,
    });
    await screen.findByText(/Preview ready/);

    await act(async () => {
      fireEvent.click(within(region).getByText('Confirm draw'));
    });
    expect(confirmGroupDraw).toHaveBeenCalledWith('liga-mendocina', 'apertura', 1, 1, {
      groupCount: 2,
      seed: 3,
    });
    await screen.findByText('Assignment saved.');
  });

  it('saves a manual group assignment', async () => {
    const assignGroupsManually = jest.fn<NonNullable<ControlApiClient['assignGroupsManually']>>(
      async () => ({ assignment: { groups: { 'entrant-1': 1 } }, groups: oneGroup }),
    );
    const client = stubClient({
      listZones: () => Promise.resolve(oneZone),
      listGroups: () => Promise.resolve(oneGroup),
      listRegistrations: () => Promise.resolve(entrants),
      fetchZoneEntrants: () => Promise.resolve(entrants.map((entrant) => entrant.entrantId)),
      assignGroupsManually,
    });
    render(
      withIntl(
        <ZoneGroupRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findAllByText('Zone 1');
    const region = groupAssignRegion();
    fireEvent.click(within(region).getByText('Manual placement'));
    await within(region).findByLabelText('Team A — number');
    fireEvent.change(within(region).getByLabelText('Team A — number'), { target: { value: '1' } });
    // A non-numeric entry is dropped rather than sent as a placement.
    fireEvent.change(within(region).getByLabelText('Team B — number'), { target: { value: 'x' } });
    await act(async () => {
      fireEvent.click(within(region).getByText('Save assignment'));
    });

    expect(assignGroupsManually).toHaveBeenCalledWith('liga-mendocina', 'apertura', 1, 1, {
      assignment: { groups: { 'entrant-1': 1 } },
      groupCount: 1,
    });
    await screen.findByText('Assignment saved.');
  });

  it('reports a save failure with the server refusal message', async () => {
    const client = stubClient({
      listZones: () => Promise.resolve(oneZone),
      listGroups: () => Promise.resolve(oneGroup),
      listRegistrations: () => Promise.resolve(entrants),
      createZone: () => Promise.reject(new ControlApiError(409, 'La zona ya existe')),
    });
    render(
      withIntl(
        <ZoneGroupRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findAllByText('Zone 1');
    fireEvent.change(screen.getByLabelText('New zone name'), { target: { value: 'Zone 2' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Add zone'));
    });

    await screen.findByText('La zona ya existe');
  });

  it('reports every other mutation failure with the server refusal message', async () => {
    const refused = () => Promise.reject(new ControlApiError(409, 'Rechazado'));
    const zonePreview: DrawPreviewResponse = {
      assignment: { groups: { 'entrant-1': 1 } },
      seed: 1,
      steps: 1,
    };
    const groupPreview: DrawPreviewResponse = {
      assignment: { groups: { 'entrant-1': 1 } },
      seed: 1,
      steps: 1,
    };
    const client = stubClient({
      listZones: () => Promise.resolve(oneZone),
      listGroups: () => Promise.resolve(oneGroup),
      listRegistrations: () => Promise.resolve(entrants),
      fetchZoneEntrants: () => Promise.resolve(entrants.map((entrant) => entrant.entrantId)),
      createGroup: refused,
      previewZoneDraw: async () => zonePreview,
      confirmZoneDraw: refused,
      assignZonesManually: refused,
      previewGroupDraw: async () => groupPreview,
      confirmGroupDraw: refused,
      assignGroupsManually: refused,
    });
    render(
      withIntl(
        <ZoneGroupRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findAllByText('Zone 1');

    // createGroup
    fireEvent.change(screen.getByLabelText('New group name'), { target: { value: 'Group 2' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Add group'));
    });
    await waitFor(() => expect(screen.getAllByText('Rechazado')).toHaveLength(1));

    // previewZoneDraw succeeds (enabling Confirm), confirmZoneDraw refuses
    const zoneRegion = zoneAssignRegion();
    await act(async () => {
      fireEvent.click(within(zoneRegion).getByText('Preview draw'));
    });
    await within(zoneRegion).findByText(/Preview ready/);
    await act(async () => {
      fireEvent.click(within(zoneRegion).getByText('Confirm draw'));
    });
    await waitFor(() => expect(screen.getAllByText('Rechazado')).toHaveLength(2));

    // assignZonesManually
    fireEvent.click(within(zoneRegion).getByText('Manual placement'));
    fireEvent.change(within(zoneRegion).getByLabelText('Team A — number'), {
      target: { value: '1' },
    });
    await act(async () => {
      fireEvent.click(within(zoneRegion).getByText('Save assignment'));
    });
    await waitFor(() => expect(screen.getAllByText('Rechazado')).toHaveLength(3));
    fireEvent.click(within(zoneRegion).getByText('Automatic draw'));

    // previewGroupDraw succeeds (enabling Confirm), confirmGroupDraw refuses
    const groupRegion = groupAssignRegion();
    await act(async () => {
      fireEvent.click(within(groupRegion).getByText('Preview draw'));
    });
    await within(groupRegion).findByText(/Preview ready/);
    await act(async () => {
      fireEvent.click(within(groupRegion).getByText('Confirm draw'));
    });
    await waitFor(() => expect(screen.getAllByText('Rechazado')).toHaveLength(4));

    // assignGroupsManually
    fireEvent.click(within(groupRegion).getByText('Manual placement'));
    await within(groupRegion).findByLabelText('Team A — number');
    fireEvent.change(within(groupRegion).getByLabelText('Team A — number'), {
      target: { value: '1' },
    });
    await act(async () => {
      fireEvent.click(within(groupRegion).getByText('Save assignment'));
    });
    await waitFor(() => expect(screen.getAllByText('Rechazado')).toHaveLength(5));
    fireEvent.click(within(groupRegion).getByText('Automatic draw'));
  });

  it('ignores a confirm click for a preview method with no matching confirm method', async () => {
    const zonePreview: DrawPreviewResponse = {
      assignment: { groups: { 'entrant-1': 1 } },
      seed: 1,
      steps: 1,
    };
    const groupPreview: DrawPreviewResponse = { ...zonePreview };
    const client = stubClient({
      listZones: () => Promise.resolve(oneZone),
      listGroups: () => Promise.resolve(oneGroup),
      listRegistrations: () => Promise.resolve(entrants),
      previewZoneDraw: async () => zonePreview,
      previewGroupDraw: async () => groupPreview,
    });
    render(
      withIntl(
        <ZoneGroupRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findAllByText('Zone 1');
    const zoneRegion = zoneAssignRegion();
    await act(async () => {
      fireEvent.click(within(zoneRegion).getByText('Preview draw'));
    });
    await within(zoneRegion).findByText(/Preview ready/);
    await act(async () => {
      fireEvent.click(within(zoneRegion).getByText('Confirm draw'));
    });
    expect(screen.queryByText('Assignment saved.')).toBeNull();

    const groupRegion = groupAssignRegion();
    await act(async () => {
      fireEvent.click(within(groupRegion).getByText('Preview draw'));
    });
    await within(groupRegion).findByText(/Preview ready/);
    await act(async () => {
      fireEvent.click(within(groupRegion).getByText('Confirm draw'));
    });
    expect(screen.queryByText('Assignment saved.')).toBeNull();
  });

  it('reports a create-zone failure that is not a ControlApiError', async () => {
    const client = stubClient({
      listZones: () => Promise.resolve(oneZone),
      listGroups: () => Promise.resolve(oneGroup),
      listRegistrations: () => Promise.resolve(entrants),
      createZone: () => Promise.reject(new Error('network down')),
    });
    render(
      withIntl(
        <ZoneGroupRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findAllByText('Zone 1');
    fireEvent.change(screen.getByLabelText('New zone name'), { target: { value: 'Zone 2' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Add zone'));
    });

    await screen.findByText('The request could not be completed. Try again.');
  });

  it('reports a draw preview failure for both zones and groups', async () => {
    const refused = () => Promise.reject(new ControlApiError(409, 'Rechazado'));
    const client = stubClient({
      listZones: () => Promise.resolve(oneZone),
      listGroups: () => Promise.resolve(oneGroup),
      listRegistrations: () => Promise.resolve(entrants),
      previewZoneDraw: refused,
      previewGroupDraw: refused,
    });
    render(
      withIntl(
        <ZoneGroupRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findAllByText('Zone 1');
    await act(async () => {
      fireEvent.click(within(zoneAssignRegion()).getByText('Preview draw'));
    });
    await waitFor(() => expect(screen.getAllByText('Rechazado')).toHaveLength(1));
    await act(async () => {
      fireEvent.click(within(groupAssignRegion()).getByText('Preview draw'));
    });
    await waitFor(() => expect(screen.getAllByText('Rechazado')).toHaveLength(2));
  });

  it('tolerates a failed group/entrant fetch for the selected zone', async () => {
    const client = stubClient({
      listZones: () => Promise.resolve(oneZone),
      listGroups: () => Promise.reject(new Error('down')),
      listRegistrations: () => Promise.resolve(entrants),
      fetchZoneEntrants: () => Promise.reject(new Error('down')),
    });
    render(
      withIntl(
        <ZoneGroupRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findAllByText('Zone 1');
    const groupsPanel = screen.getByRole('region', { name: 'Groups' });
    await waitFor(() => expect(within(groupsPanel).queryByRole('listitem')).toBeNull());
  });

  it('loads groups scoped to the selected zone and creates a group', async () => {
    const zones: readonly ZoneResponse[] = [
      { zoneId: 'zone-1', stageId: 'stage-1', number: 1, name: 'Zone 1' },
      { zoneId: 'zone-2', stageId: 'stage-1', number: 2, name: 'Zone 2' },
    ];
    const groupsByZone = new Map<number, GroupResponse[]>([
      [1, [{ groupId: 'group-1', zoneId: 'zone-1', number: 1, name: 'Group 1' }]],
      [2, []],
    ]);
    const createGroup = jest.fn(
      async (
        _org: string,
        _tournament: string,
        _stage: number,
        zoneNumber: number,
        body: CreateZoneOrGroupRequest,
      ) => {
        const created: GroupResponse = {
          groupId: 'group-2',
          zoneId: 'zone-2',
          number: 1,
          name: body.name,
        };
        groupsByZone.set(zoneNumber, [...(groupsByZone.get(zoneNumber) ?? []), created]);
        return created;
      },
    );
    const client = stubClient({
      listZones: () => Promise.resolve(zones),
      listGroups: (_org, _tournament, _stage, zoneNumber) =>
        Promise.resolve(groupsByZone.get(zoneNumber) ?? []),
      listRegistrations: () => Promise.resolve(entrants),
      createGroup,
    });
    render(
      withIntl(
        <ZoneGroupRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findByText('Group 1');
    fireEvent.change(screen.getByLabelText('Zone'), { target: { value: '2' } });
    await waitFor(() => expect(screen.queryByText('Group 1')).toBeNull());

    // An empty name is a no-op — the guard short-circuits before any call.
    await act(async () => {
      fireEvent.click(screen.getByText('Add group'));
    });
    expect(createGroup).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('New group name'), { target: { value: 'Group 2' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Add group'));
    });

    expect(createGroup).toHaveBeenCalledWith('liga-mendocina', 'apertura', 1, 2, {
      name: 'Group 2',
    });
    await waitFor(() => expect(screen.getByText('Group 2')).toBeTruthy());
  });

  it('reports a zone/group load it could not complete', async () => {
    const client = stubClient({
      listZones: () => Promise.reject(new Error('down')),
      listRegistrations: () => Promise.reject(new Error('down')),
    });
    render(
      withIntl(
        <ZoneGroupRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Could not load zones and groups.'),
    );
  });

  it('does not update state after unmounting mid-fetch', async () => {
    let resolveZones: (() => void) | undefined;
    const client = stubClient({
      listZones: () =>
        new Promise((resolve) => {
          resolveZones = () => resolve(oneZone);
        }),
      listRegistrations: () => Promise.resolve(entrants),
    });
    const { unmount } = render(
      withIntl(
        <ZoneGroupRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    unmount();
    await act(async () => {
      resolveZones?.();
      await Promise.resolve();
    });
    // No React "state update on an unmounted component" warning, and no
    // crash — the effect's `live` guard swallowed the late resolution.
  });

  it('does not update state after unmounting mid-fetch failure', async () => {
    let rejectZones: (() => void) | undefined;
    const client = stubClient({
      listZones: () =>
        new Promise((_resolve, reject) => {
          rejectZones = () => reject(new Error('down'));
        }),
      listRegistrations: () => Promise.resolve(entrants),
    });
    const { unmount } = render(
      withIntl(
        <ZoneGroupRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    unmount();
    await act(async () => {
      rejectZones?.();
      await Promise.resolve();
    });
  });

  it('falls back to a shortened entrant id when the entrant record has no display name', async () => {
    const client = stubClient({
      listZones: () => Promise.resolve(oneZone),
      listGroups: () => Promise.resolve(oneGroup),
      listRegistrations: () => Promise.resolve(entrants),
      fetchZoneEntrants: () => Promise.resolve(['unknown-entrant-99999999']),
    });
    render(
      withIntl(
        <ZoneGroupRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findAllByText('Zone 1');
    fireEvent.click(within(groupAssignRegion()).getByText('Manual placement'));
    await screen.findByText('99999999');
  });

  it('reloads through a client with no listZones after creating a zone', async () => {
    const createZone = jest.fn<NonNullable<ControlApiClient['createZone']>>(async () => ({
      zoneId: 'zone-2',
      stageId: 'stage-1',
      number: 2,
      name: 'Zone 2',
    }));
    const client = stubClientMinimal({
      listRegistrations: () => Promise.resolve(entrants),
      createZone,
    });
    render(
      withIntl(
        <ZoneGroupRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findByText('Zones and groups');
    fireEvent.change(screen.getByLabelText('New zone name'), { target: { value: 'Zone 2' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Add zone'));
    });
    expect(createZone).toHaveBeenCalled();
  });

  it('renders no zone list and no create form when the client has no listZones/createZone', async () => {
    const client = stubClientMinimal({
      listRegistrations: () => Promise.resolve(entrants),
    });
    render(
      withIntl(
        <ZoneGroupRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findByText('Zones and groups');
    expect(screen.queryByLabelText('New zone name')).toBeNull();

    const zoneRegion = zoneAssignRegion();
    await act(async () => {
      fireEvent.click(within(zoneRegion).getByText('Preview draw'));
    });
    await act(async () => {
      fireEvent.click(within(zoneRegion).getByText('Confirm draw'));
    });
    fireEvent.click(within(zoneRegion).getByText('Manual placement'));
    await act(async () => {
      fireEvent.click(within(zoneRegion).getByText('Save assignment'));
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders no group create form and ignores group actions when the client has no group-mutation methods', async () => {
    const client = stubClientMinimal({
      listZones: () => Promise.resolve(oneZone),
      listGroups: () => Promise.resolve(oneGroup),
      listRegistrations: () => Promise.resolve(entrants),
    });
    render(
      withIntl(
        <ZoneGroupRoute
          client={client}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura"
        />,
      ),
    );

    await screen.findByText('Group 1');
    expect(screen.queryByLabelText('New group name')).toBeNull();

    const groupRegion = groupAssignRegion();
    await act(async () => {
      fireEvent.click(within(groupRegion).getByText('Preview draw'));
    });
    await act(async () => {
      fireEvent.click(within(groupRegion).getByText('Confirm draw'));
    });
    fireEvent.click(within(groupRegion).getByText('Manual placement'));
    await act(async () => {
      fireEvent.click(within(groupRegion).getByText('Save assignment'));
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

function stubClient(overrides: Partial<ControlApiClient>): ControlApiClient {
  return {
    ...requiredClient(),
    listZones: () => Promise.resolve([]),
    listGroups: () => Promise.resolve([]),
    ...overrides,
  };
}

/** No zone/group optional methods by default — exercises the `?.()`/`&&` fallbacks a full `stubClient()` never reaches. */
function stubClientMinimal(overrides: Partial<ControlApiClient>): ControlApiClient {
  return { ...requiredClient(), ...overrides };
}

function requiredClient(): ControlApiClient {
  return {
    listMyOrganizations: () => Promise.resolve([]),
    listDisciplines: () => Promise.resolve([]),
    createTournament: () => Promise.reject(new Error('not used')),
    listRegistrations: () => Promise.resolve([]),
    bulkReview: () => Promise.reject(new Error('not used')),
    reviewRegistration: () => Promise.reject(new Error('not used')),
    fetchStandings: () => Promise.reject(new Error('not used')),
    fetchTiebreakTrace: () => Promise.reject(new Error('not used')),
    fetchTableLayouts: () => Promise.resolve([]),
    fetchTableProjection: () => Promise.reject(new Error('not used')),
    fetchSeeding: () => Promise.reject(new Error('not used')),
    publishSeeding: () => Promise.reject(new Error('not used')),
    listOrganizationRoles: () => Promise.resolve([]),
    inviteOrganizationUser: () => Promise.reject(new Error('not used')),
    changeOrganizationRole: () => Promise.reject(new Error('not used')),
    deleteOrganizationRole: () => Promise.reject(new Error('not used')),
  };
}
