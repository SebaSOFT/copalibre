import {
  planZoneFixtures,
  ZoneFixturePlanError,
  type PlannedZoneInput,
} from './zone-fixture-plan.js';

const zone = (
  number: number,
  entrantIds: readonly string[],
  format?: PlannedZoneInput['format'],
): PlannedZoneInput => ({
  zoneId: `zone-${number}`,
  zoneName: `Zona ${number}`,
  ...(format === undefined ? {} : { format }),
  entrantIds: new Set(entrantIds),
});

const ORDER = ['a', 'b', 'c', 'd', 'e', 'f'];

describe('planZoneFixtures', () => {
  it('yields one un-zoned graph in the stage format when no zone has entrants', () => {
    expect(
      planZoneFixtures({
        stageFormat: 'single-elimination',
        zones: [zone(1, []), zone(2, [], 'round-robin')],
        orderedEntrantIds: ORDER,
      }),
    ).toEqual([{ format: 'single-elimination', entrantIds: ORDER }]);
  });

  it('yields the same un-zoned graph for a stage that declares no zones at all', () => {
    expect(
      planZoneFixtures({ stageFormat: 'round-robin', zones: [], orderedEntrantIds: ORDER }),
    ).toEqual([{ format: 'round-robin', entrantIds: ORDER }]);
  });

  it('gives each drawn zone its own format and keeps the flat seed order inside it', () => {
    const plans = planZoneFixtures({
      stageFormat: 'single-elimination',
      zones: [zone(1, ['f', 'a']), zone(2, ['b', 'c'], 'round-robin'), zone(3, ['e', 'd'])],
      orderedEntrantIds: ORDER,
    });

    expect(plans).toEqual([
      { zoneId: 'zone-1', format: 'single-elimination', entrantIds: ['a', 'f'] },
      { zoneId: 'zone-2', format: 'round-robin', entrantIds: ['b', 'c'] },
      { zoneId: 'zone-3', format: 'single-elimination', entrantIds: ['d', 'e'] },
    ]);
  });

  it('skips a zone nobody was drawn into once other zones have entrants', () => {
    const plans = planZoneFixtures({
      stageFormat: 'round-robin',
      zones: [zone(1, ORDER), zone(2, [])],
      orderedEntrantIds: ORDER,
    });

    expect(plans.map((plan) => plan.zoneId)).toEqual(['zone-1']);
  });

  it('refuses a seeded entrant that no zone holds', () => {
    expect(() =>
      planZoneFixtures({
        stageFormat: 'round-robin',
        zones: [zone(1, ['a', 'b', 'c'])],
        orderedEntrantIds: ['a', 'b', 'c', 'd'],
      }),
    ).toThrow(ZoneFixturePlanError);
  });

  it('ignores a zone entrant that is not in the seed order', () => {
    const plans = planZoneFixtures({
      stageFormat: 'round-robin',
      zones: [zone(1, ['a', 'b', 'withdrawn'])],
      orderedEntrantIds: ['a', 'b'],
    });

    expect(plans[0]?.entrantIds).toEqual(['a', 'b']);
  });
});
