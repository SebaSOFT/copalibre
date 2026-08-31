import { MutationBlockedError } from '../errors.js';
import { fixtureDescriptor } from '../test-support/fixture-descriptor.js';
import { evaluateCustomScriptsMutation, evaluateMutation, type FixtureRef } from './mutation.js';

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

  it('classifies custom scripts mutation: safe before results, blocked after results', () => {
    const beforeResults = evaluateCustomScriptsMutation({ hasRecordedResults: false });
    expect(beforeResults.ok).toBe(true);
    if (beforeResults.ok) {
      expect(beforeResults.value.mutationClass).toBe('safe');
    }

    const afterResults = evaluateCustomScriptsMutation({ hasRecordedResults: true });
    expect(afterResults.ok).toBe(false);
    if (!afterResults.ok) {
      expect(afterResults.error.code).toBe('MUTATION_BLOCKED_AFTER_RESULTS');
    }
  });

  describe('series configuration mutation policies', () => {
    it('classifies lengthening series.span before results as requires_rebuild', () => {
      const result = evaluateMutation(policies, 'series.span', {
        hasRecordedResults: false,
        previousValue: 3,
        nextValue: 5,
        generatedFixtures,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.mutationClass).toBe('requires_rebuild');
        if (result.value.mutationClass === 'requires_rebuild') {
          expect(result.value.invalidates).toEqual(generatedFixtures);
        }
      }
    });

    it('classifies shortening series.span before results as blocked_after_results', () => {
      const result = evaluateMutation(policies, 'series.span', {
        hasRecordedResults: false,
        previousValue: 5,
        nextValue: 3,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.mutationClass).toBe('blocked_after_results');
      }
    });

    it('rejects shortening series.span after results exist', () => {
      const result = evaluateMutation(policies, 'series.span', {
        hasRecordedResults: true,
        previousValue: 5,
        nextValue: 3,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MUTATION_BLOCKED_AFTER_RESULTS');
      }
    });

    it('classifies changing resolution class as blocked_after_results before results and rejects after results', () => {
      const before = evaluateMutation(policies, 'series.resolutionClass', {
        hasRecordedResults: false,
      });
      expect(before.ok).toBe(true);
      if (before.ok) {
        expect(before.value.mutationClass).toBe('blocked_after_results');
      }

      const after = evaluateMutation(policies, 'series.resolutionClass', {
        hasRecordedResults: true,
      });
      expect(after.ok).toBe(false);
      if (!after.ok) {
        expect(after.error.code).toBe('MUTATION_BLOCKED_AFTER_RESULTS');
      }
    });
  });

  describe('tournament capacity mutation policy', () => {
    const capacityPolicies = {
      ...policies,
      'registration.capacity': {
        permission: { kind: 'replaced' as const },
        mutationClass: 'requires_rebuild' as const,
      },
    };

    it('classifies raising capacity as requires_rebuild, with no result recorded', () => {
      const result = evaluateMutation(capacityPolicies, 'registration.capacity', {
        hasRecordedResults: false,
        previousValue: 16,
        nextValue: 32,
        acceptedEntrantCount: 10,
        generatedFixtures,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.mutationClass).toBe('requires_rebuild');
      }
    });

    it('rejects reducing capacity below the current accepted-entrant count, with no result recorded', () => {
      const result = evaluateMutation(capacityPolicies, 'registration.capacity', {
        hasRecordedResults: false,
        previousValue: 16,
        nextValue: 8,
        acceptedEntrantCount: 10,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(MutationBlockedError);
        expect(result.error.message).toContain('10 entrant');
      }
    });

    it('rejects reducing capacity below the current accepted-entrant count even after a result exists', () => {
      const result = evaluateMutation(capacityPolicies, 'registration.capacity', {
        hasRecordedResults: true,
        previousValue: 16,
        nextValue: 8,
        acceptedEntrantCount: 10,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('10 entrant');
      }
    });

    it('allows reducing capacity to exactly the current accepted-entrant count', () => {
      const result = evaluateMutation(capacityPolicies, 'registration.capacity', {
        hasRecordedResults: false,
        previousValue: 16,
        nextValue: 10,
        acceptedEntrantCount: 10,
        generatedFixtures,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.mutationClass).toBe('requires_rebuild');
      }
    });
  });
});
