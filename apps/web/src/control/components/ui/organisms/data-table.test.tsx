import { render, screen, within } from '@testing-library/react';
import { DataTable, type DataTableColumn } from './data-table.js';

interface Club {
  readonly id: string;
  readonly name: string;
  readonly played: number;
  readonly points: number;
  readonly goalsFor: number;
}

const clubs: readonly Club[] = [
  { id: 'a', name: 'Estudiantil San Miguel', played: 4, points: 9, goalsFor: 11 },
  { id: 'b', name: 'Atlético Unión', played: 4, points: 7, goalsFor: 8 },
];

const columns: readonly DataTableColumn<Club>[] = [
  {
    key: 'name',
    header: 'Club',
    label: 'Club',
    nameText: (club) => club.name,
    render: (club) => club.name,
    priority: 'high',
  },
  { key: 'played', header: 'P', label: 'Played', render: (club) => club.played, priority: 'high' },
  {
    key: 'points',
    header: 'Pts',
    label: 'Points',
    render: (club) => club.points,
    priority: 'high',
  },
  {
    key: 'goalsFor',
    header: 'GF',
    label: 'Goals for',
    render: (club) => club.goalsFor,
    priority: 'low',
  },
];

function renderTable(mobileMode?: 'scroll' | 'priority' | 'stacked'): HTMLElement {
  render(
    <DataTable
      ariaLabel="Standings"
      columns={columns}
      mobileMode={mobileMode}
      moreColumnsLabel="More columns"
      rowKey={(club) => club.id}
      rows={clubs}
    />,
  );
  return screen.getByRole('region', { name: 'Standings' });
}

describe('DataTable', () => {
  it('renders every header as a column header with scope="col"', () => {
    renderTable();
    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((header) => header.getAttribute('scope'))).toEqual([
      'col',
      'col',
      'col',
      'col',
    ]);
  });

  it('keeps every column in a scrolling box by default', () => {
    const region = renderTable();
    expect(region.className).toContain('cl-data-table--scroll');
    expect(region.querySelector('details')).toBeNull();
    expect(region.querySelector('[role="cell"]')).toBeNull();
  });

  describe('priority mode', () => {
    it('marks low-priority cells and headers so the stylesheet can hide them on a phone', () => {
      const region = renderTable('priority');
      expect(region.className).toContain('cl-data-table--priority');
      const lowHeader = screen.getByRole('columnheader', { name: 'GF' });
      expect(lowHeader.getAttribute('data-priority')).toBe('low');
      const lowCells = region.querySelectorAll('tbody td[data-priority="low"]');
      expect(lowCells).toHaveLength(2);
    });

    it('lists the hidden columns as label–value pairs in a disclosure in the name cell', () => {
      renderTable('priority');
      const row = screen.getByText('Estudiantil San Miguel').closest('tr') as HTMLElement;
      const disclosure = within(row)
        .getByText('More columns: Estudiantil San Miguel')
        .closest('details') as HTMLElement;
      expect(disclosure.closest('td')?.className).toContain('cl-cell-name');
      const term = within(disclosure).getByText('Goals for');
      expect(term.nextElementSibling?.textContent).toBe('11');
    });

    it('adds no disclosure when no column is low priority', () => {
      render(
        <DataTable
          columns={columns.filter((column) => column.priority === 'high')}
          mobileMode="priority"
          rowKey={(club) => club.id}
          rows={clubs}
        />,
      );
      expect(document.querySelector('details')).toBeNull();
    });
  });

  describe('stacked mode', () => {
    it('labels each cell with its column so a row can read as a card', () => {
      const region = renderTable('stacked');
      expect(region.className).toContain('cl-data-table--stacked');
      const cells = within(
        screen.getByText('Atlético Unión').closest('tr') as HTMLElement,
      ).getAllByRole('cell');
      expect(cells.map((cell) => cell.getAttribute('data-label'))).toEqual([
        'Club',
        'Played',
        'Points',
        'Goals for',
      ]);
    });

    it('keeps the table semantics a block layout would otherwise drop', () => {
      renderTable('stacked');
      expect(screen.getByRole('table')).toBeDefined();
      expect(screen.getAllByRole('row')).toHaveLength(3);
      expect(screen.getAllByRole('columnheader')).toHaveLength(4);
    });

    it('falls back to a string header when a column has no label', () => {
      render(
        <DataTable
          columns={[{ key: 'x', header: 'Header text', render: () => 'value' }]}
          mobileMode="stacked"
          rowKey={() => 'only'}
          rows={[{}]}
        />,
      );
      expect(screen.getByRole('cell').getAttribute('data-label')).toBe('Header text');
    });
  });

  describe('name column', () => {
    it('truncates through the stylesheet and keeps the full name as its tooltip', () => {
      renderTable();
      const text = screen.getByText('Estudiantil San Miguel');
      expect(text.className).toContain('cl-cell-name__text');
      expect(text.getAttribute('title')).toBe('Estudiantil San Miguel');
    });

    it('places a name action beside the name', () => {
      render(
        <DataTable
          columns={[
            {
              key: 'name',
              header: 'Club',
              nameAction: () => <button type="button">Trace</button>,
              nameText: (club: Club) => club.name,
              render: (club: Club) => club.name,
            },
          ]}
          rowKey={(club) => club.id}
          rows={clubs}
        />,
      );
      const row = screen.getByText('Atlético Unión').closest('tr') as HTMLElement;
      expect(within(row).getByRole('button', { name: 'Trace' })).toBeDefined();
    });
  });

  it('still renders a row detail beneath its row', () => {
    render(
      <DataTable
        columns={columns}
        renderRowDetail={(club) => (club.id === 'a' ? <p>Detail for a</p> : undefined)}
        rowKey={(club) => club.id}
        rows={clubs}
      />,
    );
    expect(screen.getByText('Detail for a').closest('td')?.getAttribute('colspan')).toBe('4');
    expect(screen.queryByText('Detail for b')).toBeNull();
  });
});
