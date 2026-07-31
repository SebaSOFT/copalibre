import { registerCopalibreVocabulary } from '../evaluation/vocabulary.js';
import { RulesRegistry, type RuleScript } from '../registry/rules-registry.js';
import { roundTripsAsJson } from '../trace/explanation-trace.js';
import { registerConstraintVocabulary } from './actions.js';
import { evaluateScriptedConstraint } from './evaluator.js';

function registry(): RulesRegistry {
  return registerConstraintVocabulary(registerCopalibreVocabulary(new RulesRegistry()));
}

/**
 * *No group may hold more than two clubs from one association* — the shape a
 * declarative constraint does not cover, because the operator wants it counted
 * per association rather than for one named value.
 */
const associationCap = {
  id: 'association-cap',
  rules: [
    {
      id: 'reject-when-over-cap',
      type: 'simple_rule',
      options: {},
      conditions: [
        {
          id: 'over-cap',
          type: 'compare_two_numbers',
          options: {},
          params: [
            {
              id: 'actual',
              name: 'op1',
              type: 'state-number',
              value: null,
              options: { path: 'draw.maxPerAssociation' },
            },
            { id: 'cmp', name: 'comp', type: 'comparator', value: '>', options: {} },
            { id: 'cap', name: 'op2', type: 'simple_number', value: 2, options: {} },
          ],
        },
      ],
      actions: [
        {
          id: 'reject',
          type: 'rejectDraw',
          options: {},
          params: [
            {
              id: 'reason',
              name: 'reason',
              type: 'simple_string',
              value: 'A group holds more than two clubs from one association',
              options: {},
            },
            {
              id: 'ids',
              name: 'entrantIds',
              type: 'state-string',
              value: null,
              options: { path: 'draw.offenders' },
            },
          ],
        },
      ],
    },
  ],
} as unknown as RuleScript;

const version = { id: 'association-cap', version: 1 };

describe('scripted draw constraints', () => {
  it('permits a draw the script says nothing about', () => {
    const result = evaluateScriptedConstraint(registry(), {
      script: associationCap,
      ruleVersion: version,
      context: { maxPerAssociation: 2, offenders: '' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Default-permit: unlike a guard, silence is not an objection.
    expect(result.value.satisfied).toBe(true);
    expect(result.value.findings).toEqual([]);
  });

  it('rejects a draw the script objects to, naming the clashing entrants', () => {
    const result = evaluateScriptedConstraint(registry(), {
      script: associationCap,
      ruleVersion: version,
      context: { maxPerAssociation: 3, offenders: 'sanmartin,desamparados,union' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.satisfied).toBe(false);
    expect(result.value.findings[0]).toEqual({
      satisfied: false,
      reason: 'A group holds more than two clubs from one association',
      entrantIds: ['sanmartin', 'desamparados', 'union'],
    });
  });

  it('records a satisfied check so the trace distinguishes it from one that never ran', () => {
    const script = {
      id: 'always-checks',
      rules: [
        {
          id: 'record-check',
          type: 'simple_rule',
          options: {},
          conditions: [],
          actions: [
            {
              id: 'ok',
              type: 'requireDraw',
              options: {},
              params: [
                {
                  id: 'reason',
                  name: 'reason',
                  type: 'simple_string',
                  value: 'Association caps respected',
                  options: {},
                },
              ],
            },
          ],
        },
      ],
    } as unknown as RuleScript;

    const result = evaluateScriptedConstraint(registry(), {
      script,
      ruleVersion: { id: 'always-checks', version: 1 },
      context: {},
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.satisfied).toBe(true);
    expect(result.value.findings).toEqual([
      { satisfied: true, reason: 'Association caps respected', entrantIds: [] },
    ]);
  });

  it('produces a JSON-safe trace naming the constraint and each finding', () => {
    const result = evaluateScriptedConstraint(registry(), {
      script: associationCap,
      ruleVersion: version,
      context: { maxPerAssociation: 4, offenders: 'boca,river' },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(roundTripsAsJson(result.value.record)).toBe(true);

    const [node] = result.value.record.trace;
    expect(node).toMatchObject({ id: 'association-cap', outcome: 'violated' });
    expect(node?.children?.[0]).toMatchObject({
      outcome: 'violated',
      values: { entrantIds: ['boca', 'river'] },
    });
  });

  it('rejects a script naming an action outside the registry', () => {
    const script = {
      id: 'invented',
      rules: [
        {
          id: 'r',
          type: 'simple_rule',
          options: {},
          conditions: [],
          actions: [{ id: 'x', type: 'banClub', options: {}, params: [] }],
        },
      ],
    } as unknown as RuleScript;

    const result = evaluateScriptedConstraint(registry(), {
      script,
      ruleVersion: { id: 'invented', version: 1 },
      context: {},
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('banClub');
  });

  it('rejects a structurally malformed script', () => {
    const result = evaluateScriptedConstraint(registry(), {
      script: { id: '', rules: [] } as unknown as RuleScript,
      ruleVersion: { id: 'broken', version: 1 },
      context: {},
    });

    expect(result.ok).toBe(false);
  });

  it('fails evaluation when a satisfied check carries no reason either', () => {
    const script = {
      id: 'silent-approval',
      rules: [
        {
          id: 'r',
          type: 'simple_rule',
          options: {},
          conditions: [],
          actions: [{ id: 'ok', type: 'requireDraw', options: {}, params: [] }],
        },
      ],
    } as unknown as RuleScript;

    expect(
      evaluateScriptedConstraint(registry(), {
        script,
        ruleVersion: { id: 'silent-approval', version: 1 },
        context: {},
      }).ok,
    ).toBe(false);
  });

  it('ignores an entrant list that is not a string rather than inventing ids', () => {
    const script = {
      id: 'numeric-ids',
      rules: [
        {
          id: 'r',
          type: 'simple_rule',
          options: {},
          conditions: [],
          actions: [
            {
              id: 'reject',
              type: 'rejectDraw',
              options: {},
              params: [
                {
                  id: 'reason',
                  name: 'reason',
                  type: 'simple_string',
                  value: 'Cap exceeded',
                  options: {},
                },
                { id: 'ids', name: 'entrantIds', type: 'simple_number', value: 42, options: {} },
              ],
            },
          ],
        },
      ],
    } as unknown as RuleScript;

    const result = evaluateScriptedConstraint(registry(), {
      script,
      ruleVersion: { id: 'numeric-ids', version: 1 },
      context: {},
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.findings[0]?.entrantIds).toEqual([]);
  });

  it('accumulates findings from several rules in one script', () => {
    const script = {
      id: 'two-checks',
      rules: ['first', 'second'].map((name) => ({
        id: `reject-${name}`,
        type: 'simple_rule',
        options: {},
        conditions: [],
        actions: [
          {
            id: `reject-${name}`,
            type: 'rejectDraw',
            options: {},
            params: [
              {
                id: 'reason',
                name: 'reason',
                type: 'simple_string',
                value: `${name} check failed`,
                options: {},
              },
            ],
          },
        ],
      })),
    } as unknown as RuleScript;

    const result = evaluateScriptedConstraint(registry(), {
      script,
      ruleVersion: { id: 'two-checks', version: 1 },
      context: {},
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.findings).toHaveLength(2);
    expect(result.value.record.trace[0]?.children).toHaveLength(2);
  });

  it('fails evaluation when a rejection carries no reason for the operator', () => {
    const script = {
      id: 'silent-rejection',
      rules: [
        {
          id: 'r',
          type: 'simple_rule',
          options: {},
          conditions: [],
          actions: [{ id: 'reject', type: 'rejectDraw', options: {}, params: [] }],
        },
      ],
    } as unknown as RuleScript;

    const result = evaluateScriptedConstraint(registry(), {
      script,
      ruleVersion: { id: 'silent-rejection', version: 1 },
      context: {},
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('GUARD_EVALUATION_FAILED');
  });
});
