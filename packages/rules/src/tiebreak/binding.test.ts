import { bindCapabilities, type CapabilityBinding } from '@copalibre/domain';
import { fixtureDescriptor, fixtureProfile } from '@copalibre/domain';
import { bindTiebreakPipeline, overriddenGaps } from './binding.js';
import { resolveTiebreak } from './pipeline.js';

const capabilityPipeline = {
  id: 'winter-league',
  version: 1,
  parameters: [
    {
      capability: 'primary-scoring',
      label: 'Scored',
      direction: 'higher_wins' as const,
      missingValue: 'treat-as-zero' as const,
    },
    {
      capability: 'defensive-record',
      label: 'Conceded',
      direction: 'lower_wins' as const,
      missingValue: 'treat-as-worst' as const,
    },
  ],
};

const football = () =>
  fixtureDescriptor({
    name: 'Football',
    statistics: [
      { code: 'goals-for', label: 'Goals For', aggregation: 'sum' },
      { code: 'goals-against', label: 'Goals Against', aggregation: 'sum' },
    ],
    scoringInputs: [],
  });

const captureTheFlag = () =>
  fixtureDescriptor({
    name: 'Capture The Flag',
    statistics: [
      { code: 'frags', label: 'Frags', aggregation: 'sum' },
      { code: 'defence-frags', label: 'Defensive Frags', aggregation: 'sum' },
    ],
    scoringInputs: [],
  });

function bindingFor(descriptor: ReturnType<typeof football>, override = false): CapabilityBinding {
  const bound = bindCapabilities(descriptor, fixtureProfile(), {
    overrideUnsatisfied: override,
  });
  if (!bound.ok) throw bound.error;
  return bound.value;
}

describe('bindTiebreakPipeline', () => {
  it('resolves capability names to each discipline’s own codes', () => {
    const forFootball = bindTiebreakPipeline(capabilityPipeline, bindingFor(football()));
    const forCtf = bindTiebreakPipeline(capabilityPipeline, bindingFor(captureTheFlag()));

    expect(forFootball.parameters.map((p) => p.id)).toEqual(['goals-for', 'goals-against']);
    expect(forCtf.parameters.map((p) => p.id)).toEqual(['frags', 'defence-frags']);
  });

  it('ranks the same standings correctly in two differently-named disciplines', () => {
    // One published profile, two disciplines, identical competitive facts
    // expressed under each discipline's own vocabulary.
    const footballValues = {
      a: { 'goals-for': 5, 'goals-against': 1 },
      b: { 'goals-for': 5, 'goals-against': 4 },
    };
    const ctfValues = {
      a: { frags: 5, 'defence-frags': 1 },
      b: { frags: 5, 'defence-frags': 4 },
    };

    const footballResult = resolveTiebreak(
      bindTiebreakPipeline(capabilityPipeline, bindingFor(football())),
      ['a', 'b'],
      footballValues,
    );
    const ctfResult = resolveTiebreak(
      bindTiebreakPipeline(capabilityPipeline, bindingFor(captureTheFlag())),
      ['a', 'b'],
      ctfValues,
    );

    // Tied on scoring, separated by the defensive comparator: same outcome both ways.
    expect(footballResult.rankedGroups).toEqual([['a'], ['b']]);
    expect(ctfResult.rankedGroups).toEqual([['a'], ['b']]);
    expect(footballResult.fullyResolved && ctfResult.fullyResolved).toBe(true);
  });

  it('names the resolved code in the explanation trace', () => {
    const result = resolveTiebreak(
      bindTiebreakPipeline(capabilityPipeline, bindingFor(captureTheFlag())),
      ['a', 'b'],
      { a: { frags: 3 }, b: { frags: 1 } },
    );
    expect(result.trace[0]?.id).toBe('frags');
  });

  it('marks an unsatisfied optional capability as unbound', () => {
    // Chess declares scoring but nothing defensive.
    const chess = fixtureDescriptor({
      statistics: [{ code: 'points-for', label: 'Points', aggregation: 'sum' }],
      scoringInputs: [],
    });
    const bound = bindTiebreakPipeline(capabilityPipeline, bindingFor(chess));
    expect(bound.parameters[0]).toMatchObject({ id: 'points-for', bound: true });
    expect(bound.parameters[1]).toMatchObject({
      id: 'unbound:defensive-record',
      bound: false,
      unboundCapability: 'defensive-record',
    });
  });

  it('degrades instead of failing when a comparator is unbound', () => {
    const chess = fixtureDescriptor({
      statistics: [{ code: 'points-for', label: 'Points', aggregation: 'sum' }],
      scoringInputs: [],
    });
    const result = resolveTiebreak(
      bindTiebreakPipeline(capabilityPipeline, bindingFor(chess)),
      ['a', 'b'],
      { a: { 'points-for': 4 }, b: { 'points-for': 4 } },
    );
    // Tied on the only bound comparator; the unbound one cannot separate them.
    expect(result.fullyResolved).toBe(false);
    expect(result.rankedGroups).toEqual([['a', 'b']]);
  });

  it('explains in the trace why an unbound comparator discriminated nothing', () => {
    const chess = fixtureDescriptor({
      statistics: [{ code: 'points-for', label: 'Points', aggregation: 'sum' }],
      scoringInputs: [],
    });
    const result = resolveTiebreak(
      bindTiebreakPipeline(capabilityPipeline, bindingFor(chess)),
      ['a', 'b'],
      { a: { 'points-for': 4 }, b: { 'points-for': 4 } },
    );
    const unboundNode = result.trace.find((node) => node.id === 'unbound:defensive-record');
    expect(unboundNode?.detail).toContain('not provided by this discipline');
    expect(unboundNode?.detail).toContain('defensive-record');
  });

  it('preserves declared direction and missing-value behaviour through binding', () => {
    const bound = bindTiebreakPipeline(capabilityPipeline, bindingFor(football()));
    expect(bound.parameters[1]).toMatchObject({
      direction: 'lower_wins',
      missingValue: 'treat-as-worst',
    });
  });
});

describe('overriddenGaps', () => {
  it('reports nothing when every requirement was satisfied', () => {
    expect(overriddenGaps(bindingFor(football()))).toEqual([]);
  });

  it('reports the required capabilities an operator knowingly overrode', () => {
    const bare = fixtureDescriptor({ statistics: [], scoringInputs: [] });
    expect(overriddenGaps(bindingFor(bare, true))).toEqual(['primary-scoring']);
  });
});
