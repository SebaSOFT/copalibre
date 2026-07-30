import { fixtureDescriptor } from '../test-support/fixture-descriptor.js';
import { fixtureProfile } from '../test-support/fixture-profile.js';
import { compileProfile, effectiveWinCondition } from './compile-profile.js';

const scoring = {
  statistics: [
    { code: 'goals-for', label: 'Goals For', aggregation: 'sum' as const },
    { code: 'goals-against', label: 'Goals Against', aggregation: 'sum' as const },
  ],
  scoringInputs: [],
};

/** Discipline permitting its win condition to be replaced. */
const flexible = () => {
  const base = fixtureDescriptor(scoring);
  return fixtureDescriptor({
    ...scoring,
    fieldPolicies: {
      ...base.fieldPolicies,
      winCondition: { permission: { kind: 'replaced' }, mutationClass: 'requires_rebuild' },
    },
  });
};

/** Discipline locking its win condition. */
const locked = () => {
  const base = fixtureDescriptor(scoring);
  return fixtureDescriptor({
    ...scoring,
    fieldPolicies: {
      ...base.fieldPolicies,
      winCondition: { permission: { kind: 'forbidden' }, mutationClass: 'safe' },
    },
  });
};

describe('compileProfile', () => {
  it('compiles and freezes the binding onto the snapshot', () => {
    const compiled = compileProfile(flexible(), fixtureProfile());
    expect(compiled.ok).toBe(true);
    if (compiled.ok) {
      expect(compiled.value.binding?.resolved).toHaveLength(2);
      expect(compiled.value.compiledFrom.descriptorVersion).toBe('3.0.0');
    }
  });

  it('fails when a required capability is unsatisfied and not overridden', () => {
    const bare = fixtureDescriptor({ statistics: [], scoringInputs: [] });
    expect(compileProfile(bare, fixtureProfile()).ok).toBe(false);
  });

  it('compiles with an override, carrying the unsatisfied requirement forward', () => {
    const bare = fixtureDescriptor({ statistics: [], scoringInputs: [] });
    const compiled = compileProfile(bare, fixtureProfile(), undefined, undefined, {
      overrideUnsatisfied: true,
    });
    expect(compiled.ok).toBe(true);
    if (compiled.ok) {
      expect(compiled.value.binding?.unsatisfiedRequired).toEqual(['primary-scoring']);
      expect(compiled.value.binding?.overridden).toBe(true);
    }
  });

  it('accepts a win-condition override the discipline permits', () => {
    const compiled = compileProfile(
      flexible(),
      fixtureProfile({ winConditionOverride: { rule: 'lowest-elapsed-time-wins' } }),
    );
    expect(compiled.ok).toBe(true);
  });

  it('rejects a win-condition override the discipline forbids', () => {
    const compiled = compileProfile(
      locked(),
      fixtureProfile({ winConditionOverride: { rule: 'lowest-elapsed-time-wins' } }),
    );
    expect(compiled.ok).toBe(false);
    if (!compiled.ok && 'violations' in compiled.error) {
      expect(compiled.error.violations[0]).toMatchObject({
        field: 'winCondition',
        reason: 'forbidden-override',
      });
    }
  });

  it('rejects an override when the discipline declares no policy for it', () => {
    const compiled = compileProfile(
      fixtureDescriptor(scoring),
      fixtureProfile({ winConditionOverride: { rule: 'lowest-elapsed-time-wins' } }),
    );
    expect(compiled.ok).toBe(false);
  });
});

describe('effectiveWinCondition', () => {
  it('uses the discipline value when the profile does not override', () => {
    expect(effectiveWinCondition(flexible(), fixtureProfile())).toEqual({ rule: 'higher-score-wins' });
  });

  it('uses the profile value where permitted — timed race over competition race', () => {
    expect(
      effectiveWinCondition(
        flexible(),
        fixtureProfile({ winConditionOverride: { rule: 'lowest-elapsed-time-wins' } }),
      ),
    ).toEqual({ rule: 'lowest-elapsed-time-wins' });
  });

  it('keeps the discipline value where the override is forbidden', () => {
    expect(
      effectiveWinCondition(
        locked(),
        fixtureProfile({ winConditionOverride: { rule: 'lowest-elapsed-time-wins' } }),
      ),
    ).toEqual({ rule: 'higher-score-wins' });
  });

  it('uses the discipline value when no profile is supplied', () => {
    expect(effectiveWinCondition(flexible())).toEqual({ rule: 'higher-score-wins' });
  });
});
