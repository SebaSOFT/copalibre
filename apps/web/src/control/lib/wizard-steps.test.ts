import { nextStepId, previousStepId, stepProgress } from './wizard-steps.js';

const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as const;

describe('nextStepId', () => {
  it('advances to the following step', () => {
    expect(nextStepId(steps, 'a')).toBe('b');
    expect(nextStepId(steps, 'b')).toBe('c');
  });

  it('clamps at the last step', () => {
    expect(nextStepId(steps, 'c')).toBe('c');
  });
});

describe('previousStepId', () => {
  it('retreats to the preceding step', () => {
    expect(previousStepId(steps, 'c')).toBe('b');
    expect(previousStepId(steps, 'b')).toBe('a');
  });

  it('clamps at the first step', () => {
    expect(previousStepId(steps, 'a')).toBe('a');
  });
});

describe('stepProgress', () => {
  it('reports the percentage of steps completed, rounded', () => {
    expect(stepProgress(steps, 'a')).toBe(33);
    expect(stepProgress(steps, 'b')).toBe(67);
    expect(stepProgress(steps, 'c')).toBe(100);
  });
});
