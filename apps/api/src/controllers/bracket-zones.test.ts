import {
  orderZonesByPromotionBands,
  overallPlaceOffsetsForZones,
  type StageZone,
} from './bracket-zones.js';

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

describe('overallPlaceOffsetsForZones', () => {
  const threeCupZones: readonly StageZone[] = [
    { zoneId: 'oro', zoneName: 'Copa Oro' },
    { zoneId: 'plata', zoneName: 'Copa Plata' },
    { zoneId: 'bronce', zoneName: 'Copa Bronce' },
  ];

  it('yields offsets 0, 8, 16 for three 8-entrant bands (5th place of third band is 21st overall)', () => {
    const offsets = overallPlaceOffsetsForZones(threeCupZones, [
      {
        bands: [
          { zoneRef: 'Copa Oro', count: 8 },
          { zoneRef: 'Copa Plata', count: 8 },
          { zoneRef: 'Copa Bronce', count: 8 },
        ],
      },
    ]);

    expect(offsets.get('Copa Oro')).toBe(0);
    expect(offsets.get('Copa Plata')).toBe(8);
    expect(offsets.get('Copa Bronce')).toBe(16);
    expect((offsets.get('Copa Bronce') ?? 0) + 5).toBe(21);
  });

  it('returns empty map for overlapping bands or gapped bands', () => {
    const overlapping = overallPlaceOffsetsForZones(threeCupZones, [
      {
        bands: [
          { zoneRef: 'Copa Oro', count: 8, firstSeed: 1, lastSeed: 8 },
          { zoneRef: 'Copa Plata', count: 8, firstSeed: 7, lastSeed: 14 },
          { zoneRef: 'Copa Bronce', count: 8, firstSeed: 15, lastSeed: 22 },
        ],
      },
    ]);
    expect(overlapping.size).toBe(0);

    const gapped = overallPlaceOffsetsForZones(threeCupZones, [
      {
        bands: [
          { zoneRef: 'Copa Oro', count: 8, firstSeed: 1, lastSeed: 8 },
          { zoneRef: 'Copa Plata', count: 8, firstSeed: 10, lastSeed: 17 },
          { zoneRef: 'Copa Bronce', count: 8, firstSeed: 18, lastSeed: 25 },
        ],
      },
    ]);
    expect(gapped.size).toBe(0);
  });

  it('returns empty map for duplicate zone targets, unmatched zones, or un-zoned stages', () => {
    const duplicateTarget = overallPlaceOffsetsForZones(threeCupZones, [
      {
        bands: [
          { zoneRef: 'Copa Oro', count: 8 },
          { zoneRef: 'Copa Oro', count: 8 },
          { zoneRef: 'Copa Plata', count: 8 },
        ],
      },
    ]);
    expect(duplicateTarget.size).toBe(0);

    const unmatchedZone = overallPlaceOffsetsForZones(
      [...threeCupZones, { zoneId: 'extra', zoneName: 'Clasificación' }],
      [
        {
          bands: [
            { zoneRef: 'Copa Oro', count: 8 },
            { zoneRef: 'Copa Plata', count: 8 },
            { zoneRef: 'Copa Bronce', count: 8 },
          ],
        },
      ],
    );
    expect(unmatchedZone.size).toBe(0);

    const unzoned = overallPlaceOffsetsForZones(
      [{ zoneId: undefined, zoneName: undefined }],
      [{ bands: [{ zoneRef: 'Copa Oro', count: 8 }] }],
    );
    expect(unzoned.size).toBe(0);
  });
});
