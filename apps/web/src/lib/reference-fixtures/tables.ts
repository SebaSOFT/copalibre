/** Table layout and table projection fixtures, with and without promotion bands. */

import type {
  TableLayoutSummaryResponse,
  TableProjectionResponse,
} from '@copalibre/api/src/dto/table-projections.dto.js';
import { referenceStandingsTable } from './standings.ts';

/** The declared table layouts and a `team-ranking` projection over the tied standings. */
export function referenceTableLayouts(): TableLayoutSummaryResponse[] {
  return [
    { code: 'group-table', target: 'group-phase', label: 'Group Table', entityGranularity: 'team' },
    {
      code: 'top-scorers',
      target: 'player-ranking',
      label: 'Top Scorers',
      entityGranularity: 'player',
    },
  ];
}

export function referenceTableProjection(): TableProjectionResponse {
  const table = referenceStandingsTable();
  const cell = (value: number) => ({ raw: value, formatted: String(value) });
  return {
    layoutCode: 'group-table',
    target: 'group-phase',
    label: 'Group Table',
    columns: [
      { code: 'played', header: 'P', description: 'Played', format: 'number' },
      { code: 'wins', header: 'W', description: 'Wins', format: 'number' },
      { code: 'draws', header: 'D', description: 'Draws', format: 'number' },
      { code: 'losses', header: 'L', description: 'Losses', format: 'number' },
      { code: 'goals-for', header: 'GF', description: 'Goals for', format: 'number' },
      { code: 'goals-against', header: 'GA', description: 'Goals against', format: 'number' },
      { code: 'score-difference', header: 'GD', description: 'GF − GA', format: 'number' },
      { code: 'points', header: 'Pts', format: 'number' },
    ],
    defaultSort: [{ columnCode: 'points', direction: 'desc' }],
    rows: table.rows.map((row) => ({
      actorId: row.entrantId,
      entrantId: row.entrantId,
      actorName: row.name,
      entrantName: row.name,
      entrantAbbreviation: row.abbreviation,
      rank: row.rank,
      sharedRank: row.sharedRank,
      cells: Object.fromEntries(
        Object.entries(row.statistics)
          .filter(([code]) => code !== 'head-to-head')
          .map(([code, value]) => [code, cell(value)]),
      ),
    })),
    projectionVersion: 12,
  };
}

/** The same table with explicit saved-plan data for reviewing promotion labels. */
export function referencePromotionTableProjection(): TableProjectionResponse {
  const projection = referenceTableProjection();
  const promotionBands = [
    { label: 'Copa oro', index: 0, firstSeed: 1, lastSeed: 2 },
    { label: 'Copa plata', index: 1, firstSeed: 3, lastSeed: 4 },
  ];

  return {
    ...projection,
    promotionBands,
    rows: projection.rows.map((row, index) => {
      const bandIndex = index < 2 ? 0 : index < 4 ? 1 : undefined;
      const band = bandIndex === undefined ? undefined : promotionBands[bandIndex];
      return band === undefined
        ? row
        : {
            ...row,
            promotionBandLabel: band.label,
            promotionBandIndex: band.index,
            promotionSeed: index + 1,
          };
    }),
  };
}
