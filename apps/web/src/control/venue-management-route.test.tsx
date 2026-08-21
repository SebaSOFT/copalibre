import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { VenueManagementRoute } from './components/VenueManagementRoute.js';
import { ControlApiError } from './lib/api-client.js';
import type { ControlApiClient, OfficialResponse, VenueResponse } from './lib/api-client.js';
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
    await act(async () => {
      fireEvent.click(screen.getByText('Save venue'));
    });

    expect(updateVenue).toHaveBeenCalledWith('liga-mendocina', 'venue-1', {
      name: 'Cancha Renombrada',
      concurrentCapacity: 1,
      details: undefined,
    });
    await screen.findByText('Venue saved.');
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
    ...overrides,
  };
}
