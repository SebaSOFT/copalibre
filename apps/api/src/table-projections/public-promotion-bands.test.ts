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

  it('keeps each row promotionSeed equal to its combined-order position inside its band firstSeed..lastSeed range', () => {
    const thirdId = '01890000-0000-7000-8000-000000000003';
    const fourthId = '01890000-0000-7000-8000-000000000004';
    const multiGroupProjection: TableProjectionResponse = {
      ...projection,
      rows: [
        ...projection.rows,
        {
          actorId: thirdId,
          entrantId: thirdId,
          actorName: 'Belgrano',
          rank: 3,
          sharedRank: false,
          cells: { rank: { formatted: '3' } },
        },
        {
          actorId: fourthId,
          entrantId: fourthId,
          actorName: 'Instituto',
          rank: 4,
          sharedRank: false,
          cells: { rank: { formatted: '4' } },
        },
      ],
      segments: [
        {
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
              actorId: thirdId,
              entrantId: thirdId,
              actorName: 'Belgrano',
              rank: 2,
              sharedRank: false,
              cells: { rank: { formatted: '2' } },
            },
          ],
        },
        {
          groupName: 'Grupo B',
          rows: [
            {
              actorId: independienteId,
              entrantId: independienteId,
              actorName: 'Independiente',
              rank: 1,
              sharedRank: false,
              cells: { rank: { formatted: '1' } },
            },
            {
              actorId: fourthId,
              entrantId: fourthId,
              actorName: 'Instituto',
              rank: 2,
              sharedRank: false,
              cells: { rank: { formatted: '2' } },
            },
          ],
        },
      ],
    };

    const result = withPublicPromotionBands(multiGroupProjection, [
      {
        label: 'Copa Oro',
        index: 0,
        firstSeed: 1,
        lastSeed: 2,
        seeds: [
          { entrantId: independienteId, seed: 1 },
          { entrantId: talleresId, seed: 2 },
        ],
      },
      {
        label: 'Copa Plata',
        index: 1,
        firstSeed: 3,
        lastSeed: 4,
        seeds: [
          { entrantId: fourthId, seed: 3 },
          { entrantId: thirdId, seed: 4 },
        ],
      },
    ]);

    for (const segment of result.segments ?? []) {
      for (const row of segment.rows) {
        const band = result.promotionBands?.find((b) => b.label === row.promotionBandLabel);
        expect(band).toBeDefined();
        if (!band) throw new Error('Expected matching promotion band');
        expect(row.promotionSeed).toBeGreaterThanOrEqual(band.firstSeed);
        expect(row.promotionSeed).toBeLessThanOrEqual(band.lastSeed);
      }
    }
    expect(result.segments?.[1]?.rows[0]?.promotionSeed).toBe(1);
    expect(result.segments?.[0]?.rows[0]?.promotionSeed).toBe(2);
    expect(result.segments?.[1]?.rows[1]?.promotionSeed).toBe(3);
    expect(result.segments?.[0]?.rows[1]?.promotionSeed).toBe(4);
  });
});
