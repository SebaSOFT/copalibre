import { jest } from '@jest/globals';
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
  it('renders the KPI summary, the match-progress bars and tournament progress with readable status', () => {
    render(
      withIntl(
        <AnalyticsTemplate
          completionByTournament={{ [tournament.alias]: completion }}
          failed={false}
          loading={false}
          onRetry={() => undefined}
          organizationAlias="liga-mendocina"
          staleSince={undefined}
          tournaments={[tournament]}
        />,
      ),
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Analytics' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Tournament summary' })).toBeTruthy();
    expect(screen.getByText('Total tournaments')).toBeTruthy();
    expect(
      screen.getByRole('progressbar', { name: 'Matches resolved' }).getAttribute('value'),
    ).toBe('5');
    expect(screen.getByText('Matches resolved: 5 / 8')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Apertura 2026' }).getAttribute('href')).toBe(
      '/control/liga-mendocina/tournaments/apertura-2026',
    );
    expect(screen.getByText('Apertura 2026')).toBeTruthy();
    expect(screen.getAllByText('In progress').length).toBeGreaterThan(0);
    expect(screen.getByText('5 / 8 matches')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Tournament overview' })).toBeTruthy();
    expect(document.querySelector('.cl-badge--live')).toBeNull();
    expect(document.querySelector('.cl-badge--muted')).not.toBeNull();
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
    expect(within(chartTable).getByRole('row', { name: 'In progress 1' })).toBeTruthy();
    expect(within(chartTable).getByRole('row', { name: 'Draft 1' })).toBeTruthy();
    expect(within(chartTable).getByRole('row', { name: 'Archived 1' })).toBeTruthy();
  });

  it('renders an empty matrix without match-progress bars', () => {
    render(
      withIntl(
        <AnalyticsTemplate
          completionByTournament={{}}
          failed={false}
          loading={false}
          onRetry={() => undefined}
          organizationAlias="liga-mendocina"
          staleSince={undefined}
          tournaments={[]}
        />,
      ),
    );

    expect(screen.getAllByText('No tournaments found.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('0')).toHaveLength(3);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(
      within(screen.getByRole('region', { name: 'Tournament overview' })).queryAllByRole('row'),
    ).toHaveLength(1);
  });

  it('pages the tournament table ten rows at a time', () => {
    const many: TournamentResponse[] = Array.from({ length: 12 }, (_, index) => ({
      ...tournament,
      tournamentId: `019927d0-0000-7000-8000-0000000002${String(index).padStart(2, '0')}`,
      alias: `cup-${index}`,
      name: `Cup ${index + 1}`,
    }));
    render(
      withIntl(
        <AnalyticsTemplate
          completionByTournament={{}}
          failed={false}
          loading={false}
          onRetry={() => undefined}
          organizationAlias="liga-mendocina"
          staleSince={undefined}
          tournaments={many}
        />,
      ),
    );

    const overview = (): ReturnType<typeof within> =>
      within(screen.getByRole('region', { name: 'Tournament overview' }));
    expect(overview().getAllByRole('row')).toHaveLength(11);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(overview().getAllByRole('row')).toHaveLength(3);
    expect(overview().getByText('Cup 12')).toBeTruthy();
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
          tournaments={[]}
        />,
      ),
    );

    expect(screen.getByText('Loading Analytics')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('AnalyticsTemplate export', () => {
  const props = {
    completionByTournament: {},
    failed: false,
    loading: false,
    onRetry: () => undefined,
    organizationAlias: 'liga-mendocina',
    staleSince: undefined,
  } as const;

  function numbered(count: number): readonly TournamentResponse[] {
    return Array.from({ length: count }, (_, index) => ({
      ...tournament,
      tournamentId: `019927d0-0000-7000-8000-0000000002${String(index).padStart(2, '0')}`,
      alias: `copa-${index + 1}`,
      name: `Copa ${index + 1}`,
    }));
  }

  it('exports every tournament, not only the page on screen, with the table columns', () => {
    const onExportCsv = jest.fn();
    render(
      withIntl(
        <AnalyticsTemplate
          {...props}
          completionByTournament={{ 'copa-1': completion }}
          onExportCsv={onExportCsv}
          tournaments={numbered(12)}
        />,
      ),
    );
    // The table shows ten rows; the file holds all twelve.
    expect(screen.getAllByRole('link', { name: /^Open Copa/ })).toHaveLength(10);

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(onExportCsv).toHaveBeenCalledTimes(1);
    const lines = (onExportCsv.mock.calls[0]?.[0] as string).trimEnd().split('\n');
    expect(lines).toHaveLength(13);
    expect(lines[0]).toBe('Tournament,Status,Match progress,Live matches');
    expect(lines[1]).toBe('Copa 1,In progress,5 / 8 matches,1');
    // No completion read yet: empty cells, not zeros.
    expect(lines[12]).toBe('Copa 12,In progress,,');
  });

  it('quotes a tournament name with a comma and neutralizes a formula', () => {
    const onExportCsv = jest.fn();
    render(
      withIntl(
        <AnalyticsTemplate
          {...props}
          onExportCsv={onExportCsv}
          tournaments={[
            { ...tournament, name: 'Copa, Norte' },
            { ...tournament, tournamentId: 'other', alias: 'other', name: '=SUM(A1)' },
          ]}
        />,
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    const lines = (onExportCsv.mock.calls[0]?.[0] as string).trimEnd().split('\n');
    expect(lines[1]).toBe('"Copa, Norte",In progress,,');
    expect(lines[2]).toBe("'=SUM(A1),In progress,,");
  });

  it('offers no export where the page cannot save a file, or while there is nothing to export', () => {
    const { rerender } = render(
      withIntl(<AnalyticsTemplate {...props} tournaments={[tournament]} />),
    );
    expect(screen.queryByRole('button', { name: 'Export CSV' })).toBeNull();

    rerender(
      withIntl(<AnalyticsTemplate {...props} onExportCsv={() => undefined} tournaments={[]} />),
    );
    expect(screen.getByRole('button', { name: 'Export CSV' }).hasAttribute('disabled')).toBe(true);

    rerender(
      withIntl(
        <AnalyticsTemplate
          {...props}
          loading
          onExportCsv={() => undefined}
          tournaments={[tournament]}
        />,
      ),
    );
    expect(screen.queryByRole('button', { name: 'Export CSV' })).toBeNull();
  });
});
