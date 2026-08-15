import { evaluateUpgrade } from './upgrade-check.js';

function installed(alias: string, requiresCopalibre: string) {
  return { alias, version: '1.0.0', requiresCopalibre };
}

describe('evaluateUpgrade', () => {
  it('reports no failures and ok:true when every module is compatible', () => {
    const report = evaluateUpgrade(
      '2.5.0',
      [installed('football', '^2.0.0'), installed('tennis', '^2.0.0')],
      [],
    );
    expect(report).toEqual({ moduleFailures: [], pendingMigrations: [], ok: true });
  });

  it('reports a module incompatible with the target version', () => {
    const report = evaluateUpgrade(
      '3.0.0',
      [installed('football', '^2.0.0'), installed('tennis', '^3.0.0')],
      [],
    );
    expect(report.ok).toBe(false);
    expect(report.moduleFailures).toEqual([
      {
        stage: 'core-version',
        field: 'football@1.0.0',
        message: 'requires CopaLibre ^2.0.0, but this installation runs 3.0.0',
      },
    ]);
  });

  it('reports pending migrations without treating them as a failure', () => {
    const report = evaluateUpgrade(
      '2.0.0',
      [installed('football', '^2.0.0')],
      ['0012-example-migration'],
    );
    expect(report.pendingMigrations).toEqual(['0012-example-migration']);
    expect(report.ok).toBe(true);
  });
});
