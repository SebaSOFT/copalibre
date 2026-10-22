import { expectFirstReadFailure } from './resilient-read.test-support.js';
import { render, screen, waitFor } from '@testing-library/react';
import { TournamentHubPage } from './TournamentHubPage.js';
import { withIntl } from '../../i18n/test-support.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { clearResilientReadCache } from './use-resilient-read.js';

function stubClient(overrides: Partial<ControlApiClient> = {}): ControlApiClient {
  return {
    listStages: () =>
      Promise.resolve([
        {
          stageId: 's-1',
          seasonId: 'season-1',
          number: 1,
          name: 'Fase de grupos',
          format: 'round-robin',
          seeded: true,
        },
        {
          stageId: 's-2',
          seasonId: 'season-1',
          number: 2,
          name: 'Playoffs',
          format: 'single-elimination',
          seeded: false,
        },
      ]),
    ...overrides,
  } as unknown as ControlApiClient;
}

describe('TournamentHubPage', () => {
  beforeEach(() => clearResilientReadCache());

  it('lists every stage with its number, name, format and seeded state, linking to its own hub', async () => {
    render(
      withIntl(
        <TournamentHubPage
          client={stubClient()}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByRole('heading', { level: 1, name: /stages/i }));
    expect(await screen.findByText(/Fase de grupos/)).toBeTruthy();
    expect(screen.getByText(/Playoffs/)).toBeTruthy();
    expect(screen.getByText('Seeded')).toBeTruthy();
    expect(screen.getByText('Unseeded')).toBeTruthy();

    const firstLink = screen.getByRole('link', { name: /Open stage 1/i });
    expect(firstLink.getAttribute('href')).toBe(
      '/control/liga-mendocina/tournaments/apertura-2026/stages/1',
    );
    const secondLink = screen.getByRole('link', { name: /Open stage 2/i });
    expect(secondLink.getAttribute('href')).toBe(
      '/control/liga-mendocina/tournaments/apertura-2026/stages/2',
    );
  });

  it('shows an empty message for a tournament with no stages yet', async () => {
    render(
      withIntl(
        <TournamentHubPage
          client={stubClient({ listStages: () => Promise.resolve([]) })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    expect(await screen.findByText('This tournament has no stages yet.')).toBeTruthy();
  });

  it('shows a load-failure message when listStages rejects', async () => {
    render(
      withIntl(
        <TournamentHubPage
          client={stubClient({ listStages: () => Promise.reject(new Error('network down')) })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await expectFirstReadFailure();
  });

  it('keeps the last successful stage list visible and marks it stale when a later read fails', async () => {
    const organizationAlias = 'stale-hub-league';
    const tournamentAlias = 'stale-hub-cup';
    const firstRead = render(
      withIntl(
        <TournamentHubPage
          client={stubClient()}
          organizationAlias={organizationAlias}
          tournamentAlias={tournamentAlias}
        />,
      ),
    );
    await screen.findByRole('link', { name: /Open stage 1: Fase de grupos/ });
    firstRead.unmount();

    const { container } = render(
      withIntl(
        <TournamentHubPage
          client={stubClient({ listStages: () => Promise.reject(new Error('network down')) })}
          organizationAlias={organizationAlias}
          tournamentAlias={tournamentAlias}
        />,
      ),
    );

    expect(await screen.findByRole('link', { name: /Open stage 1: Fase de grupos/ })).toBeTruthy();
    await waitFor(() =>
      expect(container.querySelector('.cl-stale-mark')?.textContent).toContain('Stale'),
    );
  });
});
