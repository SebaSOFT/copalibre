import {
  buildWinCondition,
  canContinue,
  canSubmit,
  emptyLocalizedDraft,
  initialDescriptorWizard,
  localizedValue,
  nextStep,
  previousStep,
  progress,
  stepProblems,
  toAuthoredDocument,
  toAuthoredModuleRequest,
  type DescriptorWizardState,
} from './descriptor-authoring.js';

function withName(state: DescriptorWizardState, en: string): DescriptorWizardState {
  return { ...state, name: { en, translations: {} } };
}

function completeState(): DescriptorWizardState {
  return {
    ...initialDescriptorWizard(),
    alias: 'test-sport',
    version: '1.0.0',
    name: { en: 'Test Sport', translations: { es: 'Deporte de Prueba' } },
    author: 'Test Author',
    licence: 'AGPL-3.0-only',
    participantTypes: ['team'],
    minPlayers: 1,
    maxPlayers: 11,
    segmentTypes: [{ name: 'half', label: 'Half', timed: true }],
    statistics: [{ code: 'points', label: 'Points', aggregation: 'sum' }],
    availableFormats: ['round-robin'],
    winMatchUnit: 'points',
  };
}

describe('localizedValue', () => {
  it('is undefined for a blank draft', () => {
    expect(localizedValue(emptyLocalizedDraft())).toBeUndefined();
  });

  it('is a bare string when only English is supplied', () => {
    expect(localizedValue({ en: 'Football', translations: {} })).toBe('Football');
  });

  it('is a locale-keyed object once another language is supplied', () => {
    expect(localizedValue({ en: 'Football', translations: { es: 'Fútbol' } })).toEqual({
      en: 'Football',
      es: 'Fútbol',
    });
  });

  it('ignores a blank translation rather than including an empty value', () => {
    expect(localizedValue({ en: 'Football', translations: { es: '  ' } })).toBe('Football');
  });
});

describe('descriptor wizard step gating', () => {
  it('refuses the name step without an alias, version or English name', () => {
    const state = initialDescriptorWizard();
    expect(canContinue(state)).toBe(false);
    expect(stepProblems(state).length).toBeGreaterThan(0);
  });

  it('accepts a well-formed alias and English name', () => {
    const state = withName({ ...initialDescriptorWizard(), alias: 'test-sport' }, 'Test Sport');
    expect(canContinue(state)).toBe(true);
  });

  it('refuses an alias with uppercase letters or no hyphen-word shape', () => {
    const state = withName({ ...initialDescriptorWizard(), alias: 'Test_Sport' }, 'Test Sport');
    expect(canContinue(state)).toBe(false);
  });

  it('refuses authorship without an author or licence', () => {
    const state: DescriptorWizardState = { ...initialDescriptorWizard(), step: 'authorship' };
    expect(canContinue(state)).toBe(false);
  });

  it('refuses participants without at least one participant type', () => {
    const state: DescriptorWizardState = {
      ...initialDescriptorWizard(),
      step: 'participants',
      minPlayers: 1,
      maxPlayers: 11,
    };
    expect(canContinue(state)).toBe(false);
  });

  it('refuses roster constraints where the maximum is below the minimum', () => {
    const state: DescriptorWizardState = {
      ...initialDescriptorWizard(),
      step: 'participants',
      participantTypes: ['team'],
      minPlayers: 5,
      maxPlayers: 2,
    };
    expect(canContinue(state)).toBe(false);
  });

  it('refuses statistics with none declared', () => {
    const state: DescriptorWizardState = { ...initialDescriptorWizard(), step: 'statistics' };
    expect(canContinue(state)).toBe(false);
  });

  it('refuses an event awarding a statistic that is no longer declared, before submission', () => {
    const state: DescriptorWizardState = {
      ...initialDescriptorWizard(),
      step: 'statistics',
      statistics: [{ code: 'points', label: 'Points', aggregation: 'sum' }],
      eventDefinitions: [
        {
          code: 'goal',
          label: 'Goal',
          category: 'positive',
          actorRequirement: 'side',
          permittedSegmentTypes: [],
          awardsStatisticCode: 'assists',
          awardsDelta: 1,
        },
      ],
    };
    const problems = stepProblems(state);
    expect(problems.map((problem) => problem.id)).toContain(
      'control.descriptor.problemEventUndeclaredStatistic',
    );
  });

  it('accepts an event awarding a statistic that is still declared', () => {
    const state: DescriptorWizardState = {
      ...initialDescriptorWizard(),
      step: 'statistics',
      statistics: [{ code: 'points', label: 'Points', aggregation: 'sum' }],
      eventDefinitions: [
        {
          code: 'goal',
          label: 'Goal',
          category: 'positive',
          actorRequirement: 'side',
          permittedSegmentTypes: [],
          awardsStatisticCode: 'points',
          awardsDelta: 1,
        },
      ],
    };
    expect(canContinue(state)).toBe(true);
  });

  it('refuses formats with none selected', () => {
    const state: DescriptorWizardState = { ...initialDescriptorWizard(), step: 'formats' };
    expect(canContinue(state)).toBe(false);
  });

  it('refuses a segmented win condition naming a segment nothing declared', () => {
    const state: DescriptorWizardState = {
      ...initialDescriptorWizard(),
      step: 'winCondition',
      winConditionMode: 'segmented',
      winMatchUnit: 'set',
      segmentName: 'set',
      segmentTarget: 6,
    };
    expect(canContinue(state)).toBe(false);
  });

  it('accepts a segmented win condition whose segment is declared', () => {
    const state: DescriptorWizardState = {
      ...initialDescriptorWizard(),
      step: 'winCondition',
      winConditionMode: 'segmented',
      segmentTypes: [{ name: 'set', label: 'Set', timed: false }],
      winMatchUnit: 'set',
      segmentName: 'set',
      segmentTarget: 6,
    };
    expect(canContinue(state)).toBe(true);
  });

  it('canSubmit is false unless every step passes, not just the current one', () => {
    const state = withName({ ...initialDescriptorWizard(), alias: 'test-sport' }, 'Test Sport');
    expect(canSubmit(state)).toBe(false);
    expect(canSubmit(completeState())).toBe(true);
  });
});

describe('progress and navigation', () => {
  it('walks forward and backward without going out of bounds', () => {
    const state = initialDescriptorWizard();
    expect(state.step).toBe('name');
    expect(previousStep(state)).toBe('name');
    const second = nextStep(state);
    expect(second).toBe('authorship');
    const last = { ...state, step: 'winCondition' as const };
    expect(nextStep(last)).toBe('winCondition');
  });

  it('reports 1-of-6 through 6-of-6 progress', () => {
    expect(progress(initialDescriptorWizard())).toBe(Math.round((1 / 6) * 100));
    expect(progress({ ...initialDescriptorWizard(), step: 'winCondition' })).toBe(100);
  });
});

describe('buildWinCondition', () => {
  it('composes a bare winMatch action in simple mode, football-shaped', () => {
    const state: DescriptorWizardState = {
      ...initialDescriptorWizard(),
      winConditionMode: 'simple',
      winMatchUnit: 'goals',
    };
    const condition = buildWinCondition(state) as {
      rules: { actions: { type: string; params: { name: string; value: unknown }[] }[] }[];
    };
    expect(condition.rules).toHaveLength(1);
    const actions = condition.rules[0]?.actions ?? [];
    expect(actions.map((action) => action.type)).toEqual(['winMatch']);
    expect(actions[0]?.params.find((p) => p.name === 'unit')?.value).toBe('goals');
  });

  it('composes requireMargin + winSegment + winMatch in segmented mode, tennis-shaped', () => {
    const state: DescriptorWizardState = {
      ...initialDescriptorWizard(),
      winConditionMode: 'segmented',
      segmentMargin: 2,
      segmentName: 'set',
      segmentTarget: 6,
      winMatchUnit: 'set',
      winMatchTarget: 2,
    };
    const condition = buildWinCondition(state) as {
      rules: { actions: { type: string }[] }[];
    };
    expect(condition.rules).toHaveLength(2);
    expect(condition.rules[0]?.actions.map((action) => action.type)).toEqual([
      'requireMargin',
      'winSegment',
    ]);
    expect(condition.rules[1]?.actions.map((action) => action.type)).toEqual(['winMatch']);
  });
});

describe('toAuthoredDocument', () => {
  it('produces a document with the standard field policies auto-attached, never asked as a decision', () => {
    const document = toAuthoredDocument(completeState());
    expect(document.alias).toBe('test-sport');
    expect(document.name).toEqual({ en: 'Test Sport', es: 'Deporte de Prueba' });
    const fieldPolicies = document.fieldPolicies as Record<string, unknown>;
    expect(Object.keys(fieldPolicies).sort()).toEqual(
      [
        'format',
        'registration.capacity',
        'registration.publicOpen',
        'registration.requiresCheckIn',
      ].sort(),
    );
    expect(document.defaults).toEqual({});
    expect(document.notificationRuleCapabilities).toEqual([]);
  });

  it('throws rather than producing a document with no name', () => {
    expect(() => toAuthoredDocument(initialDescriptorWizard())).toThrow();
  });
});

describe('toAuthoredModuleRequest', () => {
  it('wraps the document as a discipline-kind authored module request', () => {
    const request = toAuthoredModuleRequest(completeState());
    expect(request.kind).toBe('discipline');
    expect((request.document as { alias: string }).alias).toBe('test-sport');
  });
});
