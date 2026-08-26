import { render, screen, waitFor } from '@testing-library/react';
import { PromotionPlanRoute } from './PromotionPlanRoute.js';
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
          planConfigured: true,
          groups: [],
        },
      ]),
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

describe('PromotionPlanRoute', () => {
  it('renders within ListScreenTemplate structure and displays promotion plan and preview', async () => {
    const { container } = render(
      withIntl(
        <PromotionPlanRoute
          client={stubClient()}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
          zoneNumber={1}
        />,
      ),
    );

    await waitFor(() => screen.getByRole('heading', { level: 1, name: /promotion plan/i }));
    expect(container.querySelector('.cl-list-screen')).not.toBeNull();
    expect(container.querySelector('.cl-list-screen__header')).not.toBeNull();
    expect(container.querySelector('.cl-list-screen__listing')).not.toBeNull();
    expect(screen.getByText(/ntrant-1/i)).toBeDefined();
    expect(screen.getByText(/ntrant-2/i)).toBeDefined();
  });
});
