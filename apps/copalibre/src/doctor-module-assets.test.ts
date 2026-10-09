import { evaluateModuleAssets } from './doctor-module-assets.js';

describe('evaluateModuleAssets', () => {
  it('passes when every asset is recorded under the active profile and readable', () => {
    expect(evaluateModuleAssets({ inspected: 2, problems: [] })).toEqual({
      name: 'data:module-assets',
      status: 'pass',
      message: expect.stringContaining('2 installed module asset(s)'),
    });
  });

  it('warns with the module, the asset, both profiles and the remedy on a mismatch', () => {
    const check = evaluateModuleAssets({
      inspected: 1,
      problems: [
        {
          alias: 'rink-hockey',
          version: '1.0.0',
          path: 'background.jpg',
          problem: {
            kind: 'profile-mismatch',
            recordedProfile: 'filesystem',
            activeProfile: 's3',
          },
        },
      ],
    });

    expect(check.status).toBe('warn');
    expect(check.message).toContain('rink-hockey@1.0.0 background.jpg');
    expect(check.message).toContain('"filesystem"');
    expect(check.message).toContain('"s3"');
    expect(check.message).toContain('add the module again');
  });

  it('warns on a missing object and names only the error class, never a credential', () => {
    const check = evaluateModuleAssets({
      inspected: 1,
      problems: [
        {
          alias: 'rink-hockey',
          version: '1.0.0',
          path: 'background.jpg',
          problem: {
            kind: 'unreadable',
            recordedProfile: 's3',
            activeProfile: 's3',
            reason: 'NoSuchKey',
          },
        },
      ],
    });

    expect(check.status).toBe('warn');
    expect(check.message).toContain('missing or unreadable');
    expect(check.message).toContain('NoSuchKey');
    // It names the variables to set, never a value: no URL and no assignment.
    expect(check.message).not.toMatch(/https?:|=/);
  });

  it('truncates the sample past five problems', () => {
    const problems = Array.from({ length: 7 }, (_, index) => ({
      alias: `module-${index}`,
      version: '1.0.0',
      path: 'logo.png',
      problem: {
        kind: 'profile-mismatch' as const,
        recordedProfile: 'filesystem',
        activeProfile: 's3',
      },
    }));
    const check = evaluateModuleAssets({ inspected: 7, problems });

    expect(check.message).toContain('7 module asset(s)');
    expect(check.message).toContain('module-4@');
    expect(check.message).not.toContain('module-5@');
    expect(check.message).toContain('…');
  });
});
