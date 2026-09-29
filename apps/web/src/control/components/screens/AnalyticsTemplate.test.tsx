import { render, screen, within } from '@testing-library/react';
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
          loading={false}
          organizationAlias="liga-mendocina"
          storage={undefined}
          tournaments={[tournament]}
        />,
      ),
    );

    expect(screen.getByText('liga-mendocina / Analytics')).toBeTruthy();
    expect(screen.getByText('Total tournaments')).toBeTruthy();
    expect(screen.getByText('Apertura 2026')).toBeTruthy();
    expect(screen.getByText('Live')).toBeTruthy();
    expect(screen.getByText('5 / 8 matches')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Tournament overview' })).toBeTruthy();
    expect(document.querySelector('.cl-badge--live')).not.toBeNull();
  });

  it('renders an empty matrix and explicit unavailable storage state', () => {
    render(
      withIntl(
        <AnalyticsTemplate
          completionByTournament={{}}
          loading={false}
          organizationAlias="liga-mendocina"
          storage={undefined}
          tournaments={[]}
        />,
      ),
    );

    expect(screen.getByText('No tournaments found.')).toBeTruthy();
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
          loading={false}
          organizationAlias="liga-mendocina"
          storage={undefined}
          tournaments={[published, finished]}
        />,
      ),
    );

    expect(screen.getByText('Upcoming')).toBeTruthy();
    expect(screen.getByText('Finished')).toBeTruthy();
    expect(document.querySelector('.cl-badge--upcoming')).not.toBeNull();
    expect(document.querySelector('.cl-badge--final')).not.toBeNull();
  });

  it('keeps the loading state before displaying the KPI and matrix content', () => {
    render(
      withIntl(
        <AnalyticsTemplate
          completionByTournament={{}}
          loading={true}
          organizationAlias="liga-mendocina"
          storage={undefined}
          tournaments={[]}
        />,
      ),
    );

    expect(screen.getByText('Loading analytics…')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
