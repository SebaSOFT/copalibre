import {
  bestOfFiveWinCondition,
  fixtureDescriptor,
  footballDescriptor,
  segmentThresholdEventDefinitions,
  tennisDescriptor,
  winConditionScript,
} from '@copalibre/domain';
import { registerCopalibreVocabulary } from '../evaluation/vocabulary.js';
import {
  evaluateNotificationRule,
  type NotificationRule,
} from '../notifications/notification-rules.js';
import { RulesRegistry, type RuleScript } from '../registry/rules-registry.js';
import { expectGolden } from '../test-support/golden.js';
import { roundTripsAsJson } from '../trace/explanation-trace.js';
import { registerWinConditionVocabulary } from './actions.js';
import { asRuleScript, evaluateWinCondition, toRecordedEvents } from './evaluator.js';
import { SEGMENT_THRESHOLD_KINDS, type MatchProgress, type SegmentProgress } from './types.js';

function registry(): RulesRegistry {
  const built = registerWinConditionVocabulary(registerCopalibreVocabulary(new RulesRegistry()));
  built.registerNotificationCapability('threshold-count', 'Counts qualifying events');
  return built;
}

const tennis = tennisDescriptor();
const version = { id: 'tennis-best-of-three', version: 1 };

/** A set as it is recorded: games per side, optionally its tiebreak points. */
function set(alfa: number, bravo: number, tiebreak?: readonly [number, number]): SegmentProgress {
  return {
    type: 'set',
    unit: 'game',
    units: { alfa, bravo },
    ...(tiebreak ? { tiebreakPoints: { alfa: tiebreak[0], bravo: tiebreak[1] } } : {}),
  };
}

function match(segments: readonly SegmentProgress[]): MatchProgress {
  return { matchId: 'm-1', entrantIds: ['alfa', 'bravo'], segments };
}

function decide(progress: MatchProgress, script: RuleScript = asRuleScript(tennis.winCondition)) {
  const result = evaluateWinCondition(registry(), { script, ruleVersion: version, progress });
  if (!result.ok) throw result.error;
  return result.value;
}

describe('tennis win condition', () => {
  it('closes a 7-6, 6-7, 6-4 match for the side that took two sets', () => {
    const decision = decide(match([set(7, 6), set(6, 7), set(6, 4)]));

    expect(decision.matchClosed).toBe(true);
    expect(decision.winnerEntrantId).toBe('alfa');
    expect(decision.tallies.set).toEqual({ alfa: 2, bravo: 1 });
    expect(decision.segments.map((segment) => segment.decidedBy)).toEqual([
      'tiebreak',
      'tiebreak',
      'target',
    ]);
  });

  it('closes a straight-sets 6-4, 6-4 match', () => {
    const decision = decide(match([set(6, 4), set(6, 4)]));

    expect(decision.matchClosed).toBe(true);
    expect(decision.winnerEntrantId).toBe('alfa');
    expect(decision.tallies.set).toEqual({ alfa: 2, bravo: 0 });
  });

  it('closes a 5-7, 7-5, 7-6 match on a deciding tiebreak', () => {
    const decision = decide(match([set(5, 7), set(7, 5), set(7, 6, [7, 5])]));

    expect(decision.winnerEntrantId).toBe('alfa');
    expect(decision.segments[2]).toMatchObject({ decidedBy: 'tiebreak', winnerEntrantId: 'alfa' });
    // 7-5 closes on the target with the two-game margin satisfied.
    expect(decision.segments[1]).toMatchObject({ decidedBy: 'target', winnerEntrantId: 'alfa' });
  });

  it('leaves 6-5 open: the target is met but the two-game margin is not', () => {
    const decision = decide(match([set(6, 5)]));

    expect(decision.matchClosed).toBe(false);
    expect(decision.segments[0]).toMatchObject({ closed: false, decidedBy: 'open' });
    expect(decision.events).toContainEqual(
      expect.objectContaining({ kind: 'margin-required', entrantId: 'alfa', threshold: 2 }),
    );
  });

  it('raises tiebreak-entered at 6-6 with the tiebreak still in progress', () => {
    const decision = decide(match([set(6, 6, [5, 4])]));

    expect(decision.matchClosed).toBe(false);
    expect(decision.events.map((event) => event.kind)).toContain('tiebreak-entered');
  });

  it('raises a segment point one game from the set', () => {
    const decision = decide(match([set(5, 3)]));

    expect(decision.events).toContainEqual(
      expect.objectContaining({ kind: 'segment-point', entrantId: 'alfa', segmentIndex: 1 }),
    );
  });

  it('raises match point with one set to play', () => {
    const decision = decide(match([set(6, 4), set(3, 6)]));

    expect(decision.matchClosed).toBe(false);
    expect(decision.events).toContainEqual(
      expect.objectContaining({
        kind: 'match-point',
        segmentType: 'match',
        entrantId: 'alfa',
        threshold: 2,
      }),
    );
  });

  it('needs three sets under a best-of-five condition', () => {
    const progress = match([set(6, 4), set(6, 4)]);
    expect(decide(progress).matchClosed).toBe(true);
    expect(decide(progress, asRuleScript(bestOfFiveWinCondition())).matchClosed).toBe(false);
  });

  it('produces a golden explanation trace', () => {
    const decision = decide(match([set(7, 6), set(6, 7), set(6, 4)]));
    expect(roundTripsAsJson(decision.record)).toBe(true);
    expectGolden('win-condition-tennis-three-sets', decision.record);
  });
});

describe('aggregate win condition', () => {
  const football = footballDescriptor();
  const goals = (alfa: number, bravo: number, complete: boolean): MatchProgress => ({
    matchId: 'm-9',
    entrantIds: ['alfa', 'bravo'],
    totals: { alfa: { goals: alfa }, bravo: { goals: bravo } },
    complete,
  });

  function decideGoals(progress: MatchProgress) {
    const result = evaluateWinCondition(registry(), {
      script: asRuleScript(football.winCondition),
      ruleVersion: { id: 'football-win-condition', version: 1 },
      progress,
    });
    if (!result.ok) throw result.error;
    return result.value;
  }

  it('awards the match to whoever leads at full time', () => {
    expect(decideGoals(goals(2, 1, true))).toMatchObject({
      matchClosed: true,
      winnerEntrantId: 'alfa',
    });
  });

  it('closes a level match as a draw, with no winner', () => {
    const decision = decideGoals(goals(1, 1, true));
    expect(decision.matchClosed).toBe(true);
    expect(decision.winnerEntrantId).toBeUndefined();
  });

  it('stays open while the match is still being played', () => {
    expect(decideGoals(goals(2, 1, false)).matchClosed).toBe(false);
  });

  it('applies a match-level margin where the discipline requires one', () => {
    const script = asRuleScript(
      winConditionScript('two-clear-goals', { unit: 'goals', target: 2, margin: 2 }),
    );
    const result = evaluateWinCondition(registry(), {
      script,
      ruleVersion: { id: 'two-clear-goals', version: 1 },
      progress: goals(2, 1, true),
    });
    if (!result.ok) throw result.error;

    expect(result.value.matchClosed).toBe(false);
    expect(result.value.events).toContainEqual(
      expect.objectContaining({ kind: 'margin-required', segmentType: 'match' }),
    );
  });
});

describe('segment thresholds on the event surface', () => {
  const options = { segmentId: 'seg-1', occurredAt: '2026-07-30T18:00:00.000Z' };

  it('lifts thresholds into recorded events with stable ids and ordering', () => {
    const decision = decide(match([set(6, 4), set(3, 6)]));
    const events = toRecordedEvents(decision.events, options);

    expect(events.length).toBe(decision.events.length);
    expect(events.map((event) => event.sequence)).toEqual(events.map((_event, index) => index + 1));
    expect(toRecordedEvents(decision.events, options)).toEqual(events);
    expect(events.some((event) => event.definitionCode === 'match-point')).toBe(true);
  });

  it('continues an existing log sequence', () => {
    const decision = decide(match([set(5, 3)]));
    const [first] = toRecordedEvents(decision.events, {
      ...options,
      startingSequence: 41,
      eventIdPrefix: 'm-1-threshold',
    });

    expect(first?.sequence).toBe(42);
    expect(first?.eventId).toBe('m-1-threshold-1');
  });

  it('reaches a subscribed notification rule with no dedicated mechanism', () => {
    const decision = decide(match([set(6, 4), set(3, 6)]));
    const events = toRecordedEvents(decision.events, options).filter(
      (event) => event.definitionCode === 'match-point',
    );

    const rule: NotificationRule = {
      id: 'match-point-alert',
      version: 1,
      scope: 'match',
      predicate: { definitionCodes: ['match-point'] },
      aggregation: { kind: 'count' },
      threshold: { comparator: '>=', value: 1 },
      semantics: { kind: 'threshold-crossing' },
      action: {
        severity: 'info',
        titleTemplate: 'Match point',
        messageTemplate: 'Match point in {{scopeKey}}',
        targetRole: 'table-official',
      },
    };

    const evaluation = evaluateNotificationRule(rule, tennis, events);
    expect(evaluation.instances).toHaveLength(1);
    expect(evaluation.instances[0]?.scopeKey).toBe('match:m-1');
    // Recomputation is idempotent: the same crossing keeps the same identity.
    expect(evaluateNotificationRule(rule, tennis, events).instances[0]?.identityKey).toBe(
      evaluation.instances[0]?.identityKey,
    );
  });

  it('declares one event definition per threshold kind', () => {
    const codes = segmentThresholdEventDefinitions(['set']).map((definition) => definition.code);
    expect(codes).toEqual([...SEGMENT_THRESHOLD_KINDS]);
  });
});

describe('win-condition edge cases', () => {
  it('raises a segment point inside an unfinished tiebreak', () => {
    const decision = decide(match([set(6, 6, [6, 4])]));

    expect(decision.matchClosed).toBe(false);
    expect(decision.events).toContainEqual(
      expect.objectContaining({ kind: 'segment-point', threshold: 7, entrantId: 'alfa' }),
    );
  });

  it('leaves a tiebreak open at 6-6 in points', () => {
    const decision = decide(match([set(6, 6, [6, 6])]));
    expect(decision.segments[0]).toMatchObject({ closed: false, decidedBy: 'open' });
  });

  it('treats a side with no recorded unit as zero', () => {
    const decision = decide({
      matchId: 'm-2',
      entrantIds: ['alfa', 'bravo'],
      totals: { alfa: { set: 2 } },
      complete: true,
    });
    expect(decision.tallies).toEqual({ set: { alfa: 0, bravo: 0 } });
  });

  it('fails when the script omits match progress', () => {
    const result = evaluateWinCondition(registry(), {
      script: asRuleScript(tennis.winCondition),
      ruleVersion: version,
      progress: undefined as unknown as MatchProgress,
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a negative margin', () => {
    const script = {
      id: 'bad-margin',
      rules: [
        {
          id: 'close',
          type: 'simple_rule',
          options: {},
          conditions: [],
          actions: [
            {
              id: 'margin',
              type: 'requireMargin',
              options: {},
              params: [
                { id: 'margin', name: 'margin', type: 'simple_number', value: -1, options: {} },
              ],
            },
          ],
        },
      ],
    } as unknown as RuleScript;

    const result = evaluateWinCondition(registry(), {
      script,
      ruleVersion: { id: 'bad-margin', version: 1 },
      progress: match([]),
    });
    expect(result.ok).toBe(false);
  });

  it('reports an empty segment as open rather than closing it for nobody', () => {
    const decision = decide(match([{ type: 'set', unit: 'game', units: {} }]));
    expect(decision.segments[0]).toMatchObject({ closed: false, decidedBy: 'open' });
  });
});

describe('win-condition script validation', () => {
  it('rejects a script naming an action outside the core registry', () => {
    const script = {
      id: 'invented',
      rules: [
        {
          id: 'close',
          type: 'simple_rule',
          options: {},
          conditions: [],
          actions: [{ id: 'x', type: 'winByDecree', options: {}, params: [] }],
        },
      ],
    } as unknown as RuleScript;

    const result = evaluateWinCondition(registry(), {
      script,
      ruleVersion: { id: 'invented', version: 1 },
      progress: match([]),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('winByDecree');
  });

  it('rejects a structurally malformed script', () => {
    const result = evaluateWinCondition(registry(), {
      script: { id: '', rules: [] } as unknown as RuleScript,
      ruleVersion: { id: 'broken', version: 1 },
      progress: match([]),
    });

    expect(result.ok).toBe(false);
  });

  it('fails evaluation when an action is missing a required parameter', () => {
    const script = {
      id: 'no-unit',
      rules: [
        {
          id: 'close',
          type: 'simple_rule',
          options: {},
          conditions: [],
          actions: [{ id: 'close-match', type: 'winMatch', options: {}, params: [] }],
        },
      ],
    } as unknown as RuleScript;

    const result = evaluateWinCondition(registry(), {
      script,
      ruleVersion: { id: 'no-unit', version: 1 },
      progress: match([]),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('GUARD_EVALUATION_FAILED');
  });

  it('rejects a descriptor whose win condition names an unregistered action', () => {
    const bad = fixtureDescriptor({
      winCondition: {
        id: 'invented',
        rules: [
          {
            id: 'close',
            type: 'simple_rule',
            options: {},
            conditions: [],
            actions: [{ id: 'x', type: 'winByDecree', options: {}, params: [] }],
          },
        ],
      },
    });

    const result = registry().validateDescriptorReferences(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('core release');
  });

  it('accepts the seeded descriptors', () => {
    for (const descriptor of [footballDescriptor(), tennisDescriptor()]) {
      expect(registry().validateDescriptorReferences(descriptor).ok).toBe(true);
    }
  });
});
