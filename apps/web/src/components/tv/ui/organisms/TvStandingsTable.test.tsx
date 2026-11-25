import { render, screen } from '@testing-library/react';
import { publicIntl, tvDashboardLabels } from '../../../../lib/i18n/public-intl.js';
import type { StandingsRowView } from '../../../../lib/overview.js';
import { TvStandingsTable } from './TvStandingsTable.js';

const dashboardLabels = tvDashboardLabels(publicIntl('en'));

function row(position: number, groupName: string): StandingsRowView {
  return {
    position,
    name: `Club ${groupName} ${position}`,
    abbreviation: `C${position}`,
    played: 3,
    points: 9 - position,
    groupName,
  };
}

describe('TvStandingsTable', () => {
  it('renders every row of a full-frame table, past the eight-row cap', () => {
    const standings = Array.from({ length: 24 }, (_, index) => row(index + 1, 'Grupo A'));
    render(
      <TvStandingsTable
        dashboardLabels={dashboardLabels}
        pointsShortLabel="Pts"
        showAllRows
        standings={standings}
      />,
    );

    expect(document.querySelectorAll('.tv-standings-table tbody tr')).toHaveLength(24);
  });

  it('heads each table with the stage and, when the stage has several, the group', () => {
    const standings = [row(1, 'Grupo A'), row(1, 'Grupo B')];
    render(
      <TvStandingsTable
        dashboardLabels={dashboardLabels}
        pointsShortLabel="Pts"
        showAllRows
        stageName="Fase 1"
        standings={standings}
      />,
    );

    const headings = Array.from(document.querySelectorAll('.tv-standings-zone__name')).map(
      (heading) => heading.textContent,
    );
    expect(headings).toEqual(['Fase 1 · Grupo A', 'Fase 1 · Grupo B']);
    expect(screen.getAllByRole('table')).toHaveLength(2);
  });
});
