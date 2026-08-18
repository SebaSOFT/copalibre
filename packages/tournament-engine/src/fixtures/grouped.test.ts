import type { GenerateFixturesInput } from '../types.js';
import { slotsOf } from '../types.js';
import { generateFixtures } from './index.js';
import { generateGroupedFixtures } from './grouped.js';

const entrants = (prefix: string): GenerateFixturesInput['entrants'] =>
  [1, 2, 3, 4].map((seed) => ({ entrantId: `${prefix}-${seed}`, seed }));

describe('group-scoped fixture generation', () => {
  it.each([
    'single-elimination',
    'double-elimination',
    'round-robin',
    'round-robin-single-leg',
    'round-robin-home-away',
    'league',
    'free-for-all',
    'heats',
  ] as const)('keeps one implicit group byte-for-byte identical for %s', (format) => {
    const input = { format, entrants: entrants('a') };
    const core = generateFixtures(input);
    const grouped = generateGroupedFixtures({
      stageId: 'stage-1',
      format: input.format,
      groups: [{ zoneId: 'zone-1', groupId: 'group-1', entrants: input.entrants }],
    });
    if (!core.ok) throw core.error;
    if (!grouped.ok) throw grouped.error;

    expect(grouped.value.map((fixture) => fixture.match)).toEqual(core.value.matches);
    expect(grouped.value).toEqual(
      core.value.matches.map((match) => ({
        stageId: 'stage-1',
        zoneId: 'zone-1',
        groupId: 'group-1',
        match,
      })),
    );
  });

  it('generates two independent round robins without cross-group fixtures', () => {
    const result = generateGroupedFixtures({
      stageId: 'stage-1',
      format: 'round-robin',
      groups: [
        { zoneId: 'zone-1', groupId: 'group-a', entrants: entrants('a') },
        { zoneId: 'zone-1', groupId: 'group-b', entrants: entrants('b') },
      ],
    });
    if (!result.ok) throw result.error;

    expect(result.value).toHaveLength(12);
    for (const fixture of result.value) {
      const expectedPrefix = fixture.groupId === 'group-a' ? 'a-' : 'b-';
      expect(slotsOf(fixture.match)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entrantId: expect.stringMatching(new RegExp(`^${expectedPrefix}`)),
          }),
        ]),
      );
      expect(slotsOf(fixture.match)).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entrantId: expect.stringMatching(new RegExp(`^(?!${expectedPrefix})`)),
          }),
        ]),
      );
    }
  });
});
