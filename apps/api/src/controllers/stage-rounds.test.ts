import type { Zone } from '@copalibre/domain';
import { chooseRoundZone, inZone, isDynamicRoundFormat } from './stage-rounds.js';

const zone = (number: number, format?: Zone['format']): Zone => ({
  zoneId: `zone-${number}`,
  stageId: 'stage',
  number,
  name: `Zona ${number}`,
  ...(format === undefined ? {} : { format }),
});

describe('isDynamicRoundFormat', () => {
  it('accepts the formats whose next round is derived and nothing else', () => {
    expect(isDynamicRoundFormat('swiss')).toBe(true);
    expect(isDynamicRoundFormat('single-elimination')).toBe(true);
    expect(isDynamicRoundFormat('round-robin')).toBe(false);
    expect(isDynamicRoundFormat('free-for-all')).toBe(false);
  });
});

describe('chooseRoundZone', () => {
  const stage = { format: 'swiss' } as const;

  it('reports a stage with no zone as having none', () => {
    expect(chooseRoundZone([], stage, undefined)).toEqual({ kind: 'none' });
  });

  it('takes the only zone of a single-zone stage without being told', () => {
    expect(chooseRoundZone([zone(1)], stage, undefined)).toEqual({
      kind: 'zone',
      zone: zone(1),
    });
  });

  it('takes the named zone of a multi-zone stage', () => {
    expect(chooseRoundZone([zone(1), zone(2)], stage, 2)).toEqual({ kind: 'zone', zone: zone(2) });
  });

  it('requires a name on a multi-zone stage and lists the zones that could advance', () => {
    expect(chooseRoundZone([zone(1), zone(2, 'round-robin'), zone(3)], stage, undefined)).toEqual({
      kind: 'required',
      eligible: [1, 3],
    });
  });

  it('lists a zone that overrides a non-dynamic stage with a dynamic format', () => {
    expect(
      chooseRoundZone([zone(1), zone(2, 'swiss')], { format: 'round-robin' }, undefined),
    ).toEqual({ kind: 'required', eligible: [2] });
  });

  it('reports a zone number the stage does not have', () => {
    expect(chooseRoundZone([zone(1), zone(2)], stage, 9)).toEqual({
      kind: 'unknown',
      requested: 9,
    });
  });
});

describe('inZone', () => {
  const items = [
    { id: 'a', zoneId: 'zone-1' },
    { id: 'b', zoneId: 'zone-2' },
    { id: 'c', zoneId: 'zone-1' },
  ];

  it('keeps only the zone’s items', () => {
    expect(inZone(items, zone(1)).map((item) => item.id)).toEqual(['a', 'c']);
  });

  it('returns every item when there is no zone to scope by', () => {
    expect(inZone(items, undefined)).toBe(items);
  });
});
