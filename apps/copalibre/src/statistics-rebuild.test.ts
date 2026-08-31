import { parseStatisticsRebuildOptions } from './statistics-rebuild.js';

describe('parseStatisticsRebuildOptions', () => {
  it('parses an organization-scoped rebuild', () => {
    expect(parseStatisticsRebuildOptions(['--organization', 'liga-sanjuanina'])).toEqual({
      organization: 'liga-sanjuanina',
    });
  });

  it('narrows to one tournament when --tournament is given', () => {
    expect(
      parseStatisticsRebuildOptions([
        '--organization',
        'liga-sanjuanina',
        '--tournament',
        'torneo-apertura',
      ]),
    ).toEqual({ organization: 'liga-sanjuanina', tournament: 'torneo-apertura' });
  });

  it('requires --organization', () => {
    expect(() => parseStatisticsRebuildOptions([])).toThrow('--organization is required');
  });

  it('refuses an unrecognized flag', () => {
    expect(() =>
      parseStatisticsRebuildOptions(['--organization', 'liga-sanjuanina', '--unknown']),
    ).toThrow();
  });
});
