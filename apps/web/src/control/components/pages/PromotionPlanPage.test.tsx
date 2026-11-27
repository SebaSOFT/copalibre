import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  it('renders the plan within the page-header template and the preview as a candidate table', async () => {
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
    await screen.findByRole('cell', { name: 'Club Atlético' });
    expect(container.querySelector('.cl-page-header-template')).not.toBeNull();
    expect(container.querySelector('.cl-page-header')).not.toBeNull();
    expect(screen.getByRole('cell', { name: 'Deportivo Cuyo' })).toBeDefined();
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Position',
      'Entrant',
      'Position in group',
    ]);
    // A plan that was never saved offers its defaults for saving straight away.
    expect(screen.getByRole('button', { name: 'Save promotion plan' })).toBeDefined();
    expect(screen.queryByText(/entrant-[12]/)).toBeNull();
  });
  it('totals the slots from the band counts it holds and shows no total without bands', async () => {
    render(
      withIntl(
        <PromotionPlanPage
          client={stubClient()}
          organizationAlias="liga-mendocina"
          stageNumber={1}
          tournamentAlias="apertura-2026"
          zoneNumber={1}
        />,
      ),
    );

    await screen.findByRole('button', { name: 'Add band' });
    expect(screen.queryByText('slots across bands')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Add band' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add band' }));
    const counts = screen.getAllByLabelText('Count');
    fireEvent.change(counts[0] as HTMLElement, { target: { value: '3' } });
    fireEvent.change(counts[1] as HTMLElement, { target: { value: '2' } });

    const total = screen.getByText('slots across bands').closest('p');
    expect(total?.textContent).toBe('5slots across bands');
  });
});
