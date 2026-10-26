import { render, screen, waitFor } from '@testing-library/react';
import { PromotionPlanPage } from '../pages/PromotionPlanPage.js';
import { withIntl } from '../../i18n/test-support.js';
import type { ControlApiClient } from '../../lib/api-client.js';

function stubClient(overrides: Partial<ControlApiClient> = {}): ControlApiClient {
  return {
    listZones: () =>
      Promise.resolve([
        {
          stageNumber: 1,
          number: 1,
          name: 'Zona Campeonato',
          planConfigured: true,
          groups: [],
        },
      ]),
    listRegistrations: () => Promise.resolve([]),
    fetchPromotionPreview: () =>
      Promise.resolve({
        zoneNumber: 1,
        combined: [
          { entrantId: 'entrant-1', rankInCombined: 1, originGroupNumber: 1, rankInGroup: 1 },
          { entrantId: 'entrant-2', rankInCombined: 2, originGroupNumber: 2, rankInGroup: 1 },
        ],
        perGroupAdvance: 1,
      }),
    ...overrides,
  } as unknown as ControlApiClient;
}

describe('PromotionPlanPage', () => {
  it('renders within ListScreenLayout structure and displays promotion plan and preview', async () => {
    const { container } = render(
      withIntl(
        <PromotionPlanPage
          client={stubClient({
            listRegistrations: async () => [
              {
                entrantId: 'entrant-1',
                tournamentId: 'tournament-1',
                status: 'accepted',
                displayName: 'Club Atlético',
              },
              {
                entrantId: 'entrant-2',
                tournamentId: 'tournament-1',
                status: 'accepted',
                displayName: 'Deportivo Cuyo',
              },
            ],
          })}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
          zoneNumber={1}
        />,
      ),
    );

    await waitFor(() => screen.getByRole('heading', { level: 1, name: /promotion plan/i }));
    await screen.findByText((_, element) => element?.textContent === '1. Club Atlético');
    expect(container.querySelector('.cl-list-screen')).not.toBeNull();
    expect(container.querySelector('.cl-page-header')).not.toBeNull();
    expect(container.querySelector('.cl-list-screen__listing')).not.toBeNull();
    expect(
      screen.getByText((_, element) => element?.textContent === '2. Deportivo Cuyo'),
    ).toBeDefined();
    expect(screen.queryByText(/entrant-[12]/)).toBeNull();
  });
});
