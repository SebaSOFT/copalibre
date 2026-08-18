import { fixtureDescriptor } from '../test-support/fixture-descriptor.js';
import { fixtureProfile } from '../test-support/fixture-profile.js';
import { winConditionScript } from '../modules/win-condition-scripts.js';
import { compileProfile, effectiveWinCondition } from './compile-profile.js';

/** A timed race: lowest elapsed time at the line, so the margin is irrelevant. */
const timedRace = winConditionScript('lowest-elapsed-time-wins', { unit: 'elapsed-seconds' });

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

/** Discipline permitting its win condition to be merged, by the given strategy. */
const mergeable = (strategy: 'shallow-object' | 'append-list') => {
  const base = fixtureDescriptor(scoring);
  return fixtureDescriptor({
    ...scoring,
    fieldPolicies: {
      ...base.fieldPolicies,
      winCondition: { permission: { kind: 'merged', strategy }, mutationClass: 'requires_rebuild' },
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
      fixtureProfile({ winConditionOverride: timedRace }),
    );
    expect(compiled.ok).toBe(true);
  });

  it('rejects a win-condition override the discipline forbids', () => {
    const compiled = compileProfile(locked(), fixtureProfile({ winConditionOverride: timedRace }));
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
      fixtureProfile({ winConditionOverride: timedRace }),
    );
    expect(compiled.ok).toBe(false);
  });
});

describe('effectiveWinCondition', () => {
  it('uses the discipline value when the profile does not override', () => {
    const result = effectiveWinCondition(flexible(), fixtureProfile());
    expect(result.ok && result.value).toEqual(fixtureDescriptor().winCondition);
  });

  it('uses the profile value where permitted — timed race over competition race', () => {
    const result = effectiveWinCondition(
      flexible(),
      fixtureProfile({ winConditionOverride: timedRace }),
    );
    expect(result.ok && result.value).toEqual(timedRace);
  });

  it('keeps the discipline value where the override is forbidden', () => {
    const result = effectiveWinCondition(
      locked(),
      fixtureProfile({ winConditionOverride: timedRace }),
    );
    expect(result.ok && result.value).toEqual(fixtureDescriptor().winCondition);
  });

  it('uses the discipline value when no profile is supplied', () => {
    const result = effectiveWinCondition(flexible());
    expect(result.ok && result.value).toEqual(fixtureDescriptor().winCondition);
  });

  it('merges, rather than replaces, a win condition whose policy declares a merge strategy', () => {
    // Only overrides `id` — a full replacement would lose `rules` entirely;
    // a real shallow-object merge keeps the discipline's `rules` alongside it.
    const override = { id: 'custom-timing' };
    const result = effectiveWinCondition(
      mergeable('shallow-object'),
      fixtureProfile({ winConditionOverride: override }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      ...fixtureDescriptor().winCondition,
      id: 'custom-timing',
    });
  });

  it('fails explicitly when the declared merge strategy cannot apply to the two values', () => {
    // `append-list` requires both sides to be arrays; a RuleScript is a plain object.
    const result = effectiveWinCondition(
      mergeable('append-list'),
      fixtureProfile({ winConditionOverride: { id: 'custom-timing' } }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      field: 'winCondition',
      reason: 'missing-merge-strategy',
    });
  });
});
