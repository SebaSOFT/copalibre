import { generateFixtures } from '@copalibre/tournament-engine';
import { persistedFixtureNodes, placementPlayOf } from './persisted-fixture-plan.js';

const graphOf = (
  count: number,
  placementPlay: 'none' | 'third-place' | 'all-places' = 'none',
  format: 'single-elimination' | 'double-elimination' = 'single-elimination',
) => {
  const result = generateFixtures({
    format,
    ...(format === 'single-elimination' ? { placementPlay } : {}),
    entrants: Array.from({ length: count }, (_, index) => ({
      entrantId: `0199a000-0000-7000-8000-${String(index + 1).padStart(12, '0')}`,
      seed: index + 1,
    })),
  });
  if (!result.ok) throw result.error;
  return result.value;
};

describe('persisted fixture plans', () => {
  it.each([
    ['none', 7],
    ['third-place', 8],
    ['all-places', 12],
  ] as const)('persists all eight-entrant %s nodes', (mode, count) => {
    expect(persistedFixtureNodes(graphOf(8, mode))).toHaveLength(count);
  });
  it('collapses bye sources onto the seeded entrant without materializing bye fixtures', () => {
    const nodes = persistedFixtureNodes(graphOf(6));
    expect(nodes).toHaveLength(5);
    expect(
      nodes
        .filter((node) => node.round === 2)
        .every((node) => node.sides.some((side) => side.kind === 'entrant')),
    ).toBe(true);
    const keys = new Set(nodes.map((node) => node.nodeKey));
    expect(
      nodes
        .flatMap((node) => node.sides)
        .filter((side) => 'matchId' in side)
        .every((side) => 'matchId' in side && keys.has(side.matchId)),
    ).toBe(true);
  });
  it('materializes the complete series span on every node, including placement nodes', () => {
    expect(
      persistedFixtureNodes(graphOf(8, 'all-places'), 3).every((node) => node.seriesSpan === 3),
    ).toBe(true);
  });
  it('keeps the double-elimination reset contingent', () => {
    expect(
      persistedFixtureNodes(graphOf(8, 'none', 'double-elimination')).filter(
        (node) => node.contingency === 'bracket-reset',
      ),
    ).toHaveLength(1);
  });
  it('resolves zone declarations before stage declarations and preserves an explicit none', () => {
    const overrides = {
      placementPlay: 'all-places',
      'zones.zone-a.placementPlay': 'third-place',
      'zones.zone-b.placementPlay': 'none',
    };
    expect(placementPlayOf(overrides, 'zone-a')).toBe('third-place');
    expect(placementPlayOf(overrides, 'zone-b')).toBe('none');
    expect(placementPlayOf(overrides, 'zone-c')).toBe('all-places');
    expect(placementPlayOf({})).toBe('none');
    expect(() => placementPlayOf({ placementPlay: 'unknown' })).toThrow('placementPlay');
  });
});
