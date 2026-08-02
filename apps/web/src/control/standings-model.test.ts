import { describe, expect, it } from '@jest/globals';
import {
  distributionBars,
  standingsColumns,
  tiebreakIndicator,
  toRowViews,
  type StandingsRowData,
} from './lib/standings.js';

const rows: readonly StandingsRowData[] = [
  {
    rank: 1,
    entrantId: 'a',
    sharedRank: false,
    statistics: { played: 6, wins: 5, points: 16 },
    tieBroken: false,
  },
  {
    rank: 2,
    entrantId: 'b',
    sharedRank: false,
    statistics: { played: 6, wins: 4, points: 12 },
    tieBroken: true,
  },
  {
    rank: 3,
    entrantId: 'c',
    sharedRank: true,
    statistics: { played: 6, wins: 4, points: 12 },
    tieBroken: true,
  },
];

/** Indexed access without a non-null assertion, which the lint rules forbid. */
function rowAt(index: number): StandingsRowData {
  return rows[index] as StandingsRowData;
}

describe('standingsColumns', () => {
  it('orders the canonical columns as the table reads them', () => {
    expect(standingsColumns(rows).map((column) => column.code)).toEqual([
      'played',
      'wins',
      'points',
    ]);
  });

  it('keeps a discipline-specific statistic rather than dropping it', () => {
    const withFrags = [{ ...rowAt(0), statistics: { ...rowAt(0).statistics, frags: 30 } }] as const;

    expect(standingsColumns(withFrags).map((column) => column.code)).toContain('frags');
  });
});

describe('distributionBars', () => {
  it('scales every bar against the leader', () => {
    const bars = distributionBars(rows);

    expect(bars.map((bar) => bar.widthPercent)).toEqual([100, 75, 75]);
  });

  it('takes only the requested top N', () => {
    expect(distributionBars(rows, { top: 2 })).toHaveLength(2);
  });

  it('draws nothing when nobody has scored', () => {
    const scoreless = rows.map((row) => ({ ...row, statistics: { points: 0 } }));

    expect(distributionBars(scoreless).every((bar) => bar.widthPercent === 0)).toBe(true);
  });

  it('reads a missing statistic as zero rather than crashing', () => {
    const missing = [{ ...rowAt(0), statistics: {} }];

    expect(distributionBars(missing)[0]?.value).toBe(0);
  });

  it('labels bars with the entrant name when one is known', () => {
    const bars = distributionBars(rows, { names: { a: { name: 'Talleres' } } });

    expect(bars[0]?.label).toBe('Talleres');
    expect(bars[1]?.label).toBe('b');
  });
});

describe('tiebreakIndicator', () => {
  it('distinguishes the three states by icon and text, not colour', () => {
    expect(tiebreakIndicator(rowAt(0))).toMatchObject({ kind: 'none' });
    expect(tiebreakIndicator(rowAt(1))).toMatchObject({ kind: 'resolved', label: 'Desempatado' });
    expect(tiebreakIndicator(rowAt(2))).toMatchObject({
      kind: 'shared',
      label: 'Posición compartida',
    });

    for (const row of rows.slice(1)) {
      const indicator = tiebreakIndicator(row);
      expect(indicator.icon).not.toBe('');
      expect(indicator.label).not.toBe('');
    }
  });
});

describe('toRowViews', () => {
  it('marks only the tie-broken rows as expandable', () => {
    expect(toRowViews(rows).map((row) => row.expandable)).toEqual([false, true, true]);
  });

  it('carries the abbreviation when one is known', () => {
    const views = toRowViews(rows, { a: { name: 'Talleres de Mendoza', abbreviation: 'TLL A' } });

    expect(views[0]).toMatchObject({ name: 'Talleres de Mendoza', abbreviation: 'TLL A' });
    expect(views[1]?.abbreviation).toBeUndefined();
  });
});
