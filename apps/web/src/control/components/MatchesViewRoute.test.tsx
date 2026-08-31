import { jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import { MatchesViewRoute } from './MatchesViewRoute.js';
import { withIntl } from '../i18n/test-support.js';
import type { ControlApiClient } from '../lib/api-client.js';
import type { MatchCardData } from '../../lib/matches-view.js';

const match: MatchCardData = {
  matchId: 'match-1',
  stageNumber: 1,
  matchNumber: 3,
  state: 'final',
  homeName: 'Club Andes',
  homeScore: 2,
  awayName: 'Deportivo Sur',
  awayScore: 1,
  venueName: 'Estadio Central',
  zoneName: 'Zona Norte',
  groupName: 'Grupo A',
  homePosition: 1,
  awayPosition: 2,
  decidingFactor: 'head-to-head goal difference',
  homeTrace: ['Comparator: head-to-head goal difference — Club Andes ahead'],
  awayTrace: ['Comparator: head-to-head goal difference — Deportivo Sur behind'],
};

function stubClient(overrides: Partial<ControlApiClient> = {}): ControlApiClient {
  return {
    fetchMatchesView: () => Promise.resolve({ matches: [match] }),
    ...overrides,
  } as unknown as ControlApiClient;
}

describe('MatchesViewRoute', () => {
  it('renders the fetched matches as cards, including the full trace', async () => {
    render(
      withIntl(
        <MatchesViewRoute
          client={stubClient()}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => screen.getByText('Club Andes'));
    expect(screen.getByText('Deportivo Sur')).toBeDefined();
    expect(screen.getByText('Estadio Central')).toBeDefined();
    expect(screen.getAllByText(/head-to-head goal difference/).length).toBeGreaterThan(0);
  });

  it('shows the empty state when no matches match the filter', async () => {
    render(
      withIntl(
        <MatchesViewRoute
          client={stubClient({ fetchMatchesView: () => Promise.resolve({ matches: [] }) })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => {
      expect(document.querySelector('.cl-list-screen__empty')).not.toBeNull();
    });
  });

  it('passes stageNumber and groupId from the URL query string through to the fetch', async () => {
    window.history.pushState(
      {},
      '',
      '/control/liga-mendocina/tournaments/apertura-2026/matches-view?stageNumber=2&groupId=group-1',
    );
    const fetchMatchesView = jest.fn(() => Promise.resolve({ matches: [match] }));
    try {
      render(
        withIntl(
          <MatchesViewRoute
            client={stubClient({ fetchMatchesView })}
            organizationAlias="liga-mendocina"
            tournamentAlias="apertura-2026"
          />,
        ),
      );

      await waitFor(() => screen.getByText('Club Andes'));
      expect(fetchMatchesView).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026', {
        stageNumber: 2,
        groupId: 'group-1',
        state: 'all',
      });
    } finally {
      window.history.pushState({}, '', '/');
    }
  });

  it('shows an error message when the fetch fails', async () => {
    render(
      withIntl(
        <MatchesViewRoute
          client={stubClient({ fetchMatchesView: () => Promise.reject(new Error('boom')) })}
          organizationAlias="liga-mendocina"
          tournamentAlias="apertura-2026"
        />,
      ),
    );

    await waitFor(() => {
      expect(document.querySelector('.cl-list-screen')).not.toBeNull();
    });
  });
});
