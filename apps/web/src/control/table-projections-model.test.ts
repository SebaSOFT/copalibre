import { describe, expect, it } from '@jest/globals';
import type {
  TableColumnResponseData,
  TableLayoutSummaryResponse,
  TableProjectionResponseData,
  TableRowResponseData,
} from './lib/api-client.js';
import {
  comparatorChain,
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

function row(
  actorId: string,
  rank: number,
  sharedRank: boolean,
  raw: number,
): TableRowResponseData {
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
    expect(
      sortRows(rows, { columnCode: 'points', direction: 'desc' }).map((r) => r.actorId),
    ).toEqual(['a', 'b']);
  });

  it('sorts ascending by the given column', () => {
    expect(
      sortRows(rows, { columnCode: 'points', direction: 'asc' }).map((r) => r.actorId),
    ).toEqual(['b', 'a']);
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

describe('comparatorChain', () => {
  const columns = tableColumns(
    [
      { code: 'points', header: 'Points', shortHeader: 'Pts', format: 'number' },
      { code: 'head-to-head', header: 'Head to head', shortHeader: 'H2H', format: 'number' },
      { code: 'score-difference', header: 'Difference', shortHeader: 'Dif', format: 'number' },
    ],
    'en',
  );

  const projection = (
    rows: readonly (readonly [number, number, number])[],
  ): TableProjectionResponseData =>
    ({
      layoutCode: 'group-standings-default',
      target: 'group-phase',
      label: 'Standings',
      columns: [],
      projectionVersion: 1,
      defaultSort: [
        { columnCode: 'points', direction: 'desc' },
        { columnCode: 'head-to-head', direction: 'desc' },
        { columnCode: 'score-difference', direction: 'desc' },
      ],
      rows: rows.map(
        ([points, head, difference], index) =>
          ({
            actorId: `entrant-${index}`,
            rank: index + 1,
            cells: {
              points: { raw: points, formatted: String(points) },
              'head-to-head': { raw: head, formatted: String(head) },
              'score-difference': { raw: difference, formatted: String(difference) },
            },
          }) as unknown as TableRowResponseData,
      ),
    }) as unknown as TableProjectionResponseData;

  it('names the chain in the order the layout declared it', () => {
    const chain = comparatorChain(projection([[6, 3, 3]]), columns);
    expect(chain.map((rule) => rule.columnCode)).toEqual([
      'points',
      'head-to-head',
      'score-difference',
    ]);
    expect(chain.map((rule) => rule.step)).toEqual([1, 2, 3]);
  });

  it('labels each rule from the column it names', () => {
    const chain = comparatorChain(projection([[6, 3, 3]]), columns);
    expect(chain.map((rule) => rule.label)).toEqual(['Pts', 'H2H', 'Dif']);
  });

  it('marks the rule that separated two rows level on the one before it', () => {
    const chain = comparatorChain(
      projection([
        [6, 3, 3],
        [6, 0, 2],
        [4, 0, -1],
      ]),
      columns,
    );
    expect(chain.find((rule) => rule.triggered)?.columnCode).toBe('head-to-head');
  });

  it('marks nothing where no two rows were ever level', () => {
    const chain = comparatorChain(
      projection([
        [6, 0, 3],
        [4, 0, 1],
        [1, 0, -4],
      ]),
      columns,
    );
    expect(chain.some((rule) => rule.triggered)).toBe(false);
  });

  it('never credits a later rule that never got consulted', () => {
    // Level on points, separated by the head-to-head; the difference also
    // differs, but the chain had already ended by the time it was reached.
    const chain = comparatorChain(
      projection([
        [6, 3, 9],
        [6, 0, 1],
      ]),
      columns,
    );
    expect(chain.filter((rule) => rule.triggered)).toHaveLength(1);
    expect(chain.find((rule) => rule.triggered)?.columnCode).toBe('head-to-head');
  });

  it('returns no chain where the layout declares no sort at all', () => {
    const none = { ...projection([[6, 0, 3]]), defaultSort: [] };
    expect(comparatorChain(none, columns)).toEqual([]);
  });

  it('returns no chain where there is no projection yet', () => {
    expect(comparatorChain(undefined, columns)).toEqual([]);
  });
});
