import { render, screen, within } from '@testing-library/react';
import { TvStandingsTable } from './TvStandingsTable.js';
import type { StandingsRowView } from '../../../../lib/overview.js';
import type { TvDashboardLabels } from '../../tv-types.js';

const dashboardLabels = {
  clubColumn: 'Club',
  playedColumn: 'PJ',
  standingsUnavailable: 'Sin tabla',
} as unknown as TvDashboardLabels;

const row = (position: number, name: string, zoneName?: string): StandingsRowView => ({
  position,
  name,
  played: 3,
  points: 9 - position,
  ...(zoneName === undefined ? {} : { zoneName }),
});

function renderTable(standings: readonly StandingsRowView[]) {
  return render(
    <TvStandingsTable
      dashboardLabels={dashboardLabels}
      pointsShortLabel="Pts"
      standings={standings}
    />,
  );
}

describe('TvStandingsTable', () => {
  it('renders a stage with a single table as one headless table, as before', () => {
    const { container } = renderTable([row(1, 'Boca'), row(2, 'River')]);

    expect(container.querySelectorAll('table')).toHaveLength(1);
    expect(screen.queryByTestId('tv-standings-zone')).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('renders one table per zone, each headed by the zone name, with no row crossing zones', () => {
    renderTable([
      row(1, 'Boca', 'Liga A'),
      row(2, 'River', 'Liga A'),
      row(1, 'Lanús', 'Liga B'),
      row(2, 'Banfield', 'Liga B'),
    ]);

    const zones = screen.getAllByTestId('tv-standings-zone');
    expect(zones).toHaveLength(2);
    expect(within(zones[0] as HTMLElement).getByRole('heading', { name: 'Liga A' })).toBeTruthy();
    expect(within(zones[0] as HTMLElement).getByText('Boca')).toBeTruthy();
    expect(within(zones[0] as HTMLElement).queryByText('Lanús')).toBeNull();
    expect(within(zones[1] as HTMLElement).getByRole('heading', { name: 'Liga B' })).toBeTruthy();
    expect(within(zones[1] as HTMLElement).getByText('Banfield')).toBeTruthy();
  });

  it('caps each zone at eight rows, not the whole list', () => {
    const many = (zone: string) =>
      Array.from({ length: 10 }, (_, index) => row(index + 1, `${zone}${index + 1}`, zone));
    const { container } = renderTable([...many('A'), ...many('B')]);

    expect(container.querySelectorAll('tbody tr')).toHaveLength(16);
  });

  it('says so when there are no standings at all', () => {
    renderTable([]);

    expect(screen.getByText('Sin tabla')).toBeTruthy();
  });
});
