import { render, screen, within } from '@testing-library/react';
import { StandingsFigure, StandingsPanel, StandingsRank } from './standings-panel.js';
import type { DataTableColumn } from './data-table.js';
import {
  referenceStandingsTable,
  type ReferenceStandingsRow,
} from '../../../../lib/reference-fixtures.js';

const table = referenceStandingsTable();

function columnsFor(
  codes: readonly string[],
  decidingCode?: string,
): readonly DataTableColumn<ReferenceStandingsRow>[] {
  return [
    { key: 'rank', header: 'Position', render: (row) => <StandingsRank>{row.rank}</StandingsRank> },
    { key: 'entrant', header: 'Participant', render: (row) => row.name },
    ...codes.map((code) => ({
      key: code,
      header: code,
      render: (row: ReferenceStandingsRow) => (
        <StandingsFigure
          deciding={code === decidingCode && row.tieBroken}
          decidingLabel="Decided this position"
        >
          {row.statistics[code]}
        </StandingsFigure>
      ),
    })),
  ];
}

function renderPanel(
  overrides: Partial<Parameters<typeof StandingsPanel<ReferenceStandingsRow>>[0]> = {},
) {
  return render(
    <StandingsPanel
      columns={columnsFor(table.columns, table.decidingCode)}
      rowKey={(row) => row.entrantId}
      rows={table.rows}
      title="Standings"
      {...overrides}
    />,
  );
}

describe('the StandingsPanel composition', () => {
  it('renders through the table owner rather than a table of its own', () => {
    const { container } = renderPanel();
    expect(container.querySelectorAll('table')).toHaveLength(1);
    expect(container.querySelector('.cl-data-table')).not.toBeNull();
  });

  it('presents the rows in the order it was given, deciding nothing itself', () => {
    renderPanel();
    const rendered = screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[1]?.textContent);
    expect(rendered).toEqual(table.rows.map((row) => row.name));
  });

  it('marks the comparator that decided the level pair, and only those rows', () => {
    const { container } = renderPanel();
    const marked = container.querySelectorAll('[data-deciding="true"]');
    expect(marked).toHaveLength(table.rows.filter((row) => row.tieBroken).length);
  });

  it('names the deciding comparator for a reader who sees no colour at all', () => {
    renderPanel();
    expect(screen.getAllByText('Decided this position').length).toBeGreaterThan(0);
  });

  it('lists the configured tiebreaker chain in its footer, in order', () => {
    renderPanel({
      tiebreakers: table.tiebreakerCodes.map((code, index) => ({
        step: index + 1,
        label: code,
        triggered: code === table.decidingCode,
      })),
      tiebreakerTitle: 'Tiebreaker sequence',
    });
    const items = screen.getAllByRole('listitem').map((item) => item.textContent ?? '');
    expect(items[0]).toContain('points');
    expect(items[1]).toContain('head-to-head');
    expect(items[2]).toContain('score-difference');
  });

  it('renders no footer where the format declares no chain', () => {
    const { container } = renderPanel();
    expect(container.querySelector('.cl-standings-panel__footer')).toBeNull();
  });

  it('renders only the columns it was given, borrowing none from another discipline', () => {
    renderPanel({ columns: columnsFor(['played', 'frags', 'points']) });
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers).toEqual(['Position', 'Participant', 'played', 'frags', 'points']);
    expect(headers).not.toContain('goals-for');
  });

  it('labels the panel for assistive technology from its own title', () => {
    renderPanel();
    expect(screen.getByRole('region', { name: 'Standings' })).not.toBeNull();
  });

  it('shows the empty message rather than an empty grid when nothing is ranked yet', () => {
    renderPanel({ rows: [], emptyMessage: 'No results yet.' });
    expect(screen.getByText('No results yet.')).not.toBeNull();
  });

  it('sets rank and figures in the tabular treatment they are scanned in', () => {
    const { container } = renderPanel();
    expect(container.querySelector('.cl-standings-panel__rank')).not.toBeNull();
    expect(container.querySelector('.cl-standings-panel__figure')).not.toBeNull();
  });

  it('renders the header bar with no descriptor or verified badge when neither is given', () => {
    const { container } = renderPanel();
    expect(container.querySelector('.cl-standings-panel__subtitle')).toBeNull();
    expect(container.querySelector('.cl-badge--verified')).toBeNull();
  });

  it('renders the descriptor subtitle and verified badge when both are given', () => {
    renderPanel({
      descriptorSubtitle: 'Reglamento: Football-Standard (DisciplineDescriptor v1.2.0)',
      verifiedLabel: 'Standings verified',
    });
    expect(
      screen.getByText('Reglamento: Football-Standard (DisciplineDescriptor v1.2.0)'),
    ).not.toBeNull();
    expect(screen.getByText('Standings verified')).not.toBeNull();
  });

  it('leaves row density and header position unchanged unless compact/stickyHeader are set', () => {
    const { container } = renderPanel();
    expect(container.querySelector('.cl-data-table--compact')).toBeNull();
    expect(container.querySelector('.cl-data-table--sticky')).toBeNull();
  });

  it('opts a table into compact density and a sticky header on request', () => {
    const { container } = renderPanel({ compact: true, stickyHeader: true });
    expect(container.querySelector('.cl-data-table--compact')).not.toBeNull();
    expect(container.querySelector('.cl-data-table--sticky')).not.toBeNull();
  });

  it('shows the tiebreaker title and the audit proof code on the same footer row', () => {
    renderPanel({
      auditProofCode: 'Audit Proof #TP-982',
      tiebreakers: table.tiebreakerCodes.map((code, index) => ({
        step: index + 1,
        label: code,
        triggered: code === table.decidingCode,
      })),
      tiebreakerTitle: 'Configured tiebreaker pipeline',
    });
    const heading = document.querySelector('.cl-standings-panel__footer-heading');
    expect(heading?.textContent).toContain('Configured tiebreaker pipeline');
    expect(heading?.textContent).toContain('Audit Proof #TP-982');
  });

  it('shows an audit proof code even where the format declares no tiebreaker chain', () => {
    renderPanel({ auditProofCode: 'Audit Proof #TP-982' });
    expect(screen.getByText('Audit Proof #TP-982')).not.toBeNull();
  });
});

describe('StandingsFigure tone', () => {
  it('carries no tone class by default', () => {
    const { container } = render(<StandingsFigure>10</StandingsFigure>);
    expect(container.querySelector('.cl-standings-panel__figure')?.className).toBe(
      'cl-standings-panel__figure',
    );
  });

  it('applies the positive/negative/emphasis modifier class the caller names', () => {
    const { container: positive } = render(<StandingsFigure tone="positive">+6</StandingsFigure>);
    expect(positive.querySelector('.cl-standings-panel__figure--positive')?.textContent).toBe('+6');

    const { container: negative } = render(<StandingsFigure tone="negative">-6</StandingsFigure>);
    expect(negative.querySelector('.cl-standings-panel__figure--negative')?.textContent).toBe('-6');

    const { container: emphasis } = render(<StandingsFigure tone="emphasis">12</StandingsFigure>);
    expect(emphasis.querySelector('.cl-standings-panel__figure--emphasis')?.textContent).toBe('12');
  });
});
