import type { TableProjectionResponse } from '../dto/table-projections.dto.js';
import { withPublicPromotionBands } from './public-promotion-bands.js';

const talleresId = '01890000-0000-7000-8000-000000000001';
const independienteId = '01890000-0000-7000-8000-000000000002';

const projection: TableProjectionResponse = {
  layoutCode: 'group-standings-default',
  target: 'group-phase',
  label: { en: 'Group standings' },
  columns: [{ code: 'rank', header: { en: '#' }, format: 'number' }],
  defaultSort: [{ columnCode: 'rank', direction: 'asc' }],
  projectionVersion: 1,
  rows: [
    {
      actorId: talleresId,
      entrantId: talleresId,
      actorName: 'Talleres',
      rank: 1,
      sharedRank: false,
      cells: { rank: { formatted: '1' } },
    },
    {
      actorId: independienteId,
      entrantId: independienteId,
      actorName: 'Independiente',
      rank: 2,
      sharedRank: false,
      cells: { rank: { formatted: '2' } },
    },
  ],
  segments: [
    {
      zoneName: 'Zona Norte',
      groupName: 'Grupo A',
      rows: [
        {
          actorId: talleresId,
          entrantId: talleresId,
          actorName: 'Talleres',
          rank: 1,
          sharedRank: false,
          cells: { rank: { formatted: '1' } },
        },
        {
          actorId: independienteId,
          entrantId: independienteId,
          actorName: 'Independiente',
          rank: 2,
          sharedRank: false,
          cells: { rank: { formatted: '2' } },
        },
      ],
    },
  ],
};

describe('withPublicPromotionBands', () => {
  it('does not alter a projection when no saved promotion bands are configured', () => {
    expect(withPublicPromotionBands(projection, [])).toBe(projection);
  });

  it('adds only configured promotion seeds to matching rows and segments', () => {
    const result = withPublicPromotionBands(projection, [
      {
        label: 'Copa oro',
        sourceZoneName: 'Zona Norte',
        index: 0,
        firstSeed: 1,
        lastSeed: 1,
        seeds: [{ entrantId: talleresId, seed: 1 }],
      },
    ]);

    expect(result.promotionBands).toEqual([
      {
        label: 'Copa oro',
        sourceZoneName: 'Zona Norte',
        index: 0,
        firstSeed: 1,
        lastSeed: 1,
      },
    ]);
    expect(result.rows[0]).toMatchObject({
      entrantId: talleresId,
      promotionBandLabel: 'Copa oro',
      promotionBandIndex: 0,
      promotionSeed: 1,
    });
    expect(result.rows[1]).not.toHaveProperty('promotionBandLabel');
    expect(result.segments?.[0]?.rows[0]).toMatchObject({
      promotionBandLabel: 'Copa oro',
      promotionSeed: 1,
    });
    expect(result.segments?.[0]?.rows[1]).not.toHaveProperty('promotionBandLabel');
  });
});
