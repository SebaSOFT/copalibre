import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ZoneGroupRoute } from './components/ZoneGroupRoute.js';
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
    await act(async () => {
      fireEvent.click(within(region).getByText('Save assignment'));
    });

    expect(assignZonesManually).toHaveBeenCalledWith('liga-mendocina', 'apertura', 1, {
      assignment: { groups: { 'entrant-1': 1 } },
      zoneCount: 1,
    });
    await screen.findByText('Assignment saved.');
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
});

function stubClient(overrides: Partial<ControlApiClient>): ControlApiClient {
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
    listZones: () => Promise.resolve([]),
    listGroups: () => Promise.resolve([]),
    ...overrides,
  };
}
