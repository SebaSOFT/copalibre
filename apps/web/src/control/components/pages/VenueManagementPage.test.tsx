import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { jest } from '@jest/globals';
import { VenueManagementPage } from '../pages/VenueManagementPage.js';
import { withIntl } from '../../i18n/test-support.js';
import type { ControlApiClient } from '../../lib/api-client.js';

function stubClient(overrides: Partial<ControlApiClient> = {}): ControlApiClient {
  return {
    listVenues: () =>
      Promise.resolve([
        {
          venueId: 'venue-1',
          name: 'Estadio Feliciano Gambarte',
          alias: 'gambarte',
          concurrentCapacity: 1,
          pitches: [],
        },
      ]),
    listOfficials: () =>
      Promise.resolve([
        {
          officialId: 'off-1',
          displayName: 'Patricio Loustau',
          roles: ['referee'],
        },
      ]),
    listSchedules: () => Promise.resolve([]),
    createVenue: () =>
      Promise.resolve({
        venueId: 'venue-2',
        name: 'Estadio Bautista Gargantini',
        alias: 'gargantini',
        concurrentCapacity: 1,
        pitches: [],
      }),
    createOfficial: () =>
      Promise.resolve({
        officialId: 'off-2',
        displayName: 'Fernando Rapallini',
        roles: ['referee'],
      }),
    ...overrides,
  } as unknown as ControlApiClient;
}

describe('VenueManagementPage', () => {
  it('renders within ListScreenLayout structure and displays venues and officials', async () => {
    const { container } = render(
      withIntl(<VenueManagementPage client={stubClient()} organizationAlias="liga-mendocina" />),
    );

    await waitFor(() => screen.getByRole('heading', { level: 1, name: /venues & officials/i }));
    await screen.findByText(/Estadio Feliciano Gambarte/i);
    expect(container.querySelector('.cl-list-screen')).not.toBeNull();
    expect(container.querySelector('.cl-page-header')).not.toBeNull();
    expect(container.querySelector('.cl-list-screen__listing')).not.toBeNull();
    expect(screen.getByText(/Estadio Feliciano Gambarte/i)).toBeDefined();
    expect(screen.getByText(/Patricio Loustau/i)).toBeDefined();
  });

  it('removes a venue and restores it through the undo action', async () => {
    const deleteVenue = jest.fn<NonNullable<ControlApiClient['deleteVenue']>>(async () => ({
      success: true,
    }));
    const restoreVenue = jest.fn<NonNullable<ControlApiClient['restoreVenue']>>(async () => ({
      venueId: 'venue-1',
      organizationId: 'org-1',
      name: 'Estadio Feliciano Gambarte',
      alias: 'gambarte',
      concurrentCapacity: 1,
    }));
    render(
      withIntl(
        <VenueManagementPage
          client={stubClient({ deleteVenue, restoreVenue })}
          organizationAlias="liga-mendocina"
        />,
      ),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Edit venue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove venue' }));

    await screen.findByText('Venue removed.');
    expect(deleteVenue).toHaveBeenCalledWith('liga-mendocina', 'venue-1');

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    await screen.findByText('Venue restored.');
    expect(restoreVenue).toHaveBeenCalledWith('liga-mendocina', 'venue-1');
  });
});
