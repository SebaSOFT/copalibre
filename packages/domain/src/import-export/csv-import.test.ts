import { validateCsvImport } from './csv-import.js';

describe('validateCsvImport', () => {
  it('validates declared individual rows', () => {
    const preview = validateCsvImport({
      target: 'individual',
      allowedParticipantTypes: ['individual'],
      csv: 'alias,displayName,naturalKeyKind,naturalKey\nmaria-perez,Maria Perez,dni,12345678\n',
    });

    expect(preview.valid).toBe(true);
    expect(preview.rows).toEqual([expect.objectContaining({ rowNumber: 2, errors: [] })]);
  });

  it('reports row-level fields that need correction', () => {
    const preview = validateCsvImport({
      target: 'individual',
      allowedParticipantTypes: ['individual'],
      csv: 'alias,displayName,naturalKeyKind,naturalKey\nMaria Perez,,dni,\n',
    });

    expect(preview.valid).toBe(false);
    expect(preview.rows[0]?.errors).toEqual([
      { column: 'alias', message: 'Alias must be lowercase kebab-case' },
      { column: 'displayName', message: 'displayName is required' },
      {
        column: 'naturalKey',
        message: 'naturalKeyKind and naturalKey must be supplied together',
      },
    ]);
  });

  it('refuses roster-shaped files', () => {
    const preview = validateCsvImport({
      target: 'team',
      allowedParticipantTypes: ['team'],
      csv: 'matchAlias,entrantAlias,playerAlias\nfinal,alpha,maria-perez\n',
    });

    expect(preview.errors).toEqual([
      expect.objectContaining({ message: expect.stringContaining('live match operations') }),
    ]);
  });

  it('turns malformed CSV into an actionable error', () => {
    const preview = validateCsvImport({
      target: 'team',
      allowedParticipantTypes: ['team'],
      csv: 'alias,name\nalpha,"Alpha\n',
    });

    expect(preview.errors[0]?.message).toMatch(/^Malformed CSV/);
  });
});
