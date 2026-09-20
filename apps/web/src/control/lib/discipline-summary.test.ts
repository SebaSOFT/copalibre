import {
  eventActorMessageKey,
  eventAffectsResult,
  fieldValueAt,
  formatFieldValue,
  formatSegmentDuration,
  mergeOverrides,
  ruleFieldSummaries,
  type DisciplineSummaryData,
} from './discipline-summary.js';
import type { EventDefinition } from '@copalibre/domain';

function event(overrides: Partial<EventDefinition>): EventDefinition {
  return {
    code: 'sample-event',
    label: 'Sample event',
    category: 'neutral',
    permittedSegmentTypes: [],
    actorRequirement: 'none',
    payloadSchema: {},
    ...overrides,
  };
}

describe('eventAffectsResult', () => {
  it('is true when effects include a score effect', () => {
    expect(
      eventAffectsResult(event({ effects: [{ kind: 'score', awardTo: 'actor', delta: 1 }] })),
    ).toBe(true);
  });

  it('is true when effects include a statistic effect', () => {
    expect(
      eventAffectsResult(
        event({ effects: [{ kind: 'statistic', statisticCode: 'frags', delta: 1 }] }),
      ),
    ).toBe(true);
  });

  it('is true when effects include a match-state effect', () => {
    expect(
      eventAffectsResult(event({ effects: [{ kind: 'match-state', transition: 'forfeit' }] })),
    ).toBe(true);
  });

  it('is false when effects only include timed-penalty/tag/roster-role-snapshot', () => {
    expect(
      eventAffectsResult(
        event({
          effects: [
            { kind: 'timed-penalty', durationSeconds: 120, affects: 'actor' },
            { kind: 'tag', tagCode: 'suspended', action: 'applied' },
          ],
        }),
      ),
    ).toBe(false);
  });

  it('is false when a negative-category event has no scoring effect', () => {
    expect(
      eventAffectsResult(
        event({
          category: 'negative',
          effects: [{ kind: 'tag', tagCode: 'warned', action: 'applied' }],
        }),
      ),
    ).toBe(false);
  });

  it('is false when there are no effects at all', () => {
    expect(eventAffectsResult(event({}))).toBe(false);
  });
});

describe('eventActorMessageKey', () => {
  it.each([
    ['side', 'side'],
    ['person', 'person'],
    ['person-or-staff', 'personOrStaff'],
    ['none', 'none'],
  ] as const)('maps actorRequirement %s to %s', (actorRequirement, expected) => {
    expect(eventActorMessageKey(event({ actorRequirement }))).toBe(expected);
  });
});

describe('fieldValueAt', () => {
  const defaults = { scoring: { pointsPerWin: 3 }, tiebreakers: ['points'] };

  it('resolves a nested dot-path', () => {
    expect(fieldValueAt(defaults, 'scoring.pointsPerWin')).toBe(3);
  });

  it('resolves a top-level path', () => {
    expect(fieldValueAt(defaults, 'tiebreakers')).toEqual(['points']);
  });

  it('returns undefined for a missing path', () => {
    expect(fieldValueAt(defaults, 'scoring.pointsPerDraw')).toBeUndefined();
    expect(fieldValueAt(defaults, 'missing.nested.path')).toBeUndefined();
  });
});

describe('formatFieldValue', () => {
  it('renders scalars as-is', () => {
    expect(formatFieldValue(3)).toBe('3');
    expect(formatFieldValue(true)).toBe('true');
    expect(formatFieldValue('x')).toBe('x');
  });

  it('renders an array as a comma-joined list', () => {
    expect(formatFieldValue(['points', 'score-difference'])).toBe('points, score-difference');
  });

  it('renders undefined as an em dash', () => {
    expect(formatFieldValue(undefined)).toBe('—');
  });

  it('renders a plain object as JSON', () => {
    expect(formatFieldValue({ neutralGround: false })).toBe('{"neutralGround":false}');
  });
});

describe('formatSegmentDuration', () => {
  it('renders whole minutes without seconds', () => {
    expect(formatSegmentDuration(300)).toBe('5 min');
  });

  it('renders a non-whole-minute duration in seconds', () => {
    expect(formatSegmentDuration(45)).toBe('45 sec');
  });
});

describe('mergeOverrides', () => {
  it('overlays a top-level override onto the defaults', () => {
    expect(mergeOverrides({ format: 'single-elimination' }, { format: 'round-robin' })).toEqual({
      format: 'round-robin',
    });
  });

  it('overlays a nested dot-path override without disturbing sibling fields', () => {
    const defaults = { scoring: { pointsPerWin: 3, pointsPerDraw: 1 } };
    expect(mergeOverrides(defaults, { 'scoring.pointsPerWin': 4 })).toEqual({
      scoring: { pointsPerWin: 4, pointsPerDraw: 1 },
    });
  });

  it('creates intermediate objects for a dot-path absent from defaults', () => {
    expect(mergeOverrides({}, { 'venuePolicy.neutralGround': true })).toEqual({
      venuePolicy: { neutralGround: true },
    });
  });

  it('never mutates the defaults it was given', () => {
    const defaults = { scoring: { pointsPerWin: 3 } };
    mergeOverrides(defaults, { 'scoring.pointsPerWin': 4 });
    expect(defaults).toEqual({ scoring: { pointsPerWin: 3 } });
  });
});

describe('ruleFieldSummaries', () => {
  it('pairs each declared field policy with its configured value', () => {
    const data: DisciplineSummaryData = {
      segmentTypes: [],
      eventDefinitions: [],
      defaults: { scoring: { pointsPerWin: 3 } },
      fieldPolicies: {
        'scoring.pointsPerWin': { permission: { kind: 'replaced' }, mutationClass: 'safe' },
      },
    };
    expect(ruleFieldSummaries(data)).toEqual([
      {
        dotPath: 'scoring.pointsPerWin',
        policy: { permission: { kind: 'replaced' }, mutationClass: 'safe' },
        value: 3,
      },
    ]);
  });
});
