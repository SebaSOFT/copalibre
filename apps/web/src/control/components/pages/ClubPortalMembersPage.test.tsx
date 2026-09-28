import { jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { ClubPortalMembersPage } from './ClubPortalMembersPage.js';
import { withIntl } from '../../i18n/test-support.js';
import type { ControlApiClient } from '../../lib/api-client.js';

function stubClient(overrides: Partial<ControlApiClient> = {}): ControlApiClient {
  return {
    listClubMembers: () =>
      Promise.resolve([{ personId: 'person-1', displayName: 'Elías Salomón' }]),
    createClubMember: (
      _organizationAlias: string,
      _clubId: string,
      request: { displayName: string },
    ) => Promise.resolve({ personId: 'person-2', displayName: request.displayName }),
    updateClubMember: (
      _organizationAlias: string,
      _clubId: string,
      personId: string,
      request: { displayName?: string; alias?: string },
    ) =>
      Promise.resolve({
        personId,
        displayName: request.displayName ?? 'Elías Salomón',
        alias: request.alias,
      }),
    ...overrides,
  } as unknown as ControlApiClient;
}

describe('ClubPortalMembersPage', () => {
  it('lists the club’s own members', async () => {
    render(
      withIntl(
        <ClubPortalMembersPage client={stubClient()} clubId="club-1" organizationAlias="liga" />,
      ),
    );

    await waitFor(() => screen.getByText('Elías Salomón'));
  });

  it('creates a new member from the form', async () => {
    const createClubMember = jest.fn(
      (_organizationAlias: string, _clubId: string, request: { displayName: string }) =>
        Promise.resolve({ personId: 'person-2', displayName: request.displayName }),
    );
    render(
      withIntl(
        <ClubPortalMembersPage
          client={stubClient({ createClubMember })}
          clubId="club-1"
          organizationAlias="liga"
        />,
      ),
    );

    await waitFor(() => screen.getByText('Elías Salomón'));
    fireEvent.change(screen.getByLabelText('New member name'), {
      target: { value: 'Nueva Persona' },
    });
    fireEvent.change(screen.getByLabelText('Alias (optional)'), {
      target: { value: 'nueva-persona' },
    });
    fireEvent.change(screen.getByLabelText('Birth date (optional)'), {
      target: { value: '2001-05-14' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => expect(createClubMember).toHaveBeenCalled());
    expect(createClubMember.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({
        displayName: 'Nueva Persona',
        alias: 'nueva-persona',
        birthDate: '2001-05-14',
      }),
    );
  });

  it('edits an existing member', async () => {
    const updateClubMember = jest.fn(
      (
        _organizationAlias: string,
        _clubId: string,
        personId: string,
        request: { displayName?: string; alias?: string },
      ) =>
        Promise.resolve({
          personId,
          displayName: request.displayName ?? 'Elías Salomón',
          alias: request.alias,
        }),
    );
    render(
      withIntl(
        <ClubPortalMembersPage
          client={stubClient({ updateClubMember })}
          clubId="club-1"
          organizationAlias="liga"
        />,
      ),
    );

    await waitFor(() => screen.getByText('Elías Salomón'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Nombre Corregido' } });
    fireEvent.change(screen.getByLabelText('Alias'), { target: { value: 'alias-corregido' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateClubMember).toHaveBeenCalled());
    expect(updateClubMember.mock.calls[0]?.[3]).toEqual(
      expect.objectContaining({ displayName: 'Nombre Corregido', alias: 'alias-corregido' }),
    );
  });

  it('surfaces a load error when the reload after creating a member fails', async () => {
    let call = 0;
    render(
      withIntl(
        <ClubPortalMembersPage
          client={stubClient({
            listClubMembers: () => {
              call += 1;
              return call === 1
                ? Promise.resolve([{ personId: 'person-1', displayName: 'Elías Salomón' }])
                : Promise.reject(new Error('boom'));
            },
          })}
          clubId="club-1"
          organizationAlias="liga"
        />,
      ),
    );

    await waitFor(() => screen.getByText('Elías Salomón'));
    fireEvent.change(screen.getByLabelText('New member name'), {
      target: { value: 'Nueva Persona' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => screen.getByText('Could not load members.'));
  });

  it('shows a load error when the initial fetch fails', async () => {
    render(
      withIntl(
        <ClubPortalMembersPage
          client={stubClient({ listClubMembers: () => Promise.reject(new Error('boom')) })}
          clubId="club-1"
          organizationAlias="liga"
        />,
      ),
    );

    await waitFor(() => screen.getByText('Could not load members.'));
  });

  it('surfaces a toast error when creating a member is refused', async () => {
    render(
      withIntl(
        <ClubPortalMembersPage
          client={stubClient({
            createClubMember: () => Promise.reject(new Error('refused')),
          })}
          clubId="club-1"
          organizationAlias="liga"
        />,
      ),
    );

    await waitFor(() => screen.getByText('Elías Salomón'));
    fireEvent.change(screen.getByLabelText('New member name'), {
      target: { value: 'Nueva Persona' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add member' }));

    await waitFor(() => screen.getByText('The request could not be completed. Try again.'));
  });

  it('surfaces a toast error when saving a member is refused', async () => {
    render(
      withIntl(
        <ClubPortalMembersPage
          client={stubClient({
            updateClubMember: () => Promise.reject(new Error('refused')),
          })}
          clubId="club-1"
          organizationAlias="liga"
        />,
      ),
    );

    await waitFor(() => screen.getByText('Elías Salomón'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => screen.getByText('The request could not be completed. Try again.'));
  });
});
