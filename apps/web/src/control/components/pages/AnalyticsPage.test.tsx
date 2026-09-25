import { jest } from '@jest/globals';
import { render, screen, waitFor, within } from '@testing-library/react';
import type { TournamentCompletionResponse } from '@copalibre/contracts';
import { withIntl } from '../../i18n/test-support.js';
import type { ControlApiClient } from '../../lib/api-client.js';
import { AnalyticsPage } from './AnalyticsPage.js';

const completion: TournamentCompletionResponse = {
  totalMatches: 10,
  resolvedMatches: 4,
  liveMatches: 2,
  scheduledMatches: 4,
  finalizedMatches: 4,
  forfeitedMatches: 0,
  stages: [],
};

describe('AnalyticsPage', () => {
  it('loads each tournament completion independently and preserves rows on a completion failure', async () => {
    const fetchCompletion = jest.fn(async (_organizationAlias: string, tournamentAlias: string) => {
      if (tournamentAlias === 'final-cup') throw new Error('completion unavailable');
      return completion;
    });
    const client = {
      listActiveTournaments: async () => [
        {
          tournamentId: '019927d0-0000-7000-8000-000000000002',
          alias: 'apertura-2026',
          name: 'Apertura 2026',
          status: 'started' as const,
        },
        {
          tournamentId: '019927d0-0000-7000-8000-000000000003',
          alias: 'final-cup',
          name: 'Final Cup',
          status: 'finished' as const,
        },
      ],
      fetchCompletion,
    } as unknown as ControlApiClient;

    render(withIntl(<AnalyticsPage client={client} organizationAlias="liga-mendocina" />));

    const table = await screen.findByRole('region', { name: 'Tournament overview' });
    await waitFor(() => expect(within(table).getByText('4 / 10 matches')).toBeTruthy());
    expect(fetchCompletion).toHaveBeenCalledWith('liga-mendocina', 'apertura-2026');
    expect(fetchCompletion).toHaveBeenCalledWith('liga-mendocina', 'final-cup');
    const finalCupRow = screen.getByRole('cell', { name: 'Final Cup' }).parentElement;
    if (!finalCupRow) throw new Error('Final Cup row was not rendered');
    expect(within(finalCupRow).getAllByText('No data')).toHaveLength(2);
  });
});
