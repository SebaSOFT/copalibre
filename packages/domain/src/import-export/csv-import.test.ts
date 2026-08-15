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

  describe('team-membership target', () => {
    it('validates a row naming a known, already-registered team', () => {
      const preview = validateCsvImport({
        target: 'team-membership',
        allowedParticipantTypes: ['team'],
        knownTeamAliases: ['club-atletico'],
        csv: 'teamAlias,alias,displayName,naturalKeyKind,naturalKey\nclub-atletico,maria-perez,Maria Perez,dni,12345678\n',
      });

      expect(preview.valid).toBe(true);
      expect(preview.rows).toEqual([expect.objectContaining({ rowNumber: 2, errors: [] })]);
    });

    it('bypasses discipline participant-type gating entirely', () => {
      const preview = validateCsvImport({
        target: 'team-membership',
        allowedParticipantTypes: [],
        knownTeamAliases: ['club-atletico'],
        csv: 'teamAlias,alias,displayName\nclub-atletico,maria-perez,Maria Perez\n',
      });

      expect(preview.valid).toBe(true);
    });

    it('requires the teamAlias column', () => {
      const preview = validateCsvImport({
        target: 'team-membership',
        allowedParticipantTypes: ['team'],
        knownTeamAliases: [],
        csv: 'alias,displayName\nmaria-perez,Maria Perez\n',
      });

      expect(preview.valid).toBe(false);
      expect(preview.errors).toEqual([
        expect.objectContaining({ message: expect.stringContaining('teamAlias') }),
      ]);
    });

    it('reports a row-level error for a team alias that is not already registered', () => {
      const preview = validateCsvImport({
        target: 'team-membership',
        allowedParticipantTypes: ['team'],
        knownTeamAliases: ['club-atletico'],
        csv: 'teamAlias,alias,displayName\nclub-fantasma,maria-perez,Maria Perez\n',
      });

      expect(preview.valid).toBe(false);
      expect(preview.rows[0]?.errors).toEqual([
        {
          column: 'teamAlias',
          message: expect.stringContaining('club-fantasma'),
        },
      ]);
    });

    it('reports a malformed teamAlias distinctly from an unregistered one', () => {
      const preview = validateCsvImport({
        target: 'team-membership',
        allowedParticipantTypes: ['team'],
        knownTeamAliases: [],
        csv: 'teamAlias,alias,displayName\nCLUB ATLETICO,maria-perez,Maria Perez\n',
      });

      expect(preview.rows[0]?.errors).toEqual([
        { column: 'teamAlias', message: 'teamAlias must be lowercase kebab-case' },
      ]);
    });

    it('reuses the natural-key pairing rule for team-membership rows', () => {
      const preview = validateCsvImport({
        target: 'team-membership',
        allowedParticipantTypes: ['team'],
        knownTeamAliases: ['club-atletico'],
        csv: 'teamAlias,alias,displayName,naturalKeyKind,naturalKey\nclub-atletico,maria-perez,Maria Perez,dni,\n',
      });

      expect(preview.rows[0]?.errors).toEqual([
        {
          column: 'naturalKey',
          message: 'naturalKeyKind and naturalKey must be supplied together',
        },
      ]);
    });

    it('still refuses roster-shaped columns for this target', () => {
      const preview = validateCsvImport({
        target: 'team-membership',
        allowedParticipantTypes: ['team'],
        knownTeamAliases: [],
        csv: 'matchAlias,entrantAlias,playerAlias\nfinal,alpha,maria-perez\n',
      });

      expect(preview.errors).toEqual([
        expect.objectContaining({ message: expect.stringContaining('live match operations') }),
      ]);
    });
  });
});
