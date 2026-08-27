import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { TableLayoutSummaryResponse, TableProjectionResponseData } from '../lib/api-client.js';
import { withIntl } from '../i18n/test-support.js';
import { StandingsPage } from './StandingsPage.js';

const groupPhaseLayout: TableLayoutSummaryResponse = {
  code: 'group-standings-default',
  target: 'group-phase',
  label: 'Group Standings',
  entityGranularity: 'team',
};

const projection: TableProjectionResponseData = {
  layoutCode: groupPhaseLayout.code,
  target: groupPhaseLayout.target,
  label: groupPhaseLayout.label,
  columns: [
    { code: 'name', header: 'Team', format: 'text' },
    { code: 'points', header: 'Points', format: 'number' },
  ],
  defaultSort: [{ columnCode: 'points', direction: 'desc' }],
  rows: [
    {
      actorId: 'tll',
      entrantId: 'tll',
      rank: 1,
      sharedRank: false,
      cells: { name: { raw: 'tll', formatted: 'tll' }, points: { raw: 6, formatted: '6' } },
    },
    {
      actorId: 'ind',
      entrantId: 'ind',
      rank: 2,
      sharedRank: true,
      cells: { name: { raw: 'ind', formatted: 'ind' }, points: { raw: 3, formatted: '3' } },
    },
  ],
  projectionVersion: 7,
};

function openRow(entrantId: string): HTMLDetailsElement {
  const tr = screen.getAllByText(entrantId)[0]?.closest('tr');
  const detailTr = tr?.nextElementSibling;
  const row = (detailTr?.querySelector('details') ??
    tr?.querySelector('details') ??
    document.querySelector(`details`)) as HTMLDetailsElement;
  row.open = true;
  fireEvent(row, new Event('toggle'));
  return row;
}

describe('StandingsPage', () => {
  it('shows the projection version and the tiebreak indicator with text, not colour', () => {
    render(
      withIntl(
        <StandingsPage
          activeLayoutCode={groupPhaseLayout.code}
          layouts={[groupPhaseLayout]}
          organizationAlias="liga-mendocina"
          projection={projection}
          tournamentName="Apertura"
        />,
      ),
    );

    expect(screen.getByText(/Projection v7/)).toBeTruthy();
    expect(screen.getByText('Shared position')).toBeTruthy();
  });

  it('says so plainly on a row no comparator touched', async () => {
    render(
      withIntl(
        <StandingsPage
          activeLayoutCode={groupPhaseLayout.code}
          layouts={[groupPhaseLayout]}
          organizationAlias="liga-mendocina"
          projection={projection}
          tournamentName="Apertura"
        />,
      ),
    );
    openRow('tll');

    // With no `onExpand` supplied, the fetch resolves to an empty trace on
    // the next microtask — an async assertion, unlike the old response
    // shape's precomputed `tieBroken` flag, which let this render synchronously.
    expect(await screen.findByText(/recorded no comparators/)).toBeTruthy();
  });

  it('fetches a row’s trace once, on first expand', async () => {
    const onExpand = jest.fn(async () => ['Rule 2 (A favor): ind=2 → resuelto']);
    render(
      withIntl(
        <StandingsPage
          activeLayoutCode={groupPhaseLayout.code}
          layouts={[groupPhaseLayout]}
          onExpand={onExpand as unknown as (actorId: string) => Promise<readonly string[]>}
          organizationAlias="liga-mendocina"
          projection={projection}
          tournamentName="Apertura"
        />,
      ),
    );

    const row = openRow('ind');
    await screen.findByText('Rule 2 (A favor): ind=2 → resuelto');

    // Collapsing and reopening must not re-fetch: the trace of a finished
    // calculation does not change while the operator reads it.
    fireEvent(row, new Event('toggle'));
    fireEvent(row, new Event('toggle'));
    await waitFor(() => expect(onExpand).toHaveBeenCalledTimes(1));
  });

  it('reports a trace it could not retrieve instead of rendering an empty panel', async () => {
    render(
      withIntl(
        <StandingsPage
          activeLayoutCode={groupPhaseLayout.code}
          layouts={[groupPhaseLayout]}
          onExpand={() => Promise.reject(new Error('offline'))}
          organizationAlias="liga-mendocina"
          projection={projection}
          tournamentName="Apertura"
        />,
      ),
    );
    openRow('ind');

    expect(await screen.findByText(/Could not retrieve the rules engine trace/)).toBeTruthy();
  });

  it('renders an empty stage without pretending it has rows', () => {
    render(
      withIntl(
        <StandingsPage
          activeLayoutCode={groupPhaseLayout.code}
          layouts={[groupPhaseLayout]}
          organizationAlias="liga-mendocina"
          projection={{ ...projection, rows: [] }}
          tournamentName="Apertura"
        />,
      ),
    );

    expect(screen.getByText(/There are no results in this stage yet/)).toBeTruthy();
    expect(screen.getByText('No data to chart.')).toBeTruthy();
  });

  it('switches the active tab and re-sorts by a clicked column header', () => {
    const rankingLayout: TableLayoutSummaryResponse = {
      code: 'top-scorers',
      target: 'player-ranking',
      label: 'Top Scorers',
      entityGranularity: 'person',
    };
    const onSelectLayout = jest.fn();
    render(
      withIntl(
        <StandingsPage
          activeLayoutCode={groupPhaseLayout.code}
          layouts={[groupPhaseLayout, rankingLayout]}
          onSelectLayout={onSelectLayout}
          organizationAlias="liga-mendocina"
          projection={projection}
          tournamentName="Apertura"
        />,
      ),
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Top Scorers' }));
    expect(onSelectLayout).toHaveBeenCalledWith('top-scorers');

    // Clicking a column header re-orders the rows on screen; the underlying
    // cell text (server-formatted) is what moves. A new column starts
    // descending — 'tll' already sorts before 'ind' that way, matching the
    // default order — so a second click (ascending) is what actually flips it.
    const beforeOrder = screen.getAllByText(/^(tll|ind)$/).map((node) => node.textContent);
    const header = screen.getByRole('button', { name: 'Team' });
    fireEvent.click(header);
    fireEvent.click(header);
    const afterOrder = screen.getAllByText(/^(tll|ind)$/).map((node) => node.textContent);
    expect(afterOrder).not.toEqual(beforeOrder);
  });

  it('renders an Export CSV button that calls the handler', () => {
    const onExportCsv = jest.fn();
    render(
      withIntl(
        <StandingsPage
          activeLayoutCode={groupPhaseLayout.code}
          layouts={[groupPhaseLayout]}
          onExportCsv={onExportCsv}
          organizationAlias="liga-mendocina"
          projection={projection}
          tournamentName="Apertura"
        />,
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(onExportCsv).toHaveBeenCalledTimes(1);
  });

  it('renders every declared column dynamically, whatever the discipline names them', () => {
    // Goalkeeper-Zamora-style layout: columns this component has never seen
    // a hardcoded name for, proving the render path reads `layout.columns`
    // rather than a fixed statistics list.
    const goalkeeperLayout: TableLayoutSummaryResponse = {
      code: 'goalkeeper-zamora',
      target: 'player-ranking',
      label: 'Goalkeeper Rankings',
      entityGranularity: 'person',
    };
    const goalkeeperProjection: TableProjectionResponseData = {
      layoutCode: goalkeeperLayout.code,
      target: goalkeeperLayout.target,
      label: goalkeeperLayout.label,
      columns: [
        { code: 'goalkeeper', header: 'Goalkeeper', format: 'text' },
        { code: 'conceded', header: 'Goals Conceded', shortHeader: 'GC', format: 'number' },
        { code: 'ratio', header: 'Goals/Match', shortHeader: 'Avg', format: 'decimal-2' },
      ],
      defaultSort: [{ columnCode: 'ratio', direction: 'asc' }],
      rows: [
        {
          actorId: 'gk-1',
          rank: 1,
          sharedRank: false,
          cells: {
            goalkeeper: { formatted: 'Arquero Uno' },
            conceded: { raw: 4, formatted: '4' },
            ratio: { raw: 0.8, formatted: '0.80' },
          },
        },
      ],
      projectionVersion: 1,
    };

    render(
      withIntl(
        <StandingsPage
          activeLayoutCode={goalkeeperLayout.code}
          layouts={[goalkeeperLayout]}
          organizationAlias="liga-mendocina"
          projection={goalkeeperProjection}
          tournamentName="Apertura"
        />,
      ),
    );

    // The distribution chart repeats the same name as its lone bar label,
    // so this is at least one match rather than exactly one.
    expect(screen.getAllByText('Arquero Uno').length).toBeGreaterThan(0);
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('0.80')).toBeTruthy();
    // Short headers render in the column header row, not the full label.
    expect(screen.getByRole('button', { name: 'GC' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Avg' })).toBeTruthy();
  });

  it('scales the distribution chart against the layout’s own primary sort metric', () => {
    render(
      withIntl(
        <StandingsPage
          activeLayoutCode={groupPhaseLayout.code}
          layouts={[groupPhaseLayout]}
          organizationAlias="liga-mendocina"
          projection={projection}
          tournamentName="Apertura"
        />,
      ),
    );

    // `defaultSort[0]` is 'points' — tll leads with 6, ind trails with 3, so
    // the leader's bar is full width and the trailer's is exactly half.
    const bars = screen
      .getByLabelText('Points distribution')
      .querySelectorAll<HTMLElement>('[aria-hidden="true"][style*="width"]');
    const widths = [...bars].map((bar) => bar.style.width);
    expect(widths).toEqual(['100%', '50%']);
  });

  it('charts nothing when the layout declares no default sort to scale against', () => {
    render(
      withIntl(
        <StandingsPage
          activeLayoutCode={groupPhaseLayout.code}
          layouts={[groupPhaseLayout]}
          organizationAlias="liga-mendocina"
          projection={{ ...projection, defaultSort: [] }}
          tournamentName="Apertura"
        />,
      ),
    );

    expect(screen.getByText('No data to chart.')).toBeTruthy();
  });
});
