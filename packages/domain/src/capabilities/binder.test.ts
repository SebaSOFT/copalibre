import { fixtureDescriptor } from '../test-support/fixture-descriptor.js';
import { fixtureProfile } from '../test-support/fixture-profile.js';
import { bindCapabilities, declaredCodes, UnsatisfiedCapabilityError } from './binder.js';
import { codeFor } from './capability.js';

/** A discipline declaring the codes the fixture profile prefers. */
const football = () =>
  fixtureDescriptor({
    name: 'Football',
    statistics: [
      { code: 'goals-for', label: 'Goals For', aggregation: 'sum' },
      { code: 'goals-against', label: 'Goals Against', aggregation: 'sum' },
    ],
    scoringInputs: [{ code: 'score', label: 'Score', source: 'event-derived' }],
  });

/** A discipline naming the same concepts differently. */
const captureTheFlag = () =>
  fixtureDescriptor({
    name: 'Capture The Flag',
    statistics: [
      { code: 'frags', label: 'Frags', aggregation: 'sum' },
      { code: 'defence-frags', label: 'Defensive Frags', aggregation: 'sum' },
    ],
    scoringInputs: [],
  });

/** A discipline providing scoring but nothing defensive. */
const chess = () =>
  fixtureDescriptor({
    name: 'Chess',
    statistics: [{ code: 'points-for', label: 'Points', aggregation: 'sum' }],
    scoringInputs: [],
  });

describe('declaredCodes', () => {
  it('collects statistics and scoring inputs', () => {
    expect([...declaredCodes(football())].sort()).toEqual(['goals-against', 'goals-for', 'score']);
  });
});

describe('bindCapabilities', () => {
  it('binds one profile to differently-named disciplines', () => {
    const toFootball = bindCapabilities(football(), fixtureProfile());
    const toCtf = bindCapabilities(captureTheFlag(), fixtureProfile());

    expect(toFootball.ok && codeFor(toFootball.value, 'primary-scoring')).toBe('goals-for');
    expect(toCtf.ok && codeFor(toCtf.value, 'primary-scoring')).toBe('frags');
  });

  it('resolves an any-of predicate to the first declared code, deterministically', () => {
    // satisfiedBy is ordered ['goals-for', 'points-for', 'frags']; chess only has points-for.
    const bound = bindCapabilities(chess(), fixtureProfile(), { overrideUnsatisfied: false });
    expect(bound.ok && codeFor(bound.value, 'primary-scoring')).toBe('points-for');
  });

  it('prefers the earlier code when a discipline declares several', () => {
    const both = fixtureDescriptor({
      statistics: [
        { code: 'frags', label: 'Frags', aggregation: 'sum' },
        { code: 'goals-for', label: 'Goals', aggregation: 'sum' },
      ],
      scoringInputs: [],
    });
    const bound = bindCapabilities(both, fixtureProfile());
    expect(bound.ok && codeFor(bound.value, 'primary-scoring')).toBe('goals-for');
  });

  it('leaves an unsatisfied optional capability unresolved without failing', () => {
    const bound = bindCapabilities(chess(), fixtureProfile());
    expect(bound.ok).toBe(true);
    if (bound.ok) {
      const defensive = bound.value.resolved.find((e) => e.capability === 'defensive-record');
      expect(defensive).toMatchObject({ satisfied: false, resolvedTo: undefined });
      expect(bound.value.unsatisfiedRequired).toEqual([]);
      expect(bound.value.overridden).toBe(false);
    }
  });

  it('fails when a required capability is unsatisfied', () => {
    const noScoring = fixtureDescriptor({ statistics: [], scoringInputs: [] });
    const bound = bindCapabilities(noScoring, fixtureProfile());
    expect(bound.ok).toBe(false);
    if (!bound.ok) {
      expect(bound.error).toBeInstanceOf(UnsatisfiedCapabilityError);
      expect(bound.error.unsatisfied).toEqual(['primary-scoring']);
      // The partial binding is retained so callers can show what was missing.
      expect(bound.error.partial.resolved).toHaveLength(2);
    }
  });

  it('proceeds with an explicit override and records the gap', () => {
    const noScoring = fixtureDescriptor({ statistics: [], scoringInputs: [] });
    const bound = bindCapabilities(noScoring, fixtureProfile(), { overrideUnsatisfied: true });
    expect(bound.ok).toBe(true);
    if (bound.ok) {
      expect(bound.value.unsatisfiedRequired).toEqual(['primary-scoring']);
      expect(bound.value.overridden).toBe(true);
    }
  });

  it('does not mark a fully satisfied binding as overridden', () => {
    const bound = bindCapabilities(football(), fixtureProfile(), { overrideUnsatisfied: true });
    expect(bound.ok && bound.value.overridden).toBe(false);
  });

  it('records both artifact versions on the binding', () => {
    const bound = bindCapabilities(football(), fixtureProfile());
    expect(bound.ok && bound.value).toMatchObject({
      descriptorVersion: '3.0.0',
      profileVersion: '1.2.0',
    });
  });

  it('returns undefined for a capability the profile never declared', () => {
    const bound = bindCapabilities(football(), fixtureProfile());
    expect(bound.ok && codeFor(bound.value, 'not-declared')).toBeUndefined();
  });

  it('is deterministic', () => {
    const once = bindCapabilities(football(), fixtureProfile());
    const twice = bindCapabilities(football(), fixtureProfile());
    expect(JSON.stringify(once)).toBe(JSON.stringify(twice));
  });
});
