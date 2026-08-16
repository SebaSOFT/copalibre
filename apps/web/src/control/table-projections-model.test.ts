import { describe, expect, it } from '@jest/globals';
import type {
  TableColumnResponseData,
  TableLayoutSummaryResponse,
  TableProjectionResponseData,
  TableRowResponseData,
} from './lib/api-client.js';
import {
  distributionBars,
  localizedText,
  nextSort,
  sortRows,
  tableColumns,
  tableLayoutTabs,
  tiebreakIndicator,
} from './lib/table-projections.js';

describe('localizedText', () => {
  it('returns a plain string unchanged', () => {
    expect(localizedText('Standings', 'es')).toBe('Standings');
  });

  it('picks the requested language from a localized label', () => {
    expect(localizedText({ en: 'Standings', es: 'Posiciones' }, 'es')).toBe('Posiciones');
  });

  it('falls back to English when the requested language is not declared', () => {
    expect(localizedText({ en: 'Standings' }, 'fr')).toBe('Standings');
  });

  it('resolves a region-qualified locale to its base language', () => {
    expect(localizedText({ en: 'Standings', es: 'Posiciones' }, 'es-AR')).toBe('Posiciones');
  });
});

describe('tableLayoutTabs', () => {
  const layouts: readonly TableLayoutSummaryResponse[] = [
    {
      code: 'group-standings-default',
      target: 'group-phase',
      label: { en: 'Group Standings', es: 'Tabla de Posiciones' },
      entityGranularity: 'team',
    },
    {
      code: 'top-scorers',
      target: 'player-ranking',
      label: 'Top Scorers',
      entityGranularity: 'person',
    },
  ];

  it('resolves each layout’s label in the requested language', () => {
    const tabs = tableLayoutTabs(layouts, 'es');
    expect(tabs.map((tab) => tab.label)).toEqual(['Tabla de Posiciones', 'Top Scorers']);
  });

  it('marks group-phase/match-roster/schedule-timeframe as stage-scoped, the rest as tournament-wide', () => {
    const tabs = tableLayoutTabs(layouts, 'en');
    expect(tabs.map((tab) => tab.stageScoped)).toEqual([true, false]);
  });
});

describe('tableColumns', () => {
  it('falls back to the full header when no short header is declared', () => {
    const columns: readonly TableColumnResponseData[] = [
      { code: 'name', header: 'Team', format: 'text' },
    ];
    expect(tableColumns(columns, 'en')).toEqual([
      { code: 'name', label: 'Team', shortLabel: 'Team', format: 'text' },
    ]);
  });

  it('prefers the short header when one is declared', () => {
    const columns: readonly TableColumnResponseData[] = [
      { code: 'gf', header: 'Goals For', shortHeader: 'GF', format: 'number' },
    ];
    expect(tableColumns(columns, 'en')[0]).toMatchObject({ label: 'Goals For', shortLabel: 'GF' });
  });
});

function row(actorId: string, rank: number, sharedRank: boolean, raw: number): TableRowResponseData {
  return {
    actorId,
    rank,
    sharedRank,
    cells: { points: { raw, formatted: String(raw) } },
  };
}

describe('sortRows', () => {
  const rows: readonly TableRowResponseData[] = [row('a', 1, false, 6), row('b', 2, false, 3)];

  it('returns rows unchanged with no active sort', () => {
    expect(sortRows(rows)).toBe(rows);
  });

  it('sorts descending by the given column', () => {
    expect(sortRows(rows, { columnCode: 'points', direction: 'desc' }).map((r) => r.actorId)).toEqual(
      ['a', 'b'],
    );
  });

  it('sorts ascending by the given column', () => {
    expect(sortRows(rows, { columnCode: 'points', direction: 'asc' }).map((r) => r.actorId)).toEqual([
      'b',
      'a',
    ]);
  });

  it('ranks a row with no value for the sorted column last, regardless of direction', () => {
    const withMissing: readonly TableRowResponseData[] = [
      row('a', 1, false, 6),
      { actorId: 'c', rank: 3, sharedRank: false, cells: {} },
    ];
    expect(
      sortRows(withMissing, { columnCode: 'points', direction: 'asc' }).map((r) => r.actorId),
    ).toEqual(['a', 'c']);
  });
});

describe('nextSort', () => {
  it('starts a newly clicked column descending', () => {
    expect(nextSort(undefined, 'points')).toEqual({ columnCode: 'points', direction: 'desc' });
  });

  it('toggles direction on a repeat click of the same column', () => {
    const first = nextSort(undefined, 'points');
    expect(nextSort(first, 'points')).toEqual({ columnCode: 'points', direction: 'asc' });
  });

  it('starts a different column descending again, discarding the previous direction', () => {
    const onPoints = { columnCode: 'points', direction: 'asc' as const };
    expect(nextSort(onPoints, 'name')).toEqual({ columnCode: 'name', direction: 'desc' });
  });
});

describe('distributionBars', () => {
  const base: Pick<TableProjectionResponseData, 'rows' | 'defaultSort'> = {
    defaultSort: [{ columnCode: 'points', direction: 'desc' }],
    rows: [row('a', 1, false, 6), row('b', 2, false, 3), row('c', 3, false, 0)],
  };

  it('scales every bar against the leader, not a fixed axis maximum', () => {
    const bars = distributionBars(base);
    expect(bars.map((bar) => bar.widthPercent)).toEqual([100, 50, 0]);
  });

  it('labels a bar with a named column’s formatted text when one is given', () => {
    const named: Pick<TableProjectionResponseData, 'rows' | 'defaultSort'> = {
      defaultSort: base.defaultSort,
      rows: [
        {
          actorId: 'a',
          rank: 1,
          sharedRank: false,
          cells: { name: { formatted: 'Talleres' }, points: { raw: 6, formatted: '6' } },
        },
      ],
    };
    expect(distributionBars(named, { nameColumnCode: 'name' })[0]?.label).toBe('Talleres');
  });

  it('falls back to the actor id when no name column is given', () => {
    expect(distributionBars(base)[0]?.label).toBe('a');
  });

  it('returns nothing when the layout declares no default sort to chart', () => {
    expect(distributionBars({ ...base, defaultSort: [] })).toEqual([]);
  });

  it('produces zero-width bars rather than dividing by zero when nobody has scored', () => {
    const nobodyScored: Pick<TableProjectionResponseData, 'rows' | 'defaultSort'> = {
      defaultSort: base.defaultSort,
      rows: [row('a', 1, true, 0), row('b', 1, true, 0)],
    };
    expect(distributionBars(nobodyScored).every((bar) => bar.widthPercent === 0)).toBe(true);
  });
});

describe('tiebreakIndicator', () => {
  it('flags a shared rank', () => {
    expect(tiebreakIndicator(row('a', 1, true, 6))).toEqual({ kind: 'shared', icon: '=' });
  });

  it('shows nothing for a rank nothing else shares', () => {
    expect(tiebreakIndicator(row('a', 1, false, 6))).toEqual({ kind: 'none', icon: '' });
  });
});
