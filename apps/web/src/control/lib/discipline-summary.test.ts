import { createIntl, createIntlCache } from 'react-intl';
import {
  chooseControlKind,
  eventActorMessageKey,
  eventAffectsResult,
  fieldValueAt,
  formatFieldValue,
  formatSegmentDuration,
  mergeOverrides,
  observedFieldValue,
  ruleFieldSummaries,
  type DisciplineSummaryData,
} from './discipline-summary.js';
import { messages } from '../i18n/messages.en.js';
import type { EventDefinition, FieldPolicy } from '@copalibre/domain';

const intl = createIntl(
  {
    locale: 'en',
    messages: Object.fromEntries(
      Object.values(messages).map((descriptor) => [descriptor.id, descriptor.defaultMessage]),
    ),
  },
  createIntlCache(),
);

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
    expect(formatFieldValue(3, intl)).toBe('3');
    expect(formatFieldValue('x', intl)).toBe('x');
  });

  it('renders booleans as localized Yes/No, not the raw word (openspec 0285)', () => {
    expect(formatFieldValue(true, intl)).toBe('Yes');
    expect(formatFieldValue(false, intl)).toBe('No');
  });

  it('renders an array as a comma-joined list', () => {
    expect(formatFieldValue(['points', 'score-difference'], intl)).toBe('points, score-difference');
  });

  it('renders undefined and null as the same em dash, not the literal word "null" (openspec 0285)', () => {
    expect(formatFieldValue(undefined, intl)).toBe('—');
    expect(formatFieldValue(null, intl)).toBe('—');
  });

  it('renders a segments-shaped object as a plain-language sentence, not JSON (openspec 0285)', () => {
    expect(formatFieldValue({ overtimeEnabled: false, regulationCount: 2 }, intl)).toBe(
      '2 regulation segments (without overtime)',
    );
    expect(formatFieldValue({ overtimeEnabled: true, regulationCount: 1 }, intl)).toBe(
      '1 regulation segment (with overtime)',
    );
  });

  it('renders an arbitrary object as readable key-value pairs, not JSON (openspec 0285)', () => {
    expect(formatFieldValue({ neutralGround: false }, intl)).toBe('Neutral Ground: No');
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
  const REPLACED_FORMAT = {
    format: { permission: { kind: 'replaced' as const }, mutationClass: 'safe' as const },
  };

  it('overlays a top-level override onto the defaults for a replaced field', () => {
    expect(
      mergeOverrides({ format: 'single-elimination' }, { format: 'round-robin' }, REPLACED_FORMAT),
    ).toEqual({ format: 'round-robin' });
  });

  it('overlays a nested dot-path override without disturbing sibling fields', () => {
    const defaults = { scoring: { pointsPerWin: 3, pointsPerDraw: 1 } };
    const fieldPolicies = {
      'scoring.pointsPerWin': {
        permission: { kind: 'replaced' as const },
        mutationClass: 'safe' as const,
      },
    };
    expect(mergeOverrides(defaults, { 'scoring.pointsPerWin': 4 }, fieldPolicies)).toEqual({
      scoring: { pointsPerWin: 4, pointsPerDraw: 1 },
    });
  });

  it('creates intermediate objects for a dot-path absent from defaults', () => {
    expect(mergeOverrides({}, { 'venuePolicy.neutralGround': true }, {})).toEqual({
      venuePolicy: { neutralGround: true },
    });
  });

  it('never mutates the defaults it was given', () => {
    const defaults = { scoring: { pointsPerWin: 3 } };
    mergeOverrides(defaults, { 'scoring.pointsPerWin': 4 }, {});
    expect(defaults).toEqual({ scoring: { pointsPerWin: 3 } });
  });

  it('falls back to a plain overlay for a field with no declared policy', () => {
    expect(mergeOverrides({ legacyField: 'old' }, { legacyField: 'new' }, {})).toEqual({
      legacyField: 'new',
    });
  });

  it("a union-list field's merged value includes both the inherited items and the added ones", () => {
    const defaults = { tiebreakers: ['points', 'score-difference', 'goals-for'] };
    const fieldPolicies = {
      tiebreakers: {
        permission: { kind: 'merged' as const, strategy: 'union-list' as const },
        mutationClass: 'requires_rebuild' as const,
      },
    };
    expect(mergeOverrides(defaults, { tiebreakers: ['goals-against'] }, fieldPolicies)).toEqual({
      tiebreakers: ['points', 'score-difference', 'goals-for', 'goals-against'],
    });
  });

  it("a shallow-object field's merged value includes untouched subkeys", () => {
    const defaults = { segments: { regulationCount: 2, overtimeEnabled: false } };
    const fieldPolicies = {
      segments: {
        permission: { kind: 'merged' as const, strategy: 'shallow-object' as const },
        mutationClass: 'requires_rebuild' as const,
      },
    };
    expect(
      mergeOverrides(defaults, { segments: { overtimeEnabled: true } }, fieldPolicies),
    ).toEqual({ segments: { regulationCount: 2, overtimeEnabled: true } });
  });

  it('falls back to a plain overlay when the stored shape cannot be merged', () => {
    const defaults = { tiebreakers: 'not-an-array' };
    const fieldPolicies = {
      tiebreakers: {
        permission: { kind: 'merged' as const, strategy: 'union-list' as const },
        mutationClass: 'requires_rebuild' as const,
      },
    };
    expect(mergeOverrides(defaults, { tiebreakers: ['points'] }, fieldPolicies)).toEqual({
      tiebreakers: ['points'],
    });
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

describe('observedFieldValue', () => {
  const defaults = { scoring: { pointsPerWin: 2 } };

  it("prefers the tournament's own override over the discipline default", () => {
    expect(
      observedFieldValue({ 'scoring.pointsPerWin': 5 }, defaults, 'scoring.pointsPerWin'),
    ).toBe(5);
  });

  it('falls back to the discipline default when there is no override', () => {
    expect(observedFieldValue({}, defaults, 'scoring.pointsPerWin')).toBe(2);
  });

  it('is undefined when neither the override nor the default has the field', () => {
    expect(observedFieldValue({}, defaults, 'winCondition')).toBeUndefined();
  });
});

describe('chooseControlKind', () => {
  const replaced = (): FieldPolicy => ({
    permission: { kind: 'replaced' },
    mutationClass: 'safe',
  });

  it('returns undefined (no control) for a forbidden field', () => {
    expect(
      chooseControlKind(
        { permission: { kind: 'forbidden' }, mutationClass: 'safe' },
        true,
        'venuePolicy.neutralGround',
      ),
    ).toBeUndefined();
  });

  it('returns undefined (no control) for an inherited field', () => {
    expect(
      chooseControlKind(
        { permission: { kind: 'inherited' }, mutationClass: 'safe' },
        true,
        'venuePolicy.neutralGround',
      ),
    ).toBeUndefined();
  });

  it('falls back to raw-json for a dot-path with no declared policy', () => {
    expect(chooseControlKind(undefined, 'anything', 'legacyField')).toBe('raw-json');
  });

  it('chooses checkbox for a replaced boolean field', () => {
    expect(chooseControlKind(replaced(), true, 'venuePolicy.neutralGround')).toBe('checkbox');
  });

  it('chooses number for a replaced number field', () => {
    expect(chooseControlKind(replaced(), 3, 'scoring.pointsPerWin')).toBe('number');
  });

  it('chooses text for a replaced string field', () => {
    expect(chooseControlKind(replaced(), 'ORB-1', 'identityRules.federationCode')).toBe('text');
  });

  it('chooses format-select for the format field regardless of its value type', () => {
    expect(chooseControlKind(replaced(), 'round-robin', 'format')).toBe('format-select');
  });

  it('falls back to raw-json for a replaced field with no observed value anywhere', () => {
    expect(chooseControlKind(replaced(), undefined, 'someNeverConfiguredField')).toBe('raw-json');
  });

  it('chooses add-to-list for a union-list merged field', () => {
    const policy: FieldPolicy = {
      permission: { kind: 'merged', strategy: 'union-list' },
      mutationClass: 'requires_rebuild',
    };
    expect(chooseControlKind(policy, ['points'], 'tiebreakers')).toBe('add-to-list');
  });

  it('chooses add-to-list for an append-list merged field', () => {
    const policy: FieldPolicy = {
      permission: { kind: 'merged', strategy: 'append-list' },
      mutationClass: 'requires_rebuild',
    };
    expect(chooseControlKind(policy, [], 'noteTemplates')).toBe('add-to-list');
  });

  it('chooses patch-object for a shallow-object merged field', () => {
    const policy: FieldPolicy = {
      permission: { kind: 'merged', strategy: 'shallow-object' },
      mutationClass: 'requires_rebuild',
    };
    expect(chooseControlKind(policy, { overtimeEnabled: false }, 'segments')).toBe('patch-object');
  });
});
