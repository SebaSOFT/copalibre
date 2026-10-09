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

  describe('zones that play different formats', () => {
    const six = (prefix: string): GenerateFixturesInput['entrants'] =>
      [1, 2, 3, 4, 5, 6].map((seed) => ({ entrantId: `${prefix}-${seed}`, seed }));
    const mixed = () =>
      generateGroupedFixtures({
        stageId: 'stage-1',
        format: 'single-elimination',
        groups: [
          { zoneId: 'zone-1', groupId: 'group-1', entrants: entrants('a') },
          { zoneId: 'zone-2', groupId: 'group-2', entrants: entrants('b') },
          { zoneId: 'zone-3', groupId: 'group-3', entrants: six('r'), format: 'round-robin' },
        ],
      });

    it('builds knockout trees for the inheriting zones and a league for the declaring one', () => {
      const result = mixed();
      if (!result.ok) throw result.error;
      const byZone = (zoneId: string) =>
        result.value.filter((fixture) => fixture.zoneId === zoneId);

      // 4 entrants knock out in 3 matches over 2 rounds; 6 play 15 matches over 5 rounds.
      expect(byZone('zone-1')).toHaveLength(3);
      expect(byZone('zone-2')).toHaveLength(3);
      expect(byZone('zone-3')).toHaveLength(15);
      expect(Math.max(...byZone('zone-1').map((f) => f.match.round))).toBe(2);
      expect(Math.max(...byZone('zone-3').map((f) => f.match.round))).toBe(5);
    });

    it('matches what each format generates alone', () => {
      const result = mixed();
      if (!result.ok) throw result.error;
      const alone = generateFixtures({ format: 'round-robin', entrants: six('r') });
      if (!alone.ok) throw alone.error;

      expect(
        result.value.filter((fixture) => fixture.zoneId === 'zone-3').map((f) => f.match),
      ).toEqual(alone.value.matches);
    });

    it('never lets a match name an entrant of another zone', () => {
      const result = mixed();
      if (!result.ok) throw result.error;
      const prefixOf = { 'zone-1': 'a-', 'zone-2': 'b-', 'zone-3': 'r-' } as const;

      for (const fixture of result.value) {
        for (const slot of slotsOf(fixture.match)) {
          if (slot.kind !== 'entrant') continue;
          expect(slot.entrantId.startsWith(prefixOf[fixture.zoneId as keyof typeof prefixOf])).toBe(
            true,
          );
        }
      }
    });

    it('returns a typed error naming an unsupported format declared by one zone', () => {
      const result = generateGroupedFixtures({
        stageId: 'stage-1',
        format: 'single-elimination',
        groups: [
          {
            zoneId: 'zone-1',
            groupId: 'group-1',
            entrants: entrants('a'),
            format: 'not-a-format' as GenerateFixturesInput['format'],
          },
        ],
      });

      expect(result.ok).toBe(false);
    });
  });
});
