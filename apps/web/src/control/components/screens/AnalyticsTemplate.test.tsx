import { fireEvent, render, screen, within } from '@testing-library/react';
import type { TournamentCompletionResponse } from '@copalibre/contracts';
import type { TournamentResponse } from '../../lib/api-client.js';
import { withIntl } from '../../i18n/test-support.js';
import { AnalyticsTemplate } from './AnalyticsTemplate.js';

const tournament: TournamentResponse = {
  tournamentId: '019927d0-0000-7000-8000-000000000002',
  alias: 'apertura-2026',
  name: 'Apertura 2026',
  status: 'started',
};

const completion: TournamentCompletionResponse = {
  totalMatches: 8,
  resolvedMatches: 5,
  liveMatches: 1,
  scheduledMatches: 2,
  finalizedMatches: 5,
  forfeitedMatches: 0,
  stages: [],
};

describe('AnalyticsTemplate', () => {
  it('renders organization context, KPI values, and tournament progress with readable status', () => {
    render(
      withIntl(
        <AnalyticsTemplate
          completionByTournament={{ [tournament.alias]: completion }}
          failed={false}
          loading={false}
          onRetry={() => undefined}
          organizationAlias="liga-mendocina"
          staleSince={undefined}
          storage={undefined}
          tournaments={[tournament]}
        />,
      ),
    );

    expect(screen.getByText('liga-mendocina / Analytics')).toBeTruthy();
    expect(screen.getByText('Total tournaments')).toBeTruthy();
    expect(screen.getByText('Apertura 2026')).toBeTruthy();
    expect(screen.getAllByText('Live').length).toBeGreaterThan(0);
    expect(screen.getByText('5 / 8 matches')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Tournament overview' })).toBeTruthy();
    expect(document.querySelector('.cl-badge--live')).not.toBeNull();
  });

  it('charts all tournament statuses with stable palette slots and table values', () => {
    const draft: TournamentResponse = {
      tournamentId: '019927d0-0000-7000-8000-000000000005',
      alias: 'draft-cup',
      name: 'Draft Cup',
      status: 'draft',
    };
    const archived: TournamentResponse = {
      tournamentId: '019927d0-0000-7000-8000-000000000006',
      alias: 'archived-cup',
      name: 'Archived Cup',
      status: 'archived',
    };
    render(
      withIntl(
        <AnalyticsTemplate
          completionByTournament={{}}
          failed={false}
          loading={false}
          onRetry={() => undefined}
          organizationAlias="liga-mendocina"
          staleSince={undefined}
          storage={undefined}
          tournaments={[tournament, draft, archived]}
        />,
      ),
    );

    expect(screen.getByRole('list', { name: 'Legend' }).children).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    const chartRegion = screen.getByRole('region', {
      name: 'Tournament status distribution: Show as table',
    });
    const chartTable = within(chartRegion).getByRole('table');
    expect(within(chartTable).getByRole('row', { name: 'Live 1' })).toBeTruthy();
    expect(within(chartTable).getByRole('row', { name: 'Draft 1' })).toBeTruthy();
    expect(within(chartTable).getByRole('row', { name: 'Archived 1' })).toBeTruthy();
  });

  it('renders an empty matrix and explicit unavailable storage state', () => {
    render(
      withIntl(
        <AnalyticsTemplate
          completionByTournament={{}}
          failed={false}
          loading={false}
          onRetry={() => undefined}
          organizationAlias="liga-mendocina"
          staleSince={undefined}
          storage={undefined}
          tournaments={[]}
        />,
      ),
    );

    expect(screen.getAllByText('No tournaments found.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('0')).toHaveLength(2);
    expect(
      within(screen.getByRole('region', { name: 'Tournament overview' })).queryAllByRole('row'),
    ).toHaveLength(1);
    expect(screen.getAllByText('No data').length).toBeGreaterThan(0);
  });

  it('uses upcoming and final signal tokens while keeping lifecycle text visible', () => {
    const published: TournamentResponse = {
      tournamentId: '019927d0-0000-7000-8000-000000000003',
      alias: 'clausura-2026',
      name: 'Clausura 2026',
      status: 'published',
    };
    const finished: TournamentResponse = {
      tournamentId: '019927d0-0000-7000-8000-000000000004',
      alias: 'final-cup',
      name: 'Final Cup',
      status: 'finished',
    };

    render(
      withIntl(
        <AnalyticsTemplate
          completionByTournament={{}}
          failed={false}
          loading={false}
          onRetry={() => undefined}
          organizationAlias="liga-mendocina"
          staleSince={undefined}
          storage={undefined}
          tournaments={[published, finished]}
        />,
      ),
    );

    expect(screen.getAllByText('Upcoming').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Finished').length).toBeGreaterThan(0);
    expect(document.querySelector('.cl-badge--upcoming')).not.toBeNull();
    expect(document.querySelector('.cl-badge--final')).not.toBeNull();
  });

  it('keeps the loading state before displaying the KPI and matrix content', () => {
    render(
      withIntl(
        <AnalyticsTemplate
          completionByTournament={{}}
          failed={false}
          loading={true}
          onRetry={() => undefined}
          organizationAlias="liga-mendocina"
          staleSince={undefined}
          storage={undefined}
          tournaments={[]}
        />,
      ),
    );

    expect(screen.getByText('Loading Analytics')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
