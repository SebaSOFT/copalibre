import { roundTripsAsJson } from '../trace/explanation-trace';
import { registerCopalibreVocabulary } from '../evaluation/vocabulary';
import { RulesRegistry, type RuleScript } from '../registry/rules-registry';
import { evaluateAdvancement, evaluateEligibility } from './guards';
import { expectGolden } from '../test-support/golden';

function freshRegistry(): RulesRegistry {
  return registerCopalibreVocabulary(new RulesRegistry());
}

/** Grants eligibility when roster size meets the configured minimum. */
const rosterSizeGuard = {
  id: 'roster-size-guard',
  rules: [
    {
      id: 'grant-when-roster-large-enough',
      type: 'simple_rule',
      options: {},
      conditions: [
        {
          id: 'roster-meets-minimum',
          type: 'compare_two_numbers',
          options: {},
          params: [
            {
              id: 'actual',
              name: 'op1',
              type: 'state-number',
              value: 'facts.rosterSize',
              options: {},
            },
            { id: 'cmp', name: 'comp', type: 'comparator', value: '>=', options: {} },
            {
              id: 'required',
              name: 'op2',
              type: 'state-number',
              value: 'facts.minPlayers',
              options: {},
            },
          ],
        },
      ],
      actions: [
        {
          id: 'grant-eligibility',
          type: 'set-guard-outcome',
          options: {},
          params: [
            {
              id: 'outcome',
              name: 'outcome',
              type: 'simple_string',
              value: 'pass',
              options: {},
            },
            {
              id: 'reason',
              name: 'reason',
              type: 'simple_string',
              value: 'roster meets the configured minimum',
              options: {},
            },
          ],
        },
      ],
    },
  ],
} as unknown as RuleScript;

/** Grants advancement only when every prerequisite match is completed. */
const stageCompleteGuard = {
  id: 'stage-complete-guard',
  rules: [
    {
      id: 'grant-when-no-pending-matches',
      type: 'simple_rule',
      options: {},
      conditions: [
        {
          id: 'no-pending',
          type: 'compare_two_numbers',
          options: {},
          params: [
            {
              id: 'pending',
              name: 'op1',
              type: 'state-number',
              value: 'facts.pendingMatches',
              options: {},
            },
            { id: 'cmp', name: 'comp', type: 'comparator', value: '=', options: {} },
            { id: 'zero', name: 'op2', type: 'simple_number', value: '0', options: {} },
          ],
        },
      ],
      actions: [
        {
          id: 'grant-advancement',
          type: 'set-guard-outcome',
          options: {},
          params: [
            {
              id: 'outcome',
              name: 'outcome',
              type: 'simple_string',
              value: 'pass',
              options: {},
            },
            {
              id: 'reason',
              name: 'reason',
              type: 'simple_string',
              value: 'all prerequisite results recorded',
              options: {},
            },
          ],
        },
      ],
    },
  ],
} as unknown as RuleScript;

describe('evaluateEligibility', () => {
  it('passes when the roster meets the minimum, with a granting trace', () => {
    const result = evaluateEligibility(
      freshRegistry(),
      rosterSizeGuard,
      { id: 'roster-size-guard', version: 2 },
      { facts: { rosterSize: 7, minPlayers: 5 } },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(true);
      expect(result.value.reason).toBe('roster meets the configured minimum');
      expect(result.value.record.trace[0]).toMatchObject({
        kind: 'guard',
        outcome: 'pass',
        values: { grantedBy: 'grant-eligibility' },
      });
      expectGolden('eligibility-pass', {
        passed: result.value.passed,
        reason: result.value.reason,
        // The neuron sub-explanation is included in the record but excluded
        // from the golden snapshot to avoid coupling it to upstream internals.
        guardNode: { ...result.value.record.trace[0], children: undefined },
      });
    }
  });

  it('fails default-deny when the roster is too small, naming the reason', () => {
    const result = evaluateEligibility(
      freshRegistry(),
      rosterSizeGuard,
      { id: 'roster-size-guard', version: 2 },
      { facts: { rosterSize: 3, minPlayers: 5 } },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(false);
      expect(result.value.reason).toBe('no-rule-granted');
      expect(result.value.record.trace[0]).toMatchObject({ kind: 'guard', outcome: 'fail' });
    }
  });

  it('rejects a script whose vocabulary is not registered', () => {
    const bare = new RulesRegistry(); // CopaLibre vocabulary NOT registered
    const result = evaluateEligibility(
      bare,
      rosterSizeGuard,
      { id: 'roster-size-guard', version: 2 },
      { facts: { rosterSize: 7, minPlayers: 5 } },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('RULE_SCRIPT_INVALID');
    }
  });

  it('produces a JSON-round-trippable evaluation record', () => {
    const result = evaluateEligibility(
      freshRegistry(),
      rosterSizeGuard,
      { id: 'roster-size-guard', version: 2 },
      { facts: { rosterSize: 7, minPlayers: 5 } },
    );
    expect(result.ok && roundTripsAsJson(result.value.record)).toBe(true);
  });

  it('is deterministic for identical inputs', () => {
    const run = () =>
      evaluateEligibility(
        freshRegistry(),
        rosterSizeGuard,
        { id: 'roster-size-guard', version: 2 },
        { facts: { rosterSize: 7, minPlayers: 5 } },
      );
    const a = run();
    const b = run();
    expect(a.ok && b.ok && JSON.stringify(a.value.record)).toBe(
      a.ok && b.ok && JSON.stringify(b.value.record),
    );
  });
});

describe('evaluateAdvancement', () => {
  it('blocks advancement while prerequisite results are missing', () => {
    const result = evaluateAdvancement(
      freshRegistry(),
      stageCompleteGuard,
      { id: 'stage-complete-guard', version: 1 },
      { facts: { pendingMatches: 2 } },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(false);
      expectGolden('advancement-blocked', {
        passed: result.value.passed,
        reason: result.value.reason,
        guardNode: { ...result.value.record.trace[0], children: undefined },
      });
    }
  });

  it('grants advancement once every prerequisite match completed', () => {
    const result = evaluateAdvancement(
      freshRegistry(),
      stageCompleteGuard,
      { id: 'stage-complete-guard', version: 1 },
      { facts: { pendingMatches: 0 } },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.passed).toBe(true);
      expect(result.value.reason).toBe('all prerequisite results recorded');
    }
  });
});
