import { escapeCsvFormulaCell, stringifyCsv } from './csv-export.js';

describe('escapeCsvFormulaCell', () => {
  it.each(['=cmd|"/c calc"!A1', '+1+1', '-1+1', '@SUM(A1:A9)'])(
    'prefixes a value starting with a formula-lead character: %s',
    (value) => {
      expect(escapeCsvFormulaCell(value)).toBe(`'${value}`);
    },
  );

  it('leaves ordinary text unchanged', () => {
    expect(escapeCsvFormulaCell('Club Atlético River')).toBe('Club Atlético River');
  });

  it('leaves text merely containing, not starting with, a formula-lead character unchanged', () => {
    expect(escapeCsvFormulaCell('Team A = Winner')).toBe('Team A = Winner');
  });

  it('leaves an empty string unchanged', () => {
    expect(escapeCsvFormulaCell('')).toBe('');
  });
});

describe('stringifyCsv with escaped cells', () => {
  it('round-trips an escaped formula-shaped name in the produced CSV', () => {
    const csv = stringifyCsv(
      ['alias', 'name'],
      [{ alias: 'team-a', name: escapeCsvFormulaCell("=cmd|'/c calc'!A1") }],
    );
    expect(csv).toContain(`'=cmd|'/c calc'!A1`);
  });
});
