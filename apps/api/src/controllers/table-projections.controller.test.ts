import { describe, expect, it } from 'vitest';
import type { TableProjectionResult } from '../table-projections/read.js';
import { tableResponse } from './table-projections.controller.js';

const row = (actorId: string, rank: number, separatedFromAboveBy?: string) => ({
  actorId,
  actorName: actorId,
  rank,
  sharedRank: false,
  ...(separatedFromAboveBy === undefined ? {} : { separatedFromAboveBy }),
  cells: {},
});

describe('tableResponse', () => {
  it('carries the column that separated a row from the row above, and nothing when none did', () => {
    const result = {
      layout: {
        code: 'group-standings-default',
        target: 'group-phase',
        label: { en: 'Group Standings' },
        entityGranularity: 'team',
        defaultSort: [
          { columnCode: 'points', direction: 'desc' },
          { columnCode: 'goal-average', direction: 'desc' },
        ],
        columns: [],
      },
      rows: [row('lomas', 1), row('hispano', 2, 'goal-average'), row('corazonistas', 3)],
      projectionVersion: 1,
      columnDescriptions: {},
    } as unknown as TableProjectionResult;

    const response = tableResponse(result);

    expect(response.rows.map((entry) => entry.separatedFromAboveBy)).toEqual([
      undefined,
      'goal-average',
      undefined,
    ]);
    expect(response.rows[0]).not.toHaveProperty('separatedFromAboveBy');
  });
});
