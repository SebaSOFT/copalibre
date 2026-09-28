import { jest } from '@jest/globals';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ClubPortalRosterPage } from './ClubPortalRosterPage.js';
import { withIntl } from '../../i18n/test-support.js';
import type { ControlApiClient } from '../../lib/api-client.js';

function stubClient(overrides: Partial<ControlApiClient> = {}): ControlApiClient {
  return {
    listClubMembers: () =>
      Promise.resolve([{ personId: 'person-1', displayName: 'Elías Salomón' }]),
    listClubTeams: () => Promise.resolve([{ teamId: 'team-1', name: 'Primer Equipo' }]),
    createClubTeam: (_organizationAlias: string, _clubId: string, request: { name: string }) =>
      Promise.resolve({ teamId: 'team-2', name: request.name }),
    submitClubRegistration: () =>
      Promise.resolve({
        entrantId: 'entrant-1',
        tournamentId: 't-1',
        status: 'pending',
        teamId: 'team-1',
      }),
    ...overrides,
  } as unknown as ControlApiClient;
}

describe('ClubPortalRosterPage', () => {
  it('lists the club’s own members and teams', async () => {
    render(
      withIntl(
        <ClubPortalRosterPage
          client={stubClient()}
          clubId="club-1"
          organizationAlias="liga"
          tournamentAlias="torneo"
        />,
      ),
    );

    await waitFor(() => screen.getByText('Elías Salomón'));
    expect(screen.getByText('Primer Equipo')).toBeDefined();
  });

  it('submits the assembled squad against the selected team', async () => {
    const submitClubRegistration = jest.fn(
      (
        _organizationAlias: string,
        _clubId: string,
        _tournamentAlias: string,
        request: { teamId: string; members: readonly { personId: string; role?: string }[] },
      ) =>
        Promise.resolve({
          entrantId: 'entrant-1',
          tournamentId: 't-1',
          status: 'pending' as const,
          teamId: request.teamId,
        }),
    );
    render(
      withIntl(
        <ClubPortalRosterPage
          client={stubClient({
            listClubMembers: () =>
              Promise.resolve([
                { personId: 'person-1', displayName: 'Elías Salomón' },
                { personId: 'person-2', displayName: 'Otro Miembro' },
              ]),
            submitClubRegistration,
          })}
          clubId="club-1"
          organizationAlias="liga"
          tournamentAlias="torneo"
        />,
      ),
    );

    await waitFor(() => screen.getByText('Elías Salomón'));
    fireEvent.click(screen.getByLabelText('Elías Salomón'));
    fireEvent.click(screen.getByLabelText('Otro Miembro'));
    // Toggling a member off exercises the checkbox's unchecked path.
    fireEvent.click(screen.getByLabelText('Otro Miembro'));
    fireEvent.change(screen.getByLabelText("Elías Salomón's role"), {
      target: { value: 'coach' },
    });
    fireEvent.change(screen.getByLabelText('Select a team'), { target: { value: 'team-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit registration' }));

    await waitFor(() => expect(submitClubRegistration).toHaveBeenCalled());
    expect(submitClubRegistration.mock.calls[0]?.[3]).toEqual(
      expect.objectContaining({
        teamId: 'team-1',
        members: [{ personId: 'person-1', role: 'coach' }],
      }),
    );
    await waitFor(() =>
      expect(screen.getAllByText('Registration submitted for review.').length).toBeGreaterThan(0),
    );
  });

  it('shows a load error when the initial fetch fails', async () => {
    render(
      withIntl(
        <ClubPortalRosterPage
          client={stubClient({ listClubMembers: () => Promise.reject(new Error('boom')) })}
          clubId="club-1"
          organizationAlias="liga"
          tournamentAlias="torneo"
        />,
      ),
    );

    await waitFor(() => screen.getByText("Could not load the club's members and teams."));
  });

  it('creates a new team from the form', async () => {
    render(
      withIntl(
        <ClubPortalRosterPage
          client={stubClient()}
          clubId="club-1"
          organizationAlias="liga"
          tournamentAlias="torneo"
        />,
      ),
    );

    await waitFor(() => screen.getByText('Elías Salomón'));
    fireEvent.change(screen.getByLabelText('New team name'), {
      target: { value: 'Segundo Equipo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));

    await waitFor(() => expect(screen.getAllByText('Segundo Equipo').length).toBeGreaterThan(0));
  });

  it('surfaces a toast error when creating a team is refused', async () => {
    render(
      withIntl(
        <ClubPortalRosterPage
          client={stubClient({ createClubTeam: () => Promise.reject(new Error('refused')) })}
          clubId="club-1"
          organizationAlias="liga"
          tournamentAlias="torneo"
        />,
      ),
    );

    await waitFor(() => screen.getByText('Elías Salomón'));
    fireEvent.change(screen.getByLabelText('New team name'), {
      target: { value: 'Segundo Equipo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create team' }));

    await waitFor(() => screen.getByText('The request could not be completed. Try again.'));
  });

  it('surfaces a toast error when submitting the registration is refused', async () => {
    render(
      withIntl(
        <ClubPortalRosterPage
          client={stubClient({
            submitClubRegistration: () => Promise.reject(new Error('refused')),
          })}
          clubId="club-1"
          organizationAlias="liga"
          tournamentAlias="torneo"
        />,
      ),
    );

    await waitFor(() => screen.getByText('Elías Salomón'));
    fireEvent.click(screen.getByLabelText('Elías Salomón'));
    fireEvent.change(screen.getByLabelText('Select a team'), { target: { value: 'team-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit registration' }));

    await waitFor(() => screen.getByText('The request could not be completed. Try again.'));
  });
});
