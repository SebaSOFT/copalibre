import {
  addCustomRule,
  canAddCustomRule,
  canContinue,
  elementOptionsKey,
  formatsFor,
  initialWizard,
  nextStep,
  parameterValueKey,
  previousStep,
  progress,
  removeCustomRule,
  stepProblems,
  toCreateRequest,
  type DisciplineOption,
  type WizardState,
} from './lib/wizard.js';
import type { HookScriptVocabulary } from './lib/api-client.js';
import {
  LOCK_EXPLANATION,
  initialReview,
  pageCount,
  teamMembershipActionsEnabled,
  setFilter,
  toggleAllVisible,
  toggleRow,
  visibleRows,
  type RegistrationRow,
} from './lib/review.js';
import { mutationFeedback } from './lib/mutation-feedback.js';

const DISCIPLINES: readonly DisciplineOption[] = [
  {
    descriptorId: 'd-football',
    version: '1.2.0',
    name: 'Fútbol 11',
    supportedFormats: ['single-elimination', 'round-robin'],
  },
  {
    descriptorId: 'd-swimming',
    version: '2.0.0',
    name: 'Natación',
    supportedFormats: ['placement'],
  },
];

/** A discipline offering a real placement format, for the series refusal. */
const PLACEMENT_DISCIPLINES: readonly DisciplineOption[] = [
  {
    descriptorId: 'd-placement',
    version: '1.0.0',
    name: 'Atletismo',
    supportedFormats: ['free-for-all', 'heats'],
  },
];

const HOOK_VOCABULARY: HookScriptVocabulary = {
  hooks: ['event.recorded'],
  entries: [
    {
      kind: 'action',
      type: 'notify',
      description: 'Declare notification',
      authoring: {
        parameters: [
          {
            name: 'title',
            description: 'Notification title',
            required: true,
            parameterTypes: ['simple_string'],
            allowExpression: true,
            valueSchema: { type: 'string', minLength: 1 },
          },
          {
            name: 'message',
            description: 'Notification message',
            required: true,
            parameterTypes: ['simple_string'],
            allowExpression: true,
            valueSchema: { type: 'string', minLength: 1 },
          },
        ],
      },
    },
  ],
};

function wizard(overrides: Partial<WizardState> = {}): WizardState {
  return { ...initialWizard(), ...overrides };
}

describe('the wizard gates each step', () => {
  it('will not leave the name step without a name and a valid alias', () => {
    expect(stepProblems(wizard(), DISCIPLINES).map((problem) => problem.id)).toContain(
      'control.wizard.problem.missingName',
    );
    expect(
      stepProblems(wizard({ name: 'Copa', alias: 'Copa Verano' }), DISCIPLINES).map(
        (problem) => problem.id,
      ),
    ).toContain('control.wizard.problem.aliasFormat');
    expect(canContinue(wizard({ name: 'Copa', alias: 'copa-verano' }), DISCIPLINES)).toBe(true);
  });

  it('will not leave the discipline step unchosen', () => {
    expect(canContinue(wizard({ step: 'discipline' }), DISCIPLINES)).toBe(false);
    expect(
      canContinue(wizard({ step: 'discipline', descriptorId: 'd-football' }), DISCIPLINES),
    ).toBe(true);
  });

  it('offers only the formats the chosen discipline declares', () => {
    // Never a client-side list: it disagrees with the installation the day a
    // module is added.
    expect(formatsFor(DISCIPLINES, 'd-football')).toEqual(['single-elimination', 'round-robin']);
    expect(formatsFor(DISCIPLINES, 'd-swimming')).toEqual(['placement']);
    expect(formatsFor(DISCIPLINES, 'unknown')).toEqual([]);
  });

  it('catches a format left over from a discipline the operator changed', () => {
    const stale = wizard({
      step: 'format',
      descriptorId: 'd-swimming',
      format: 'round-robin',
    });

    expect(stepProblems(stale, DISCIPLINES).map((problem) => problem.id)).toEqual([
      'control.wizard.problem.formatNotSupported',
    ]);
  });

  it('refuses a tournament nobody could play', () => {
    expect(stepProblems(wizard({ step: 'window', capacity: 1 }), DISCIPLINES)).toHaveLength(1);
    expect(canContinue(wizard({ step: 'window', capacity: 8 }), DISCIPLINES)).toBe(true);
    expect(canContinue(wizard({ step: 'window' }), DISCIPLINES)).toBe(true);
  });

  it('moves between steps and stops at the ends', () => {
    expect(nextStep(wizard())).toBe('discipline');
    expect(previousStep(wizard({ step: 'discipline' }))).toBe('name');
    expect(previousStep(wizard())).toBe('name');
    expect(nextStep(wizard({ step: 'window' }))).toBe('window');
    expect(progress(wizard())).toBe(20);
    expect(progress(wizard({ step: 'window' }))).toBe(100);
  });

  it('submits the descriptor version, which the ruleset freezes', () => {
    // A ruleset tracking "latest" would change under a tournament being played.
    const request = toCreateRequest(
      wizard({
        alias: 'copa-verano',
        name: 'Copa Verano',
        descriptorId: 'd-football',
        descriptorVersion: '1.2.0',
        format: 'round-robin',
        publicRegistration: true,
        requiresCheckIn: true,
      }),
    );

    expect(request).toEqual({
      alias: 'copa-verano',
      name: 'Copa Verano',
      descriptorId: 'd-football',
      descriptorVersion: '1.2.0',
      format: 'round-robin',
      publicRegistration: true,
      requiresCheckIn: true,
      customScripts: [],
    });
  });

  it('refuses to submit an incomplete wizard', () => {
    expect(() => toCreateRequest(wizard())).toThrow('not complete');
  });

  describe('series declaration (0159)', () => {
    const complete = {
      alias: 'copa-verano',
      name: 'Copa Verano',
      descriptorId: 'd-football',
      descriptorVersion: '1.2.0',
      format: 'round-robin',
    } as const;

    it('submits a declared series alongside the rest of the request', () => {
      const request = toCreateRequest(
        wizard({
          ...complete,
          seriesEnabled: true,
          seriesSpan: 5,
          seriesResolutionClass: 'best-of',
          seriesNeutralGround: true,
        }),
      );

      expect(request.series).toEqual({
        span: 5,
        resolutionClass: 'best-of',
        neutralGround: true,
      });
    });

    it('omits neutralGround rather than sending false, so an untouched toggle adds nothing', () => {
      const request = toCreateRequest(
        wizard({
          ...complete,
          seriesEnabled: true,
          seriesSpan: 3,
          seriesResolutionClass: 'best-of',
        }),
      );

      expect(request.series).toEqual({ span: 3, resolutionClass: 'best-of' });
    });

    it('drops a series left configured but switched back off', () => {
      const request = toCreateRequest(
        wizard({
          ...complete,
          seriesEnabled: false,
          seriesSpan: 5,
          seriesResolutionClass: 'best-of',
        }),
      );

      expect('series' in request).toBe(false);
    });

    it('preselects match grain, sending no standingsAccounting key when untouched (0160)', () => {
      expect(initialWizard().seriesStandingsAccounting).toBe('match');

      const request = toCreateRequest(
        wizard({
          ...complete,
          seriesEnabled: true,
          seriesSpan: 3,
          seriesResolutionClass: 'best-of',
        }),
      );

      // Byte-identical to the request a wizard authored before this control
      // existed: no `standingsAccounting` key, not one explicitly set to `match`.
      expect(request.series).toEqual({ span: 3, resolutionClass: 'best-of' });
    });

    it('sends standingsAccounting only once the operator declares series grain (0160)', () => {
      const request = toCreateRequest(
        wizard({
          ...complete,
          seriesEnabled: true,
          seriesSpan: 5,
          seriesResolutionClass: 'best-of',
          seriesStandingsAccounting: 'series',
        }),
      );

      expect(request.series).toEqual({
        span: 5,
        resolutionClass: 'best-of',
        standingsAccounting: 'series',
      });
    });

    it('refuses a series on a placement format, naming the two-sides reason', () => {
      const problems = stepProblems(
        wizard({
          ...complete,
          step: 'format',
          descriptorId: 'd-placement',
          format: 'free-for-all',
          seriesEnabled: true,
          seriesSpan: 3,
          seriesResolutionClass: 'best-of',
        }),
        PLACEMENT_DISCIPLINES,
      ).map((problem) => problem.id);

      expect(problems).toContain('control.wizard.problem.seriesOnPlacementFormat');
    });

    it('refuses an even-span best-of but accepts the same span as an aggregate', () => {
      const evenBestOf = wizard({
        ...complete,
        step: 'format',
        seriesEnabled: true,
        seriesSpan: 4,
        seriesResolutionClass: 'best-of',
      });
      expect(stepProblems(evenBestOf, DISCIPLINES).map((p) => p.id)).toContain(
        'control.wizard.problem.seriesEvenBestOf',
      );
      expect(canContinue(evenBestOf, DISCIPLINES)).toBe(false);

      // The same even span is coherent for the classes the refusal points at.
      expect(canContinue({ ...evenBestOf, seriesResolutionClass: 'aggregate' }, DISCIPLINES)).toBe(
        true,
      );
    });

    it('refuses a span below two', () => {
      const problems = stepProblems(
        wizard({
          ...complete,
          step: 'format',
          seriesEnabled: true,
          seriesSpan: 1,
          seriesResolutionClass: 'best-of',
        }),
        DISCIPLINES,
      ).map((problem) => problem.id);

      expect(problems).toContain('control.wizard.problem.seriesSpan');
    });

    it('leaves the format step unblocked when no series is declared', () => {
      expect(canContinue(wizard({ ...complete, step: 'format' }), DISCIPLINES)).toBe(true);
    });
  });

  it('validates schema-driven parameters and composes multiple conditionless rules', () => {
    const titleKey = parameterValueKey('action', 'notify', 'title');
    const messageKey = parameterValueKey('action', 'notify', 'message');
    let state = wizard({
      step: 'rules',
      customRuleEnabled: true,
      customRuleActionType: 'notify',
      customRuleValues: { [titleKey]: 'Match update' },
    });
    expect(canContinue(state, DISCIPLINES, HOOK_VOCABULARY)).toBe(false);

    state = {
      ...state,
      customRuleValues: { ...state.customRuleValues, [messageKey]: '{{ event.definitionCode }}' },
    };
    expect(canContinue(state, DISCIPLINES, HOOK_VOCABULARY)).toBe(true);
    state = addCustomRule(state, HOOK_VOCABULARY);
    expect(state.customRules).toHaveLength(1);

    state = {
      ...state,
      customRuleActionType: 'notify',
      customRuleValues: { [titleKey]: 'Second', [messageKey]: 'Second rule' },
      alias: 'copa-reglas',
      name: 'Copa Reglas',
      descriptorId: 'd-football',
      descriptorVersion: '1.2.0',
      format: 'round-robin',
    };
    const scripts = toCreateRequest(state, HOOK_VOCABULARY).customScripts;
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.script['rules'] as readonly unknown[] | undefined).toHaveLength(2);
  });

  it('guards adding incomplete drafts and removes only the selected saved rule', () => {
    const incomplete = wizard({ customRuleEnabled: true });
    expect(canAddCustomRule(incomplete, HOOK_VOCABULARY)).toBe(false);
    expect(() => addCustomRule(incomplete, HOOK_VOCABULARY)).toThrow('not complete');

    const saved = wizard({
      customRules: [
        { actionType: 'notify', values: {}, options: {} },
        { actionType: 'startTimer', values: {}, options: {} },
      ],
    });
    expect(removeCustomRule(saved, 0).customRules).toEqual([
      { actionType: 'startTimer', values: {}, options: {} },
    ]);
  });

  it('serializes numeric schemas, optional blanks, and non-object option JSON safely', () => {
    const vocabulary: HookScriptVocabulary = {
      hooks: ['event.recorded'],
      entries: [
        {
          kind: 'condition',
          type: 'configured',
          description: 'Configured condition',
          authoring: { parameters: [], optionsSchema: {} },
        },
        {
          kind: 'action',
          type: 'startTimer',
          description: 'Start timer',
          authoring: {
            parameters: [
              {
                name: 'timerId',
                description: 'Timer identifier',
                required: true,
                parameterTypes: ['simple_string'],
                allowExpression: false,
                valueSchema: { type: 'string', minLength: 1 },
              },
              {
                name: 'durationSeconds',
                description: 'Duration',
                required: true,
                parameterTypes: ['simple_number'],
                allowExpression: false,
                valueSchema: { type: 'number', exclusiveMinimum: 0 },
              },
              {
                name: 'label',
                description: 'Optional label',
                required: false,
                parameterTypes: ['simple_string'],
                allowExpression: false,
                valueSchema: { type: 'string' },
              },
            ],
          },
        },
      ],
    };
    const timerKey = parameterValueKey('action', 'startTimer', 'timerId');
    const durationKey = parameterValueKey('action', 'startTimer', 'durationSeconds');
    const state = wizard({
      alias: 'copa-reglas',
      name: 'Copa Reglas',
      descriptorId: 'd-football',
      descriptorVersion: '1.2.0',
      format: 'round-robin',
      customRuleEnabled: true,
      customRuleConditionType: 'configured',
      customRuleActionType: 'startTimer',
      customRuleValues: { [timerKey]: 'discipline-clock', [durationKey]: '30' },
      customRuleOptions: {
        [elementOptionsKey('condition', 'configured')]: '"primitive"',
      },
    });

    expect(canAddCustomRule(state, vocabulary)).toBe(true);
    const scripts = toCreateRequest(state, vocabulary).customScripts;
    const rules = scripts[0]?.script['rules'] as
      | readonly {
          conditions: readonly unknown[];
          actions: readonly { params: readonly unknown[] }[];
        }[]
      | undefined;
    expect(rules?.[0]?.conditions).toEqual([
      expect.objectContaining({ type: 'configured', options: {} }),
    ]);
    expect(rules?.[0]?.actions[0]?.params).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'durationSeconds', value: 30 })]),
    );
    expect(rules?.[0]?.actions[0]?.params).toHaveLength(2);
  });
});

const ROWS: readonly RegistrationRow[] = [
  { entrantId: 'e-1', displayName: 'Talleres', status: 'pending', submittedAt: '2026-07-01' },
  { entrantId: 'e-2', displayName: 'Casa de Italia', status: 'pending', submittedAt: '2026-07-02' },
  { entrantId: 'e-3', displayName: 'San Martín', status: 'accepted', submittedAt: '2026-07-03' },
];

describe('the review table', () => {
  it('filters by status and resets to the first page', () => {
    const state = setFilter(initialReview(), 'pending', ROWS);

    expect(visibleRows(ROWS, state).map((row) => row.entrantId)).toEqual(['e-1', 'e-2']);
    expect(state.page).toBe(1);
  });

  it('drops a selection the new filter hides', () => {
    // "Approve selected" acting on rows nobody can see is the bulk action
    // nobody can explain afterwards.
    const selected = toggleRow(initialReview(), 'e-3');
    const filtered = setFilter(selected, 'pending', ROWS);

    expect(selected.selected).toEqual(['e-3']);
    expect(filtered.selected).toEqual([]);
  });

  it('selects and deselects one row', () => {
    const once = toggleRow(initialReview(), 'e-1');

    expect(once.selected).toEqual(['e-1']);
    expect(toggleRow(once, 'e-1').selected).toEqual([]);
  });

  it('selects everything visible, and only that', () => {
    const filtered = setFilter(initialReview(), 'pending', ROWS);
    const all = toggleAllVisible(filtered, ROWS);

    expect(all.selected).toEqual(['e-1', 'e-2']);
    expect(toggleAllVisible(all, ROWS).selected).toEqual([]);
  });

  it('paginates', () => {
    const small = { ...initialReview(2), page: 2 };

    expect(visibleRows(ROWS, small).map((row) => row.entrantId)).toEqual(['e-3']);
    expect(pageCount(ROWS, small)).toBe(2);
    expect(pageCount([], small)).toBe(1);
  });
});

describe('the eligibility lock, as the console shows it', () => {
  const closed = {
    requiresCheckIn: true,
    checkInClosesAt: '2026-08-01T18:00:00.000Z',
    status: 'checked-in' as const,
  };

  it('disables team-membership actions once check-in has closed', () => {
    expect(teamMembershipActionsEnabled({ ...closed, now: '2026-08-01T19:00:00.000Z' })).toBe(
      false,
    );
    expect(LOCK_EXPLANATION.id).toBe('control.review.lockExplanation');
  });

  it('leaves them enabled before it closes, and when nothing requires check-in', () => {
    expect(teamMembershipActionsEnabled({ ...closed, now: '2026-08-01T17:00:00.000Z' })).toBe(true);
    expect(
      teamMembershipActionsEnabled({
        requiresCheckIn: false,
        status: 'checked-in',
        now: '2030-01-01',
      }),
    ).toBe(true);
    expect(
      teamMembershipActionsEnabled({
        ...closed,
        status: 'accepted',
        now: '2026-08-01T19:00:00.000Z',
      }),
    ).toBe(true);
    expect(
      teamMembershipActionsEnabled({
        requiresCheckIn: true,
        status: 'checked-in',
        now: '2030-01-01',
      }),
    ).toBe(true);
  });
});

describe('mutation-classification feedback', () => {
  it('blocks result-sensitive edits once results exist', () => {
    expect(
      mutationFeedback({
        mutationClass: 'blocked_after_results',
        hasRecordedResults: true,
      }),
    ).toEqual({
      kind: 'blocked',
      descriptor: expect.objectContaining({ id: 'control.mutation.blockedAfterResults' }),
    });
  });

  it('warns for rebuild edits and stays silent for safe edits', () => {
    expect(
      mutationFeedback({
        mutationClass: 'requires_rebuild',
        hasRecordedResults: false,
        invalidatedFixtureCount: 3,
      }),
    ).toEqual({
      kind: 'warning',
      descriptor: expect.objectContaining({ id: 'control.mutation.requiresRebuild' }),
      values: { count: 3 },
    });
    expect(mutationFeedback({ mutationClass: 'safe', hasRecordedResults: true })).toEqual({
      kind: 'none',
    });
  });
});
