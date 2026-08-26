import { render, screen, waitFor } from '@testing-library/react';
import { ZoneGroupRoute } from './ZoneGroupRoute.js';
import { withIntl } from '../i18n/test-support.js';
import type { ControlApiClient } from '../lib/api-client.js';

function stubClient(overrides: Partial<ControlApiClient> = {}): ControlApiClient {
  return {
    listZones: () =>
      Promise.resolve([
        {
          stageNumber: 1,
          number: 1,
          name: 'Zona Campeonato',
          planConfigured: false,
          groups: [],
        },
      ]),
    listRegistrations: () =>
      Promise.resolve([
        {
          registrationId: 'reg-1',
          tournamentId: 't-1',
          entrantId: 'entrant-1',
          displayName: 'Godoy Cruz',
          registeredAt: '2026-01-01T00:00:00Z',
          status: 'accepted',
        },
      ]),
    listGroups: () =>
      Promise.resolve([
        {
          stageNumber: 1,
          zoneNumber: 1,
          number: 1,
          name: 'Grupo A',
        },
      ]),
    fetchZoneEntrants: () => Promise.resolve(['entrant-1']),
    createZone: () => Promise.resolve({ stageNumber: 1, number: 2, name: 'Zona Plata' }),
    createGroup: () =>
      Promise.resolve({ stageNumber: 1, zoneNumber: 1, number: 2, name: 'Grupo B' }),
    ...overrides,
  } as unknown as ControlApiClient;
}

describe('ZoneGroupRoute', () => {
  it('renders within ListScreenTemplate structure and displays zones and groups', async () => {
    const { container } = render(
      withIntl(
        <ZoneGroupRoute
          client={stubClient()}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByRole('heading', { level: 1, name: /zones and groups/i }));
    expect(container.querySelector('.cl-list-screen')).not.toBeNull();
    expect(container.querySelector('.cl-list-screen__header')).not.toBeNull();
    expect(container.querySelector('.cl-list-screen__listing')).not.toBeNull();
    expect(screen.getAllByText('Zona Campeonato').length).toBeGreaterThanOrEqual(1);
  });
});
