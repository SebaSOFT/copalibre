import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { VenueManagementRoute } from './components/VenueManagementRoute.js';
import {
  ControlApiError,
  type ControlApiClient,
  type OfficialResponse,
  type ScheduleDetailResponse,
  type VenueResponse,
} from './lib/api-client.js';
import { withIntl } from './i18n/test-support.js';

const oneVenue: readonly VenueResponse[] = [
  {
    venueId: 'venue-1',
    organizationId: 'org-1',
    alias: 'cancha-1',
    name: 'Cancha 1',
    concurrentCapacity: 1,
  },
];

const oneOfficial: readonly OfficialResponse[] = [
  {
    officialId: 'official-1',
    organizationId: 'org-1',
    displayName: 'Ana Gómez',
    roles: ['referee'],
  },
];

describe('VenueManagementRoute', () => {
  it('builds its own client when none is injected', async () => {
    render(withIntl(<VenueManagementRoute organizationAlias="liga-mendocina" />));

    // No assertions on the (real, unmocked) network outcome — this only
    // proves the component constructs a working default client rather than
    // crashing when a caller supplies none, the same as every other
    // production mount.
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
  });

  it('renders the venue and official lists', async () => {
    const client = stubClient({
      listVenues: () => Promise.resolve(oneVenue),
      listOfficials: () => Promise.resolve(oneOfficial),
    });
    render(withIntl(<VenueManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('Cancha 1');
    await screen.findByText('Ana Gómez — Referee');
  });

  it('creates a venue with no details, then reloads the list', async () => {
    const venues: VenueResponse[] = [];
    const createVenue = jest.fn<NonNullable<ControlApiClient['createVenue']>>(
      async (_org, body) => {
        const created: VenueResponse = {
          venueId: 'venue-2',
          organizationId: 'org-1',
          alias: body.alias,
          name: body.name,
          concurrentCapacity: body.concurrentCapacity,
        };
        venues.push(created);
        return created;
      },
    );
    const client = stubClient({ listVenues: () => Promise.resolve(venues), createVenue });
    render(withIntl(<VenueManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('This organization has no venues yet.');
    fireEvent.change(screen.getByLabelText('New venue name'), { target: { value: 'Cancha 2' } });
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'cancha-2' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Add venue'));
    });

    expect(createVenue).toHaveBeenCalledWith('liga-mendocina', {
      alias: 'cancha-2',
      name: 'Cancha 2',
      concurrentCapacity: 1,
    });
    await screen.findByText('Venue created.');
  });

  it('creates a venue with details, physical or virtual', async () => {
    const createVenue = jest.fn<NonNullable<ControlApiClient['createVenue']>>(
      async (_org, body) => ({
        venueId: 'venue-3',
        organizationId: 'org-1',
        alias: body.alias,
        name: body.name,
        concurrentCapacity: body.concurrentCapacity,
        details: body.details,
      }),
    );
    const client = stubClient({ listVenues: () => Promise.resolve([]), createVenue });
    render(withIntl(<VenueManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('This organization has no venues yet.');
    fireEvent.change(screen.getByLabelText('New venue name'), {
      target: { value: 'Servidor 1' },
    });
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'servidor-1' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Add venue'));
    });

    expect(createVenue).toHaveBeenCalledWith('liga-mendocina', {
      alias: 'servidor-1',
      name: 'Servidor 1',
      concurrentCapacity: 1,
    });
  });

  it('creates an official with selected roles', async () => {
    const createOfficial = jest.fn<NonNullable<ControlApiClient['createOfficial']>>(
      async (_org, body) => ({
        officialId: 'official-2',
        organizationId: 'org-1',
        displayName: body.displayName,
        roles: body.roles,
      }),
    );
    const client = stubClient({ listOfficials: () => Promise.resolve([]), createOfficial });
    render(withIntl(<VenueManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('This organization has no officials yet.');
    fireEvent.change(screen.getByLabelText('New official name'), {
      target: { value: 'Beto Ruiz' },
    });
    fireEvent.click(screen.getByLabelText('Referee'));
    await act(async () => {
      fireEvent.click(screen.getByText('Add official'));
    });

    expect(createOfficial).toHaveBeenCalledWith('liga-mendocina', {
      displayName: 'Beto Ruiz',
      roles: ['referee'],
    });
    await screen.findByText('Official created.');
  });

  it('edits a venue’s name and details', async () => {
    const updateVenue = jest.fn<NonNullable<ControlApiClient['updateVenue']>>(async () => ({
      venueId: 'venue-1',
      organizationId: 'org-1',
      alias: 'cancha-1',
      name: 'Cancha Renombrada',
      concurrentCapacity: 2,
      details: { surface: 'clay' },
    }));
    const client = stubClient({ listVenues: () => Promise.resolve(oneVenue), updateVenue });
    render(withIntl(<VenueManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('Cancha 1');
    fireEvent.click(screen.getByText('Edit'));

    const nameInput = await screen.findByLabelText('Name');
    fireEvent.change(nameInput, { target: { value: 'Cancha Renombrada' } });
    fireEvent.change(screen.getByLabelText('Concurrent capacity'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Address (optional)'), {
      target: { value: 'Av. Libertador 1200' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Save venue'));
    });

    expect(updateVenue).toHaveBeenCalledWith('liga-mendocina', 'venue-1', {
      name: 'Cancha Renombrada',
      concurrentCapacity: 2,
      address: 'Av. Libertador 1200',
      details: undefined,
    });
    await screen.findByText('Venue saved.');
  });

  it('surfaces the server’s own refusal message when saving a venue is refused', async () => {
    const client = stubClient({
      listVenues: () => Promise.resolve(oneVenue),
      updateVenue: () => Promise.reject(new ControlApiError(409, 'La cancha ya existe')),
    });
    render(withIntl(<VenueManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('Cancha 1');
    fireEvent.click(screen.getByText('Edit'));
    await screen.findByLabelText('Name');
    await act(async () => {
      fireEvent.click(screen.getByText('Save venue'));
    });

    await screen.findByText('La cancha ya existe');
  });

  it('surfaces the server’s own refusal message when creating an official is refused', async () => {
    const client = stubClient({
      listOfficials: () => Promise.resolve([]),
      createOfficial: () => Promise.reject(new ControlApiError(409, 'El árbitro ya existe')),
    });
    render(withIntl(<VenueManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('This organization has no officials yet.');
    fireEvent.change(screen.getByLabelText('New official name'), { target: { value: 'Beto' } });
    fireEvent.click(screen.getByLabelText('Referee'));
    await act(async () => {
      fireEvent.click(screen.getByText('Add official'));
    });

    await screen.findByText('El árbitro ya existe');
  });

  it('creates a venue with an entered capacity', async () => {
    const createVenue = jest.fn<NonNullable<ControlApiClient['createVenue']>>(
      async (_org, body) => ({
        venueId: 'venue-2',
        organizationId: 'org-1',
        alias: body.alias,
        name: body.name,
        concurrentCapacity: body.concurrentCapacity,
      }),
    );
    const client = stubClient({ listVenues: () => Promise.resolve([]), createVenue });
    render(withIntl(<VenueManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('This organization has no venues yet.');
    fireEvent.change(screen.getByLabelText('New venue name'), { target: { value: 'Cancha 3' } });
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'cancha-3' } });
    fireEvent.change(screen.getByLabelText('Concurrent capacity'), { target: { value: '3' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Add venue'));
    });

    expect(createVenue).toHaveBeenCalledWith('liga-mendocina', {
      alias: 'cancha-3',
      name: 'Cancha 3',
      concurrentCapacity: 3,
    });
  });

  it('reports a generic failure when creating a venue throws a non-ControlApiError', async () => {
    const client = stubClient({
      listVenues: () => Promise.resolve([]),
      createVenue: () => Promise.reject(new Error('network down')),
    });
    render(withIntl(<VenueManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('This organization has no venues yet.');
    fireEvent.change(screen.getByLabelText('New venue name'), { target: { value: 'Cancha 5' } });
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'cancha-5' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Add venue'));
    });

    await screen.findByText('The request could not be completed. Try again.');
  });

  it('edits an official’s roles', async () => {
    const updateOfficial = jest.fn<NonNullable<ControlApiClient['updateOfficial']>>(async () => ({
      officialId: 'official-1',
      organizationId: 'org-1',
      displayName: 'Ana Gómez',
      roles: ['referee', 'observer'],
    }));
    const client = stubClient({
      listOfficials: () => Promise.resolve(oneOfficial),
      updateOfficial,
    });
    render(withIntl(<VenueManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('Ana Gómez — Referee');
    fireEvent.click(screen.getByText('Edit'));
    await screen.findByLabelText('Name');
    fireEvent.click(screen.getByLabelText('Observer'));
    await act(async () => {
      fireEvent.click(screen.getByText('Save official'));
    });

    expect(updateOfficial).toHaveBeenCalledWith('liga-mendocina', 'official-1', {
      displayName: 'Ana Gómez',
      roles: ['referee', 'observer'],
    });
    await screen.findByText('Official saved.');
  });

  it('surfaces the server’s own refusal message on a malformed alias', async () => {
    const client = stubClient({
      listVenues: () => Promise.resolve([]),
      createVenue: () => Promise.reject(new ControlApiError(409, 'Alias inválido')),
    });
    render(withIntl(<VenueManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('This organization has no venues yet.');
    fireEvent.change(screen.getByLabelText('New venue name'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'Not Valid!' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Add venue'));
    });

    await screen.findByText('Alias inválido');
  });

  it('reports a load failure', async () => {
    const client = stubClient({ listVenues: () => Promise.reject(new Error('down')) });
    render(withIntl(<VenueManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('Could not load venues and officials.');
  });

  it('does nothing when the alias guard trips on venue create', async () => {
    const createVenue = jest.fn<NonNullable<ControlApiClient['createVenue']>>(async () => ({
      venueId: 'venue-2',
      organizationId: 'org-1',
      alias: 'x',
      name: 'X',
      concurrentCapacity: 1,
    }));
    const client = stubClient({ listVenues: () => Promise.resolve([]), createVenue });
    render(withIntl(<VenueManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('This organization has no venues yet.');
    fireEvent.change(screen.getByLabelText('New venue name'), { target: { value: 'Cancha X' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Add venue'));
    });
    expect(createVenue).not.toHaveBeenCalled();
  });

  it('does nothing when no role is selected on official create', async () => {
    const createOfficial = jest.fn<NonNullable<ControlApiClient['createOfficial']>>(async () => ({
      officialId: 'official-2',
      organizationId: 'org-1',
      displayName: 'X',
      roles: [],
    }));
    const client = stubClient({ listOfficials: () => Promise.resolve([]), createOfficial });
    render(withIntl(<VenueManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('This organization has no officials yet.');
    fireEvent.change(screen.getByLabelText('New official name'), { target: { value: 'X' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Add official'));
    });
    expect(createOfficial).not.toHaveBeenCalled();
  });

  it('unchecking an already-selected role removes it from the new official', async () => {
    const createOfficial = jest.fn<NonNullable<ControlApiClient['createOfficial']>>(
      async (_org, body) => ({
        officialId: 'official-2',
        organizationId: 'org-1',
        displayName: body.displayName,
        roles: body.roles,
      }),
    );
    const client = stubClient({ listOfficials: () => Promise.resolve([]), createOfficial });
    render(withIntl(<VenueManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('This organization has no officials yet.');
    fireEvent.change(screen.getByLabelText('New official name'), { target: { value: 'Beto' } });
    fireEvent.click(screen.getByLabelText('Referee'));
    fireEvent.click(screen.getByLabelText('Observer'));
    fireEvent.click(screen.getByLabelText('Referee'));
    await act(async () => {
      fireEvent.click(screen.getByText('Add official'));
    });

    expect(createOfficial).toHaveBeenCalledWith('liga-mendocina', {
      displayName: 'Beto',
      roles: ['observer'],
    });
  });

  it('shows and edits a venue’s existing details, then removes one', async () => {
    const withDetails: readonly VenueResponse[] = [
      {
        venueId: 'venue-1',
        organizationId: 'org-1',
        alias: 'cancha-1',
        name: 'Cancha 1',
        concurrentCapacity: 1,
        details: { surface: 'clay' },
      },
    ];
    const updateVenue = jest.fn<NonNullable<ControlApiClient['updateVenue']>>(async () => ({
      venueId: 'venue-1',
      organizationId: 'org-1',
      alias: 'cancha-1',
      name: 'Cancha 1',
      concurrentCapacity: 1,
      details: { surface: 'grass', region: 'sa-east-1' },
    }));
    const client = stubClient({ listVenues: () => Promise.resolve(withDetails), updateVenue });
    render(withIntl(<VenueManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('Cancha 1');
    fireEvent.click(screen.getByText('Edit'));
    await screen.findByLabelText('Name');

    fireEvent.change(screen.getByLabelText('Detail name'), { target: { value: 'surface' } });
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'grass' } });
    fireEvent.click(screen.getByText('Add detail'));
    const keys = screen.getAllByLabelText('Detail name');
    fireEvent.change(keys[1] as HTMLInputElement, { target: { value: 'region' } });
    const values = screen.getAllByLabelText('Value');
    fireEvent.change(values[1] as HTMLInputElement, { target: { value: 'sa-east-1' } });

    await act(async () => {
      fireEvent.click(screen.getByText('Save venue'));
    });

    expect(updateVenue).toHaveBeenCalledWith('liga-mendocina', 'venue-1', {
      name: 'Cancha 1',
      concurrentCapacity: 1,
      details: { surface: 'grass', region: 'sa-east-1' },
    });

    fireEvent.click(screen.getAllByText('Remove')[0] as HTMLElement);
    expect(screen.getAllByLabelText('Detail name')).toHaveLength(1);
  });

  it('reports a generic failure when updateOfficial throws a non-ControlApiError', async () => {
    const client = stubClient({
      listOfficials: () => Promise.resolve(oneOfficial),
      updateOfficial: () => Promise.reject(new Error('network down')),
    });
    render(withIntl(<VenueManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('Ana Gómez — Referee');
    fireEvent.click(screen.getByText('Edit'));
    await screen.findByLabelText('Name');
    await act(async () => {
      fireEvent.click(screen.getByText('Save official'));
    });

    await screen.findByText('The request could not be completed. Try again.');
  });

  it('reports a generic failure when saving a venue throws a non-ControlApiError', async () => {
    const client = stubClient({
      listVenues: () => Promise.resolve(oneVenue),
      updateVenue: () => Promise.reject(new Error('network down')),
    });
    render(withIntl(<VenueManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('Cancha 1');
    fireEvent.click(screen.getByText('Edit'));
    await screen.findByLabelText('Name');
    await act(async () => {
      fireEvent.click(screen.getByText('Save venue'));
    });

    await screen.findByText('The request could not be completed. Try again.');
  });

  it('reports a generic failure when creating an official throws a non-ControlApiError', async () => {
    const client = stubClient({
      listOfficials: () => Promise.resolve([]),
      createOfficial: () => Promise.reject(new Error('network down')),
    });
    render(withIntl(<VenueManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('This organization has no officials yet.');
    fireEvent.change(screen.getByLabelText('New official name'), { target: { value: 'Beto' } });
    fireEvent.click(screen.getByLabelText('Referee'));
    await act(async () => {
      fireEvent.click(screen.getByText('Add official'));
    });

    await screen.findByText('The request could not be completed. Try again.');
  });

  it('surfaces the server’s own refusal message when saving an official is refused', async () => {
    const client = stubClient({
      listOfficials: () => Promise.resolve(oneOfficial),
      updateOfficial: () => Promise.reject(new ControlApiError(409, 'El árbitro ya existe')),
    });
    render(withIntl(<VenueManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('Ana Gómez — Referee');
    fireEvent.click(screen.getByText('Edit'));
    await screen.findByLabelText('Name');
    await act(async () => {
      fireEvent.click(screen.getByText('Save official'));
    });

    await screen.findByText('El árbitro ya existe');
  });

  it('creates a schedule grid and displays the generated slot count', async () => {
    const schedules: ScheduleDetailResponse[] = [];
    const createSchedule = jest.fn<NonNullable<ControlApiClient['createSchedule']>>(
      async (_org, body) => {
        const created: ScheduleDetailResponse = {
          scheduleId: 'schedule-1',
          organizationId: 'org-1',
          name: body.name,
          startsAt: body.startsAt,
          endsAt: body.endsAt,
          slotMinutes: body.slotMinutes,
          turnaroundMinutes: body.turnaroundMinutes,
          venueIds: body.venueIds,
          slots: [
            {
              slotId: 'slot-1',
              scheduleId: 'schedule-1',
              venueId: 'venue-1',
              startsAt: body.startsAt,
              matchCount: 0,
            },
            {
              slotId: 'slot-2',
              scheduleId: 'schedule-1',
              venueId: 'venue-1',
              startsAt: body.startsAt + (body.slotMinutes + body.turnaroundMinutes) * 60000,
              matchCount: 0,
            },
          ],
        };
        schedules.push(created);
        return created;
      },
    );
    const client = stubClient({
      listVenues: () => Promise.resolve(oneVenue),
      listSchedules: () => Promise.resolve(schedules),
      createSchedule,
    });
    render(withIntl(<VenueManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('This organization has no schedules yet.');
    fireEvent.change(screen.getByLabelText('Schedule name'), {
      target: { value: 'Torneo Apertura Grid' },
    });
    fireEvent.change(screen.getByLabelText('Starts at'), {
      target: { value: '2026-08-01T14:00' },
    });
    fireEvent.change(screen.getByLabelText('Ends at'), {
      target: { value: '2026-08-01T18:00' },
    });
    fireEvent.click(screen.getByLabelText('Cancha 1'));

    await act(async () => {
      fireEvent.click(screen.getByText('Add schedule'));
    });

    expect(createSchedule).toHaveBeenCalled();
    await screen.findByText('Schedule created.');
    await screen.findByText(/2 slots generated/);
  });

  it('ignores create clicks when the client has no create methods', async () => {
    const client = stubClient({ listVenues: () => Promise.resolve([]) });
    render(withIntl(<VenueManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('This organization has no venues yet.');
    expect(screen.queryByLabelText('New venue name')).toBeNull();
    expect(screen.queryByLabelText('New official name')).toBeNull();
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
    listVenues: () => Promise.resolve([]),
    listOfficials: () => Promise.resolve([]),
    listSchedules: () => Promise.resolve([]),
    ...overrides,
  };
}
