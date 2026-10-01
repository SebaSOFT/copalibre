import { jest } from '@jest/globals';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ClubManagementPage } from '../pages/ClubManagementPage.js';
import { withIntl } from '../../i18n/test-support.js';
import type { ControlApiClient } from '../../lib/api-client.js';

function stubClient(overrides: Partial<ControlApiClient> = {}): ControlApiClient {
  return {
    listMyOrganizations: () => Promise.resolve([]),
    listClubs: () =>
      Promise.resolve([
        {
          clubId: 'club-1',
          name: 'Club Atlético Huracán Las Heras',
          alias: 'huracan-las-heras',
          abbreviation: 'HLH',
        },
      ]),
    createClub: () => Promise.resolve({ clubId: 'club-2', name: 'Gimnasia' }),
    updateClub: () => Promise.resolve({ clubId: 'club-1', name: 'Updated' }),
    uploadClubEmblem: () => Promise.resolve(),
    ...overrides,
  } as unknown as ControlApiClient;
}

describe('ClubManagementPage', () => {
  it('renders within ListScreenLayout structure and displays club list', async () => {
    const { container } = render(
      withIntl(<ClubManagementPage client={stubClient()} organizationAlias="liga-mendocina" />),
    );

    await waitFor(() => screen.getByRole('heading', { level: 1, name: /clubs/i }));
    expect(container.querySelector('.cl-list-screen')).not.toBeNull();
    expect(container.querySelector('.cl-list-screen__header')).not.toBeNull();
    expect(container.querySelector('.cl-list-screen__listing')).not.toBeNull();
    expect(screen.getByText('Club Atlético Huracán Las Heras')).toBeDefined();
  });

  it('shows the Club Portal link when the role is unresolved (openspec 0301)', async () => {
    render(
      withIntl(<ClubManagementPage client={stubClient()} organizationAlias="liga-mendocina" />),
    );

    await waitFor(() => screen.getByRole('link', { name: /club portal/i }));
  });

  it('leaves the Club Portal link visible when the role lookup fails', async () => {
    render(
      withIntl(
        <ClubManagementPage
          client={stubClient({ listMyOrganizations: () => Promise.reject(new Error('boom')) })}
          organizationAlias="liga-mendocina"
        />,
      ),
    );

    await waitFor(() => screen.getByText('Club Atlético Huracán Las Heras'));
    expect(screen.getByRole('link', { name: /club portal/i })).toBeDefined();
  });

  it('hides the Club Portal link for a role without org.manage-club-members', async () => {
    render(
      withIntl(
        <ClubManagementPage
          client={stubClient({
            listMyOrganizations: () =>
              Promise.resolve([
                {
                  organizationId: 'org-1',
                  organizationAlias: 'liga-mendocina',
                  organizationName: 'Liga Mendocina',
                  role: 'referee' as const,
                },
              ]),
          })}
          organizationAlias="liga-mendocina"
        />,
      ),
    );

    await waitFor(() => screen.getByText('Club Atlético Huracán Las Heras'));
    expect(screen.queryByRole('link', { name: /club portal/i })).toBeNull();
  });

  it('edits a club’s alias and abbreviation', async () => {
    const updateClub = jest.fn(() =>
      Promise.resolve({
        clubId: 'club-1',
        organizationId: 'org-1',
        name: 'Club Atlético Huracán Las Heras',
        alias: 'nuevo-alias',
        abbreviation: 'NEW',
      }),
    );
    render(
      withIntl(
        <ClubManagementPage
          client={stubClient({ updateClub })}
          organizationAlias="liga-mendocina"
        />,
      ),
    );

    await waitFor(() => screen.getByText('Club Atlético Huracán Las Heras'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'nuevo-alias' } });
    fireEvent.change(screen.getByLabelText('Abbreviation'), { target: { value: 'NEW' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateClub).toHaveBeenCalled());
  });

  it('surfaces a load error when the reload after creating a club fails', async () => {
    let call = 0;
    render(
      withIntl(
        <ClubManagementPage
          client={stubClient({
            listClubs: () => {
              call += 1;
              return call === 1
                ? Promise.resolve([
                    {
                      clubId: 'club-1',
                      organizationId: 'org-1',
                      name: 'Club Atlético Huracán Las Heras',
                      alias: 'huracan-las-heras',
                      abbreviation: 'HLH',
                    },
                  ])
                : Promise.reject(new Error('boom'));
            },
          })}
          organizationAlias="liga-mendocina"
        />,
      ),
    );

    await waitFor(() => screen.getByText('Club Atlético Huracán Las Heras'));
    fireEvent.change(screen.getByLabelText('New club name'), { target: { value: 'Gimnasia' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add club' }));

    await waitFor(() => screen.getByText('Could not load clubs.'));
  });

  it('resets optimistic emblem when upload fails', async () => {
    const uploadClubEmblem = jest.fn(() => Promise.reject(new Error('fail')));
    render(
      withIntl(
        <ClubManagementPage
          client={stubClient({ uploadClubEmblem })}
          organizationAlias="liga-mendocina"
        />,
      ),
    );

    await waitFor(() => screen.getByText('Club Atlético Huracán Las Heras'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const file = new File(['fake-bytes'], 'emblem.png', { type: 'image/png' });
    const input = screen.getByLabelText('Upload emblem') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const dialog = await screen.findByRole('dialog');
    const img = await waitFor(() => {
      const element = dialog.querySelector('img');
      if (!element) throw new Error('cropper image not ready');
      return element;
    });
    fireEvent.load(img);
    await waitFor(() =>
      expect((screen.getByText('Use image') as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByText('Use image'));

    await waitFor(() => expect(uploadClubEmblem).toHaveBeenCalled());
  });

  it('cancels the emblem crop modal and leaves the placeholder intact', async () => {
    render(
      withIntl(<ClubManagementPage client={stubClient()} organizationAlias="liga-mendocina" />),
    );

    await waitFor(() => screen.getByText('Club Atlético Huracán Las Heras'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const file = new File(['fake-bytes'], 'emblem.png', { type: 'image/png' });
    const input = screen.getByLabelText('Upload emblem') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
