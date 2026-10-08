import { winnerZonesOf } from './tv-winners.ts';

const champion = (name: string, clubId?: string, emblemObjectId?: string) => ({
  entrantId: `entrant-${name}`,
  name,
  abbreviation: name.slice(0, 3).toUpperCase(),
  ...(clubId === undefined ? {} : { clubId }),
  ...(emblemObjectId === undefined ? {} : { emblemObjectId }),
});

describe('winnerZonesOf', () => {
  it('maps every zone, in order, with its champion and the club emblem route', () => {
    const zones = winnerZonesOf('panamericano-demo', [
      {
        zoneName: 'Copa Oro',
        champion: champion('Andes', 'club-1', 'obj-1'),
        champions: [champion('Andes', 'club-1', 'obj-1')],
      },
      {
        zoneName: 'Copa Plata',
        champion: champion('Concepcion', 'club-2'),
        champions: [champion('Concepcion', 'club-2')],
      },
    ]);

    expect(zones.map((zone) => zone.zoneName)).toEqual(['Copa Oro', 'Copa Plata']);
    expect(zones[0]?.champions[0]?.emblemUrl).toBe(
      '/organizations/panamericano-demo/clubs/club-1/emblem',
    );
    expect(zones[1]?.champions[0]?.emblemUrl).toBeUndefined();
  });

  it('lists every co-champion of a shared title', () => {
    const [zone] = winnerZonesOf('o', [
      {
        zoneName: 'Copa Bronce',
        champion: champion('Atletico'),
        champions: [champion('Atletico'), champion('Estudiantil')],
      },
    ]);
    expect(zone?.champions.map((c) => c.name)).toEqual(['Atletico', 'Estudiantil']);
  });

  it('reads the singular champion of an older response, and none without winners', () => {
    const [zone] = winnerZonesOf('o', [{ champion: champion('Huracan') }]);
    expect(zone?.zoneName).toBeUndefined();
    expect(zone?.champions.map((c) => c.name)).toEqual(['Huracan']);
    expect(winnerZonesOf('o', undefined)).toEqual([]);
  });
});
