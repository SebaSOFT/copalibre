import {
  canContinue,
  canSubmit,
  formatsFor,
  initialProfileWizard,
  nextStep,
  previousStep,
  progress,
  renumbered,
  stepProblems,
  toAuthoredDocument,
  toAuthoredModuleRequest,
  type ProfileWizardState,
} from './profile-authoring.js';
import type { DisciplineOption } from './wizard.js';

const DISCIPLINES: readonly DisciplineOption[] = [
  {
    descriptorId: 'd-football',
    alias: 'football',
    version: '1.0.0',
    name: 'Football',
    supportedFormats: ['round-robin', 'single-elimination'],
  },
];

function completeState(): ProfileWizardState {
  return {
    ...initialProfileWizard(),
    alias: 'test-cup',
    version: '1.0.0',
    name: { en: 'Test Cup', translations: { es: 'Copa de Prueba' } },
    author: 'Test Author',
    licence: 'AGPL-3.0-only',
    disciplineAlias: 'football',
    stages: [
      { number: 1, name: 'Groups', format: 'round-robin' },
      { number: 2, name: 'Final', format: 'single-elimination' },
    ],
  };
}

describe('profile wizard step gating', () => {
  it('refuses the name step without an alias, version or English name', () => {
    expect(canContinue(initialProfileWizard(), DISCIPLINES)).toBe(false);
  });

  it('accepts a well-formed alias and English name', () => {
    const state: ProfileWizardState = {
      ...initialProfileWizard(),
      alias: 'test-cup',
      name: { en: 'Test Cup', translations: {} },
    };
    expect(canContinue(state, DISCIPLINES)).toBe(true);
  });

  it('refuses authorship without an author or licence', () => {
    const state: ProfileWizardState = { ...initialProfileWizard(), step: 'authorship' };
    expect(canContinue(state, DISCIPLINES)).toBe(false);
  });

  it('refuses stages with no discipline chosen', () => {
    const state: ProfileWizardState = {
      ...initialProfileWizard(),
      step: 'stages',
      stages: [{ number: 1, name: 'Groups', format: 'round-robin' }],
    };
    expect(canContinue(state, DISCIPLINES)).toBe(false);
  });

  it('refuses stages with none declared', () => {
    const state: ProfileWizardState = {
      ...initialProfileWizard(),
      step: 'stages',
      disciplineAlias: 'football',
    };
    expect(canContinue(state, DISCIPLINES)).toBe(false);
  });

  it('refuses a stage format the chosen discipline does not declare, before submission', () => {
    const state: ProfileWizardState = {
      ...initialProfileWizard(),
      step: 'stages',
      disciplineAlias: 'football',
      stages: [{ number: 1, name: 'Playoffs', format: 'league' }],
    };
    const problems = stepProblems(state, DISCIPLINES);
    expect(problems.map((problem) => problem.id)).toContain('control.profile.problemStageFormat');
  });

  it('accepts stages whose formats the chosen discipline declares', () => {
    const state: ProfileWizardState = {
      ...initialProfileWizard(),
      step: 'stages',
      disciplineAlias: 'football',
      stages: [{ number: 1, name: 'Groups', format: 'round-robin' }],
    };
    expect(canContinue(state, DISCIPLINES)).toBe(true);
  });

  it('refuses negative points', () => {
    const state: ProfileWizardState = {
      ...initialProfileWizard(),
      step: 'points',
      pointsWin: -1,
    };
    expect(canContinue(state, DISCIPLINES)).toBe(false);
  });

  it('canSubmit is false unless every step passes, not just the current one', () => {
    const partial: ProfileWizardState = {
      ...initialProfileWizard(),
      alias: 'test-cup',
      name: { en: 'Test Cup', translations: {} },
    };
    expect(canSubmit(partial, DISCIPLINES)).toBe(false);
    expect(canSubmit(completeState(), DISCIPLINES)).toBe(true);
  });
});

describe('renumbered', () => {
  it('keeps a contiguous 1-based sequence after a stage in the middle is removed', () => {
    const stages = renumbered([
      { number: 1, name: 'A', format: 'round-robin' },
      { number: 2, name: 'B', format: 'round-robin' },
      { number: 3, name: 'C', format: 'round-robin' },
    ]);
    const withoutB = renumbered(stages.filter((stage) => stage.name !== 'B'));
    expect(withoutB.map((stage) => stage.number)).toEqual([1, 2]);
    expect(withoutB.map((stage) => stage.name)).toEqual(['A', 'C']);
  });

  it('assigns the next contiguous number to a newly added stage', () => {
    const stages = renumbered([{ number: 1, name: 'A', format: 'round-robin' }]);
    const withB = renumbered([...stages, { number: 99, name: 'B', format: 'round-robin' }]);
    expect(withB.map((stage) => stage.number)).toEqual([1, 2]);
  });
});

describe('formatsFor', () => {
  it('reads the chosen discipline’s declared formats, never a hardcoded list', () => {
    expect(formatsFor(DISCIPLINES, 'football')).toEqual(['round-robin', 'single-elimination']);
  });

  it('is empty for an alias naming no known discipline', () => {
    expect(formatsFor(DISCIPLINES, 'unknown')).toEqual([]);
  });
});

describe('progress and navigation', () => {
  it('walks forward and backward without going out of bounds', () => {
    const state = initialProfileWizard();
    expect(previousStep(state)).toBe('name');
    expect(nextStep(state)).toBe('authorship');
    const last = { ...state, step: 'points' as const };
    expect(nextStep(last)).toBe('points');
  });

  it('reports progress across the four steps', () => {
    expect(progress(initialProfileWizard())).toBe(25);
    expect(progress({ ...initialProfileWizard(), step: 'points' })).toBe(100);
  });
});

describe('toAuthoredDocument', () => {
  it('produces a profile document naming no discipline — the schema is discipline-neutral', () => {
    const document = toAuthoredDocument(completeState());
    expect(document.alias).toBe('test-cup');
    expect(document).not.toHaveProperty('disciplineAlias');
    expect(document.stages).toEqual([
      { number: 1, name: 'Groups', format: 'round-robin' },
      { number: 2, name: 'Final', format: 'single-elimination' },
    ]);
    expect(document.points).toEqual({ win: 3, draw: 1, loss: 0 });
  });

  it('throws rather than producing a document with no name', () => {
    expect(() => toAuthoredDocument(initialProfileWizard())).toThrow();
  });
});

describe('toAuthoredModuleRequest', () => {
  it('carries disciplineAlias on the request only, for the server’s format check', () => {
    const request = toAuthoredModuleRequest(completeState());
    expect(request.kind).toBe('tournament-profile');
    expect(request.disciplineAlias).toBe('football');
    expect(request.document).not.toHaveProperty('disciplineAlias');
  });
});
