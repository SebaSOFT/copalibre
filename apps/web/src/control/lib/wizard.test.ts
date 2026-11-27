import { initialWizard, progress, stepProblems, toCreateRequest } from './wizard.js';

describe('tournament wizard minors choice', () => {
  it('does not preselect whether participants include minors and blocks the privacy step', () => {
    const state = { ...initialWizard(), step: 'privacy' as const };

    expect(state.includesMinors).toBeUndefined();
    expect(stepProblems(state, []).map((problem) => problem.id)).toContain(
      'control.wizard.problem.chooseMinors',
    );
    expect(progress(state, false)).toBe(13);
    expect(progress({ ...state, includesMinors: false }, true)).toBe(25);
  });

  it('keeps an explicit no choice and includes it in the create request', () => {
    const state = {
      ...initialWizard(),
      alias: 'copa-verano',
      name: 'Copa Verano',
      descriptorId: 'football',
      descriptorVersion: '1.0.0',
      includesMinors: false,
    };

    expect(stepProblems(state, [])).toEqual([]);
    expect(
      toCreateRequest({
        ...state,
        stages: [{ number: 1, name: 'Groups', format: 'round-robin' }],
      }).includesMinors,
    ).toBe(false);
  });
});
