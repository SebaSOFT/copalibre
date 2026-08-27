import { render, screen, waitFor } from '@testing-library/react';
import { VenueManagementRoute } from './VenueManagementRoute.js';
import { withIntl } from '../i18n/test-support.js';
import type { ControlApiClient } from '../lib/api-client.js';

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

describe('VenueManagementRoute', () => {
  it('renders within ListScreenTemplate structure and displays venues and officials', async () => {
    const { container } = render(
      withIntl(<VenueManagementRoute client={stubClient()} organizationAlias="liga-mendocina" />),
    );

    await waitFor(() => screen.getByRole('heading', { level: 1, name: /venues & officials/i }));
    expect(container.querySelector('.cl-list-screen')).not.toBeNull();
    expect(container.querySelector('.cl-list-screen__header')).not.toBeNull();
    expect(container.querySelector('.cl-list-screen__listing')).not.toBeNull();
    expect(screen.getByText(/Estadio Feliciano Gambarte/i)).toBeDefined();
    expect(screen.getByText(/Patricio Loustau/i)).toBeDefined();
  });
});
