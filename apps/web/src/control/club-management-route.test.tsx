import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ClubManagementRoute } from './components/ClubManagementRoute.js';
import { ControlApiError } from './lib/api-client.js';
import type { ClubResponse, ControlApiClient } from './lib/api-client.js';
import { withIntl } from './i18n/test-support.js';

const oneClub: readonly ClubResponse[] = [
  { clubId: 'club-1', organizationId: 'org-1', name: 'Casa de Italia', abbreviation: 'C I' },
];

describe('ClubManagementRoute', () => {
  it('renders the club list with a placeholder for a club with no emblem', async () => {
    const client = stubClient({ listClubs: () => Promise.resolve(oneClub) });
    render(withIntl(<ClubManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('Casa de Italia');
    expect(screen.getByTitle('No emblem uploaded')).toBeTruthy();
  });

  it('creates a club and reloads the list', async () => {
    const clubs: ClubResponse[] = [];
    const createClub = jest.fn<NonNullable<ControlApiClient['createClub']>>(async (_org, body) => {
      const created: ClubResponse = { clubId: 'club-2', organizationId: 'org-1', name: body.name };
      clubs.push(created);
      return created;
    });
    const client = stubClient({
      listClubs: () => Promise.resolve(clubs),
      createClub,
    });
    render(withIntl(<ClubManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('This organization has no clubs yet.');
    fireEvent.change(screen.getByLabelText('New club name'), {
      target: { value: 'Club Atenas' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Add club'));
    });

    expect(createClub).toHaveBeenCalledWith('liga-mendocina', { name: 'Club Atenas' });
    await screen.findByText('Club created.');
  });

  it('selects a club, edits its fields, and saves', async () => {
    const updateClub = jest.fn<NonNullable<ControlApiClient['updateClub']>>(async () => ({
      clubId: 'club-1',
      organizationId: 'org-1',
      name: 'Casa de Italia Renombrada',
      alias: 'casa-de-italia',
      abbreviation: 'CDI',
    }));
    const client = stubClient({
      listClubs: () => Promise.resolve(oneClub),
      updateClub,
    });
    render(withIntl(<ClubManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('Casa de Italia');
    fireEvent.click(screen.getByText('Edit'));

    const nameInput = await screen.findByLabelText('Name');
    fireEvent.change(nameInput, { target: { value: 'Casa de Italia Renombrada' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Save changes'));
    });

    expect(updateClub).toHaveBeenCalledWith('liga-mendocina', 'club-1', {
      name: 'Casa de Italia Renombrada',
      alias: '',
      abbreviation: 'C I',
    });
    await screen.findByText('Changes saved.');
  });

  it('uploads an emblem for the selected club', async () => {
    const uploadClubEmblem = jest.fn<NonNullable<ControlApiClient['uploadClubEmblem']>>(
      async () => ({ objectId: 'object-1' }),
    );
    const client = stubClient({
      listClubs: () => Promise.resolve(oneClub),
      uploadClubEmblem,
    });
    render(withIntl(<ClubManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('Casa de Italia');
    fireEvent.click(screen.getByText('Edit'));
    await screen.findByLabelText('Name');

    const file = new File(['fake-bytes'], 'emblem.png', { type: 'image/png' });
    const input = screen.getByLabelText('Upload emblem');
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(uploadClubEmblem).toHaveBeenCalledWith('liga-mendocina', 'club-1', {
        filename: 'emblem.png',
        contentType: 'image/png',
        contentBase64: expect.any(String),
      }),
    );
    await screen.findByText('Emblem uploaded.');
  });

  it('reports a save failure with the server refusal message', async () => {
    const client = stubClient({
      listClubs: () => Promise.resolve(oneClub),
      createClub: () => Promise.reject(new ControlApiError(409, 'El club ya existe')),
    });
    render(withIntl(<ClubManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('Casa de Italia');
    fireEvent.change(screen.getByLabelText('New club name'), {
      target: { value: 'Casa de Italia' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Add club'));
    });

    await screen.findByText('El club ya existe');
  });

  it('does not update state after unmounting mid-fetch', async () => {
    let resolveClubs: (() => void) | undefined;
    const client = stubClient({
      listClubs: () =>
        new Promise((resolve) => {
          resolveClubs = () => resolve(oneClub);
        }),
    });
    const { unmount } = render(
      withIntl(<ClubManagementRoute client={client} organizationAlias="liga-mendocina" />),
    );

    unmount();
    await act(async () => {
      resolveClubs?.();
      await Promise.resolve();
    });
  });

  it('does not update state after unmounting mid-fetch failure', async () => {
    let rejectClubs: (() => void) | undefined;
    const client = stubClient({
      listClubs: () =>
        new Promise((_resolve, reject) => {
          rejectClubs = () => reject(new Error('down'));
        }),
    });
    const { unmount } = render(
      withIntl(<ClubManagementRoute client={client} organizationAlias="liga-mendocina" />),
    );

    unmount();
    await act(async () => {
      rejectClubs?.();
      await Promise.resolve();
    });
  });

  it('does nothing when the empty name guard trips on create', async () => {
    const createClub = jest.fn<NonNullable<ControlApiClient['createClub']>>(async (_org, body) => ({
      clubId: 'club-2',
      organizationId: 'org-1',
      name: body.name,
    }));
    const client = stubClient({ listClubs: () => Promise.resolve(oneClub), createClub });
    render(withIntl(<ClubManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('Casa de Italia');
    await act(async () => {
      fireEvent.click(screen.getByText('Add club'));
    });
    expect(createClub).not.toHaveBeenCalled();
  });

  it('creates a club with an alias and abbreviation', async () => {
    const createClub = jest.fn<NonNullable<ControlApiClient['createClub']>>(async (_org, body) => ({
      clubId: 'club-2',
      organizationId: 'org-1',
      name: body.name,
      alias: body.alias,
      abbreviation: body.abbreviation,
    }));
    const client = stubClient({ listClubs: () => Promise.resolve(oneClub), createClub });
    render(withIntl(<ClubManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('Casa de Italia');
    fireEvent.change(screen.getByLabelText('New club name'), { target: { value: 'Club Atenas' } });
    fireEvent.change(screen.getByLabelText('Alias (optional)'), {
      target: { value: 'club-atenas' },
    });
    fireEvent.change(screen.getByLabelText('Abbreviation (optional)'), {
      target: { value: 'CA' },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Add club'));
    });

    expect(createClub).toHaveBeenCalledWith('liga-mendocina', {
      name: 'Club Atenas',
      alias: 'club-atenas',
      abbreviation: 'CA',
    });
  });

  it('reports a save-changes failure and does nothing when updateClub is absent', async () => {
    const client = stubClient({
      listClubs: () => Promise.resolve(oneClub),
      updateClub: () => Promise.reject(new Error('network down')),
    });
    render(withIntl(<ClubManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('Casa de Italia');
    fireEvent.click(screen.getByText('Edit'));
    await screen.findByLabelText('Name');
    await act(async () => {
      fireEvent.click(screen.getByText('Save changes'));
    });

    await screen.findByText('The request was refused.');
  });

  it('ignores a save-changes click when the client has no updateClub method', async () => {
    const client = stubClient({ listClubs: () => Promise.resolve(oneClub) });
    render(withIntl(<ClubManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('Casa de Italia');
    fireEvent.click(screen.getByText('Edit'));
    await screen.findByLabelText('Name');
    await act(async () => {
      fireEvent.click(screen.getByText('Save changes'));
    });

    expect(screen.queryByText('Changes saved.')).toBeNull();
  });

  it('reports an emblem-upload failure that is not a ControlApiError', async () => {
    const client = stubClient({
      listClubs: () => Promise.resolve(oneClub),
      uploadClubEmblem: () => Promise.reject(new Error('network down')),
    });
    render(withIntl(<ClubManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('Casa de Italia');
    fireEvent.click(screen.getByText('Edit'));
    await screen.findByLabelText('Name');

    const file = new File(['fake-bytes'], 'emblem.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Upload emblem'), { target: { files: [file] } });

    await screen.findByText('The request was refused.');
  });

  it('renders the emblem image for a club that has one', async () => {
    const withEmblem: readonly ClubResponse[] = [
      {
        clubId: 'club-1',
        organizationId: 'org-1',
        name: 'Casa de Italia',
        emblemObjectId: 'obj-1',
      },
    ];
    const client = stubClient({ listClubs: () => Promise.resolve(withEmblem) });
    render(withIntl(<ClubManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await screen.findByText('Casa de Italia');
    expect(screen.getByAltText('Casa de Italia emblem')).toBeTruthy();

    fireEvent.click(screen.getByText('Edit'));
    expect(await screen.findAllByAltText('Casa de Italia emblem')).toHaveLength(2);
  });

  it('reports a club load it could not complete', async () => {
    const client = stubClient({ listClubs: () => Promise.reject(new Error('down')) });
    render(withIntl(<ClubManagementRoute client={client} organizationAlias="liga-mendocina" />));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('Could not load clubs.'),
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
    listClubs: () => Promise.resolve([]),
    ...overrides,
  };
}
