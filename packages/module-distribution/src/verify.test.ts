import { evaluateCoreVersionCompatibility } from './verify.js';

function installed(requiresCopalibre: string) {
  return { alias: 'football', version: '1.0.0', requiresCopalibre };
}

describe('evaluateCoreVersionCompatibility (0045)', () => {
  it('returns undefined when the version satisfies the declared range', () => {
    expect(evaluateCoreVersionCompatibility('2.3.0', installed('^2.0.0'))).toBeUndefined();
  });

  it('returns a core-version failure naming the range and the given version', () => {
    const failure = evaluateCoreVersionCompatibility('1.9.0', installed('^2.0.0'));
    expect(failure).toEqual({
      stage: 'core-version',
      message: 'requires CopaLibre ^2.0.0, but this installation runs 1.9.0',
    });
  });

  it('evaluates a target version the installation is not currently running (0045)', () => {
    // The same function call shape used for a pre-upgrade check: the version
    // passed in need not be the version currently installed.
    expect(evaluateCoreVersionCompatibility('3.0.0', installed('^2.0.0'))).toEqual({
      stage: 'core-version',
      message: 'requires CopaLibre ^2.0.0, but this installation runs 3.0.0',
    });
  });

  it('includes prereleases, matching the running-version check', () => {
    expect(
      evaluateCoreVersionCompatibility('2.0.0-beta.1', installed('^2.0.0-beta.0')),
    ).toBeUndefined();
  });
});
