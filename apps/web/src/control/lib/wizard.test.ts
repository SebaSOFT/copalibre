import { initialWizard, stepProblems, toCreateRequest } from './wizard.js';

describe('tournament wizard minors choice', () => {
  it('does not preselect whether participants include minors and blocks the first step', () => {
    const state = initialWizard();

    expect(state.includesMinors).toBeUndefined();
    expect(stepProblems(state, []).map((problem) => problem.id)).toContain(
      'control.wizard.problem.chooseMinors',
    );
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
