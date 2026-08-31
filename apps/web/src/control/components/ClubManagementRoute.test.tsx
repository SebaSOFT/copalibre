import { render, screen, waitFor } from '@testing-library/react';
import { ClubManagementRoute } from './ClubManagementRoute.js';
import { withIntl } from '../i18n/test-support.js';
import type { ControlApiClient } from '../lib/api-client.js';

function stubClient(overrides: Partial<ControlApiClient> = {}): ControlApiClient {
  return {
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

describe('ClubManagementRoute', () => {
  it('renders within ListScreenTemplate structure and displays club list', async () => {
    const { container } = render(
      withIntl(<ClubManagementRoute client={stubClient()} organizationAlias="liga-mendocina" />),
    );

    await waitFor(() => screen.getByRole('heading', { level: 1, name: /clubs/i }));
    expect(container.querySelector('.cl-list-screen')).not.toBeNull();
    expect(container.querySelector('.cl-list-screen__header')).not.toBeNull();
    expect(container.querySelector('.cl-list-screen__listing')).not.toBeNull();
    expect(screen.getByText('Club Atlético Huracán Las Heras')).toBeDefined();
  });
});
