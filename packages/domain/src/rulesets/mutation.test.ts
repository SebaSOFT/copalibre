import { MutationBlockedError } from '../errors.js';
import { fixtureDescriptor } from '../test-support/fixture-descriptor.js';
import { evaluateMutation, type FixtureRef } from './mutation.js';

const policies = fixtureDescriptor().fieldPolicies;

const generatedFixtures: FixtureRef[] = [
  { fixtureId: 'f-1', stageId: 's-1', hasResult: true },
  { fixtureId: 'f-2', stageId: 's-1', hasResult: false },
];

describe('evaluateMutation', () => {
  it('allows a safe change with no side effects reported', () => {
    const result = evaluateMutation(policies, 'noteTemplates', {
      hasRecordedResults: true,
      generatedFixtures,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ allowed: true, mutationClass: 'safe' });
    }
  });

  it('allows requires_rebuild and reports exactly what becomes invalid', () => {
    const result = evaluateMutation(policies, 'tiebreakers', {
      hasRecordedResults: false,
      generatedFixtures,
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.mutationClass === 'requires_rebuild') {
      expect(result.value.invalidates).toEqual(generatedFixtures);
    } else {
      throw new Error('expected requires_rebuild decision');
    }
  });

  it('reports an empty invalidation set when nothing was generated yet', () => {
    const result = evaluateMutation(policies, 'segments', { hasRecordedResults: false });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.mutationClass === 'requires_rebuild') {
      expect(result.value.invalidates).toEqual([]);
    } else {
      throw new Error('expected requires_rebuild decision');
    }
  });

  it('allows a blocked_after_results change while no result exists', () => {
    const result = evaluateMutation(policies, 'scoring.pointsPerWin', {
      hasRecordedResults: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.mutationClass).toBe('blocked_after_results');
    }
  });

  it('rejects a blocked_after_results change once a result exists', () => {
    const result = evaluateMutation(policies, 'scoring.pointsPerWin', {
      hasRecordedResults: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(MutationBlockedError);
      expect(result.error.code).toBe('MUTATION_BLOCKED_AFTER_RESULTS');
      expect(result.error.message).toContain('audited correction workflow');
    }
  });

  it('rejects a field no policy declares', () => {
    const result = evaluateMutation(policies, 'scoring.unheardOf', {
      hasRecordedResults: false,
    });
    expect(result.ok).toBe(false);
  });
});
