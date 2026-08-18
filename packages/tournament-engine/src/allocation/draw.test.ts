import type { DrawConstraint, EntrantAttribute } from '@copalibre/domain';
import { DrawError } from '../errors.js';
import { drawGroups, drawZones } from './draw.js';

const categorical = (key: string, value: string): readonly EntrantAttribute[] => [
  { key, value, kind: 'categorical' },
];

const regionalEntrants = [
  { entrantId: 'andes', attributes: categorical('region', 'san-juan') },
  { entrantId: 'caucete', attributes: categorical('region', 'san-juan') },
  { entrantId: 'pocito', attributes: categorical('region', 'mendoza') },
  { entrantId: 'rawson', attributes: categorical('region', 'mendoza') },
];

const separateRegions: DrawConstraint = {
  kind: 'separation',
  hook: 'draw.assign-group',
  attribute: 'region',
  scope: 'group',
};

describe('zone and group draws', () => {
  it.each([7, 31, 97])('separates regions across zones for seed %i', (seed) => {
    const { assignment } = drawZones(regionalEntrants, [separateRegions], 2, seed);
    const groups = assignment.groups ?? {};

    expect(groups.andes).not.toBe(groups.caucete);
    expect(groups.pocito).not.toBe(groups.rawson);
  });

  it.each([11, 41, 101])('honours a tier distribution while drawing groups for seed %i', (seed) => {
    const entrants = ['a', 'b', 'c', 'd', 'e', 'f'].map((entrantId, index) => ({
      entrantId,
      attributes: categorical('tier', index < 3 ? 'one' : 'two'),
    }));
    const { assignment } = drawGroups(
      entrants,
      [
        {
          kind: 'distribution',
          hook: 'draw.assign-group',
          attribute: 'tier',
          value: 'one',
          max: 1,
        },
      ],
      3,
      seed,
    );
    const groups = assignment.groups ?? {};

    expect(new Set(['a', 'b', 'c'].map((entrantId) => groups[entrantId])).size).toBe(3);
  });

  it('uses runDraw’s pigeonhole explanation for an unsatisfiable zone draw', () => {
    const entrants = [
      ...regionalEntrants.slice(0, 2),
      { entrantId: 'zonda', attributes: categorical('region', 'san-juan') },
    ];

    expect(() => drawZones(entrants, [separateRegions], 2, 7)).toThrow(DrawError);
    expect(() => drawZones(entrants, [separateRegions], 2, 7)).toThrow(/Unsatisfiable: 3 entrants/);
  });
});
