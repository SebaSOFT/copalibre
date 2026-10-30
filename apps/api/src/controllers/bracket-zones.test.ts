import { orderZonesByPromotionBands, type StageZone } from './bracket-zones.js';

describe('orderZonesByPromotionBands', () => {
  it('orders zones by declared band order and keeps unbanded zones after them', () => {
    const zones: readonly StageZone[] = [
      { zoneId: 'bronze', zoneName: 'Copa Bronce' },
      { zoneId: 'oro', zoneName: 'Copa Oro' },
      { zoneId: 'plata', zoneName: 'Copa Plata' },
      { zoneId: 'placement', zoneName: 'Clasificación' },
    ];

    const ordered = orderZonesByPromotionBands(zones, [
      {
        bands: [{ zoneRef: 'Copa Oro' }, { zoneRef: 'Copa Plata' }, { zoneRef: 'Copa Bronce' }],
      },
    ]);

    expect(ordered.map((zone) => zone.zoneName)).toEqual([
      'Copa Oro',
      'Copa Plata',
      'Copa Bronce',
      'Clasificación',
    ]);
  });

  it('keeps declared zone order when promotion bands are absent', () => {
    const zones: readonly StageZone[] = [
      { zoneId: 'silver', zoneName: 'Copa Plata' },
      { zoneId: 'gold', zoneName: 'Copa Oro' },
    ];

    expect(orderZonesByPromotionBands(zones, [])).toBe(zones);
  });

  it('ignores unknown and duplicate band references', () => {
    const zones: readonly StageZone[] = [
      { zoneId: 'silver', zoneName: 'Copa Plata' },
      { zoneId: 'gold', zoneName: 'Copa Oro' },
    ];

    const ordered = orderZonesByPromotionBands(zones, [
      {
        bands: [{ zoneRef: 'Missing zone' }, { zoneRef: 'Copa Oro' }],
      },
      { bands: [{ zoneRef: 'Copa Oro' }] },
    ]);

    expect(ordered.map((zone) => zone.zoneName)).toEqual(['Copa Oro', 'Copa Plata']);
  });
});
